import { LoginScreen } from "@/components/LoginScreen";

export const metadata = { title: "Admin sign in" };

export default function AdminLogin() {
  return (
    <LoginScreen
      portal="admin"
      title="Admin sign in"
      intro="Manage students, courses, questions and mentor sessions."
      usernameLabel="Username"
    />
  );
}
