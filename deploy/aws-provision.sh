#!/usr/bin/env bash
# Creates ONE free-tier EC2 server for the portal, with guards so the bill can't run away:
#   - free-tier instance type only, "standard" CPU credits (no surprise CPU charges)
#   - 30 GB disk (the free-tier maximum), no RDS, no load balancer, no autoscaling
#   - CloudWatch alarm: stops the server if outgoing traffic in a day goes over a cap
#   - AWS Budget: emails you as soon as any cost appears
#   - SSH open only to this computer's IP
# Usage: deploy/aws-provision.sh you@example.com   (region: AWS_REGION, default ap-south-1 Mumbai)
set -euo pipefail
EMAIL="${1:?Give the email address for cost alerts}"
export AWS_REGION="${AWS_REGION:-ap-south-1}"
AWS=~/.local/bin/aws
NAME=bigbang-portal
STATE=~/.config/bigbang-aws && mkdir -p "$STATE"
KEY=~/.ssh/bigbang-aws.pem
DAILY_OUT_GB="${DAILY_OUT_GB:-3}"   # 3 GB/day ≈ 90 GB/month, under the 100 GB free allowance

ACCOUNT=$($AWS sts get-caller-identity --query Account --output text)
echo "Account $ACCOUNT, region $AWS_REGION"

# Free-tier instance type for this account and region (t3.micro or t2.micro).
TYPE=$($AWS ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true \
  --query "InstanceTypes[?InstanceType=='t3.micro' || InstanceType=='t2.micro'].InstanceType | sort(@) | [-1]" --output text)
[ "$TYPE" = "None" ] || [ -z "$TYPE" ] && { echo "No free-tier t2/t3.micro in $AWS_REGION"; exit 1; }
echo "Instance type: $TYPE"

AMI=$($AWS ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text)

if [ ! -f "$KEY" ]; then
  $AWS ec2 create-key-pair --key-name $NAME --key-type ed25519 --query KeyMaterial --output text > "$KEY"
  chmod 600 "$KEY"
fi

MYIP=$(curl -s https://checkip.amazonaws.com)
VPC=$($AWS ec2 describe-vpcs --filters Name=is-default,Values=true --query "Vpcs[0].VpcId" --output text)
SG=$($AWS ec2 describe-security-groups --filters Name=group-name,Values=$NAME Name=vpc-id,Values=$VPC --query "SecurityGroups[0].GroupId" --output text)
if [ "$SG" = "None" ]; then
  SG=$($AWS ec2 create-security-group --group-name $NAME --description "BIG BANG portal: web + ssh from admin" --vpc-id $VPC --query GroupId --output text)
  $AWS ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 80 --cidr 0.0.0.0/0 >/dev/null
  $AWS ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 443 --cidr 0.0.0.0/0 >/dev/null
fi
$AWS ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 22 --cidr "$MYIP/32" >/dev/null 2>&1 || true

ID=$($AWS ec2 describe-instances --filters Name=tag:Name,Values=$NAME Name=instance-state-name,Values=pending,running,stopped \
  --query "Reservations[0].Instances[0].InstanceId" --output text)
if [ "$ID" = "None" ]; then
  ID=$($AWS ec2 run-instances --image-id "$AMI" --instance-type "$TYPE" --key-name $NAME --security-group-ids $SG \
    --credit-specification CpuCredits=standard \
    --metadata-options HttpTokens=required,HttpEndpoint=enabled \
    --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=true}' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
    --query "Instances[0].InstanceId" --output text)
  echo "Created $ID, waiting for it to start…"
  $AWS ec2 wait instance-running --instance-ids $ID
fi

# A fixed public address, so the web address never changes.
EIP=$($AWS ec2 describe-addresses --filters Name=tag:Name,Values=$NAME --query "Addresses[0].PublicIp" --output text)
if [ "$EIP" = "None" ]; then
  ALLOC=$($AWS ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME}]" --query AllocationId --output text)
  $AWS ec2 associate-address --instance-id $ID --allocation-id $ALLOC >/dev/null
  EIP=$($AWS ec2 describe-addresses --allocation-ids $ALLOC --query "Addresses[0].PublicIp" --output text)
fi

# Guard 1: stop the server if it sends more than DAILY_OUT_GB in a day (an attack or a flood).
$AWS cloudwatch put-metric-alarm --alarm-name "$NAME-traffic-cap" \
  --alarm-description "Stops the portal if daily outgoing traffic exceeds ${DAILY_OUT_GB} GB (protects the free tier)" \
  --namespace AWS/EC2 --metric-name NetworkOut --dimensions Name=InstanceId,Value=$ID \
  --statistic Sum --period 86400 --evaluation-periods 1 --threshold $((DAILY_OUT_GB * 1024 * 1024 * 1024)) \
  --comparison-operator GreaterThanThreshold --treat-missing-data notBreaching \
  --alarm-actions "arn:aws:automate:$AWS_REGION:ec2:stop"
# Guard 2: if the machine itself fails, AWS recovers it (no cost).
$AWS cloudwatch put-metric-alarm --alarm-name "$NAME-auto-recover" \
  --namespace AWS/EC2 --metric-name StatusCheckFailed_System --dimensions Name=InstanceId,Value=$ID \
  --statistic Maximum --period 60 --evaluation-periods 2 --threshold 0 --comparison-operator GreaterThanThreshold \
  --alarm-actions "arn:aws:automate:$AWS_REGION:ec2:recover"

# Guard 3: email the moment the account costs anything at all.
cat > "$STATE/budget.json" <<JSON
{"BudgetName":"$NAME-zero-spend","BudgetLimit":{"Amount":"1","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}
JSON
cat > "$STATE/notify.json" <<JSON
[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":1,"ThresholdType":"PERCENTAGE"},
  "Subscribers":[{"SubscriptionType":"EMAIL","Address":"$EMAIL"}]},
 {"Notification":{"NotificationType":"FORECASTED","ComparisonOperator":"GREATER_THAN","Threshold":100,"ThresholdType":"PERCENTAGE"},
  "Subscribers":[{"SubscriptionType":"EMAIL","Address":"$EMAIL"}]}]
JSON
$AWS budgets create-budget --account-id "$ACCOUNT" --budget "file://$STATE/budget.json" \
  --notifications-with-subscribers "file://$STATE/notify.json" 2>/dev/null || echo "(budget already exists)"

DOMAIN="$(echo "$EIP" | tr . -).sslip.io"
cat > "$STATE/server.env" <<ENV
INSTANCE_ID=$ID
PUBLIC_IP=$EIP
DOMAIN=$DOMAIN
REGION=$AWS_REGION
KEY=$KEY
ENV
echo
echo "Server: $ID ($TYPE) at $EIP"
echo "Web address will be: https://$DOMAIN"
echo "Saved to $STATE/server.env. Next: deploy/deploy.sh --first"
