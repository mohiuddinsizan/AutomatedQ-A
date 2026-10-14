import { LoginScreen, StaffLink } from "@/components/LoginScreen";

export const metadata = { title: "Teacher sign in" };

export default function TeacherLogin() {
  return (
    <LoginScreen
      portal="teacher"
      title="Teacher sign in"
      intro="Answer the questions students have sent to an expert."
      usernameLabel="Username"
      footer={<>Your account is created by the admin. Students <StaffLink href="/login">sign in here</StaffLink>.</>}
    />
  );
}
