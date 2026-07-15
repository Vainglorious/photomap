import { login } from "@/app/actions/auth";
import AuthForm from "@/components/auth/AuthForm";
import { isGoogleConfigured } from "@/lib/google";

// Reads a session cookie via the action; never prerender.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <AuthForm mode="login" action={login} googleEnabled={isGoogleConfigured()} />
    </main>
  );
}
