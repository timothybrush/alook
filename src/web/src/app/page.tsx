import { getSession } from "@/lib/session";
import { HomePage } from "@/components/home/home-page";

export default async function Page() {
  const session = await getSession();
  return <HomePage isLoggedIn={!!session} />;
}
