import { LoginScreen } from "@/components/LoginScreen";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Student sign in" };

export default function StudentLogin() {
  return (
    <LoginScreen
      portal="student"
      title="Student sign in"
      intro="See your results, ask questions and book mentor sessions for your courses."
      usernameLabel="Roll number"
      passwordHint="First time here? Your password is the phone number registered with your roll."
      footer={<>Forgot your password? Message us on WhatsApp ({BRAND.phone}) and we&apos;ll reset it.</>}
    />
  );
}
