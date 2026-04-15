import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { HomePage } from "@/components/home/home-page";

export default async function Page() {
  const session = await getSession();
  if (session) redirect("/workspaces?auto");
  return <HomePage />;
}
