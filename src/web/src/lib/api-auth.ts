import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries } from "@alook/shared"
import { createHash } from "crypto"

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export async function withToken(request: Request) {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: new Response("Unauthorized", { status: 401 }), machineToken: null }
  }
  const token = authHeader.slice(7)
  if (!token.startsWith("al_")) {
    return { error: new Response("Invalid token format", { status: 401 }), machineToken: null }
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = createDb((env as Env).DB)
  const hashedToken = hashToken(token)
  const mt = await queries.machineToken.getMachineTokenByHash(db, hashedToken)
  if (!mt) {
    return { error: new Response("Token not found", { status: 401 }), machineToken: null }
  }
  queries.machineToken.updateMachineTokenLastUsed(db, mt.id).catch(() => {})
  return { error: null, machineToken: mt }
}
