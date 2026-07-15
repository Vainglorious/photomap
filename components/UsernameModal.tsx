"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { chooseUsername, type AuthState } from "@/app/actions/auth";

/** Product cap on the handle length (keep in sync with lib/validation USERNAME_MAX). */
const USERNAME_MAX = 12;

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

/**
 * Shown once, after signup, to pick the public handle used in /<username>.
 * Gives live availability feedback but the server action is the source of truth.
 */
export default function UsernameModal() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(chooseUsername, undefined);
  const [value, setValue] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");

  // Debounced availability check as the user types.
  useEffect(() => {
    const u = value.trim().toLowerCase();
    if (!u) return setAvailability("idle");
    if (!/^[a-z0-9_]{3,12}$/.test(u)) return setAvailability("invalid");

    setAvailability("checking");
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username/check?u=${encodeURIComponent(u)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { available?: boolean };
        setAvailability(data.available ? "available" : "taken");
      } catch {
        // Aborted or offline — let the server action have the final say.
      }
    }, 350);

    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [value]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl">
        <h1 className="text-xl font-semibold tracking-tight">Pick a username</h1>
        <p className="mt-1 text-sm text-zinc-400">
          This is your public handle — your map lives at{" "}
          <span className="text-zinc-300">photomapz&hellip;/{value.trim().toLowerCase() || "username"}</span>.
        </p>

        <form action={formAction} className="mt-5 flex flex-col gap-3">
          <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-3 focus-within:border-zinc-500">
            <span className="text-sm text-zinc-500">/</span>
            <input
              name="username"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\s/g, "").toLowerCase())}
              maxLength={USERNAME_MAX}
              autoFocus
              autoComplete="off"
              placeholder="username"
              className="w-full bg-transparent px-1 py-2 text-sm outline-none"
            />
            <span className="text-xs tabular-nums text-zinc-600">
              {value.length}/{USERNAME_MAX}
            </span>
          </div>

          <p className="min-h-4 text-xs">
            {availability === "checking" && <span className="text-zinc-500">Checking…</span>}
            {availability === "available" && <span className="text-emerald-400">✓ Available</span>}
            {availability === "taken" && <span className="text-red-400">Already taken</span>}
            {availability === "invalid" && (
              <span className="text-zinc-500">3–12 characters: lowercase letters, numbers, underscore.</span>
            )}
          </p>

          {state?.error && <p className="text-xs text-red-400">{state.error}</p>}

          <button
            type="submit"
            disabled={pending || availability === "taken" || availability === "invalid" || !value}
            className="rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
