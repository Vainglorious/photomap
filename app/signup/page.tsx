import { signup } from "@/app/actions/auth";
import AuthForm from "@/components/auth/AuthForm";
import { isGoogleConfigured } from "@/lib/google";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <AuthForm mode="signup" action={signup} googleEnabled={isGoogleConfigured()} />
    </main>
  );
}
