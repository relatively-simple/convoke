import Workspace from "./workspace";
import { getChatGPTUser } from "./chatgpt-auth";
import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  return <Workspace publicAccess={env.AUTH_MODE === "public"} signedIn={!!user || env.AUTH_MODE === "public"} displayName={user?.fullName || "Your workspace"} />;
}
