import type { Metadata } from "next";
import { notFound } from "next/navigation";

import MapView from "@/components/MapView";
import { listCollectionsByUserId } from "@/lib/collections";
import { getSession } from "@/lib/dal";
import { getUserByUsername } from "@/lib/users";

// Collections change on edit; always render fresh.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `${username} · Travel PhotoMap` };
}

export default async function UserMapPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const owner = await getUserByUsername(username);
  if (!owner || !owner.username) notFound();

  // Canonical case is the stored (lowercased) handle. Public: anyone can view.
  const [collections, session] = await Promise.all([
    listCollectionsByUserId(owner.id),
    getSession(),
  ]);

  const isOwner = session?.userId === owner.id;

  return (
    <MapView
      collections={collections}
      loadError={null}
      ownerName={owner.name || owner.username}
      ownerUsername={owner.username}
      isOwner={isOwner}
    />
  );
}
