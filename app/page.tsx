import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";

// Reads the session cookie; never prerender.
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (session) redirect(session.username ? `/${session.username}` : "/welcome");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-zinc-950 p-6 text-center text-zinc-100">
      <div className="max-w-xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Travel PhotoMap</h1>
        <p className="mt-4 text-lg text-zinc-400">
          Pin your photo collections to a world map. Click a pin, walk through the trip. Your map lives at
          your own <span className="text-zinc-200">/username</span>.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
