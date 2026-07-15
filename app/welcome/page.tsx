import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import UsernameModal from "@/components/UsernameModal";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.username) redirect(`/${user.username}`); // already chose one

  return <UsernameModal />;
}
