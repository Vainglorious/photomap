"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/actions/auth";

/**
 * Email/password form shared by the login and signup pages. The server action is
 * passed in as a prop (mode decides copy and links). Google, when configured, is
 * a plain link to the OAuth start route — no client JS needed.
 */
export default function AuthForm({
  mode,
  action,
  googleEnabled,
}: {
  mode: "login" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  googleEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isSignup = mode === "signup";

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-xl">
      <h1 className="text-xl font-semibold tracking-tight">
        {isSignup ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-1 text-sm text-zinc-400">
        {isSignup ? "Sign up to start pinning your photos." : "Log in to your PhotoMap."}
      </p>

      {googleEnabled && (
        <>
          <a
            href="/api/auth/google"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-100 px-3 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white"
          >
            <GoogleGlyph />
            Continue with Google
          </a>
          <div className="my-4 flex items-center gap-3 text-xs text-zinc-500">
            <span className="h-px flex-1 bg-zinc-800" />
            or
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
        </>
      )}

      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Password</span>
          <input
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            placeholder={isSignup ? "At least 8 characters" : "Your password"}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </label>

        {state?.error && <p className="text-xs text-red-400">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {pending ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-400">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-emerald-400 hover:underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="text-emerald-400 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.1 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.1-3.8 6.5-9.4 6.5-16z" />
      <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.3 0 20 0 24s.9 7.7 2.5 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.5l-7.1-5.5c-2 1.3-4.6 2.1-7.9 2.1-6.4 0-11.7-3.7-13.6-8.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  );
}
