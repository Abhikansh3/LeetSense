import { AuthScreen } from "@/components/AuthScreen";

// Kept as its own route so existing /register links still work; it opens the
// same screen with the sign-up tab selected.
export default function RegisterPage() {
  return <AuthScreen initialMode="signup" />;
}
