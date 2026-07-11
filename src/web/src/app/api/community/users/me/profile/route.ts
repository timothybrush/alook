import { NextRequest } from "next/server"
import {
  queries,
  MAX_PROFILE_NAME_LENGTH,
  MAX_PROFILE_ABOUT_LENGTH,
  MAX_STATUS_TEXT_LENGTH,
  MAX_EMOJI_BYTES,
  BANNER_COLOR_REGEX,
} from "@alook/shared"
import { getDb } from "@/lib/db"
import { withAuth } from "@/lib/middleware/auth"
import { writeJSON, writeError } from "@/lib/middleware/helpers"
import { fanOutStatusUpdate } from "@/lib/community/fanout"

export const GET = withAuth(async (_req, ctx) => {
  const db = getDb(ctx.env.DB)
  const [profile, viewer] = await Promise.all([
    queries.communityUserProfile.getProfile(db, ctx.userId),
    queries.user.getUserSelf(db, ctx.userId),
  ])
  return writeJSON({
    aboutMe: profile?.aboutMe ?? "",
    bannerColor: profile?.bannerColor ?? null,
    discriminator: viewer?.discriminator ?? "0000",
    statusEmoji: profile?.statusEmoji ?? null,
    statusText: profile?.statusText ?? "",
  })
})

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const db = getDb(ctx.env.DB)

  let body: {
    name?: string
    aboutMe?: string
    bannerColor?: string | null
    statusEmoji?: string | null
    statusText?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return writeError("invalid request body", 400)
  }

  if (
    body.aboutMe === undefined &&
    body.bannerColor === undefined &&
    body.name === undefined &&
    body.statusEmoji === undefined &&
    body.statusText === undefined
  ) {
    return writeError("no changes provided", 400)
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string") return writeError("name must be a string", 400)
    const trimmed = body.name.trim()
    if (!trimmed) return writeError("name cannot be empty", 400)
    if (trimmed.length > MAX_PROFILE_NAME_LENGTH) {
      return writeError(`name must be ≤ ${MAX_PROFILE_NAME_LENGTH} characters`, 400)
    }
    await queries.user.updateUser(db, ctx.userId, { name: trimmed })
  }

  const data: {
    aboutMe?: string
    bannerColor?: string | null
    statusEmoji?: string | null
    statusText?: string | null
  } = {}
  if (body.aboutMe !== undefined) {
    if (typeof body.aboutMe !== "string") return writeError("aboutMe must be a string", 400)
    if (body.aboutMe.length > MAX_PROFILE_ABOUT_LENGTH) {
      return writeError(`aboutMe must be ≤ ${MAX_PROFILE_ABOUT_LENGTH} characters`, 400)
    }
    data.aboutMe = body.aboutMe
  }
  if (body.bannerColor !== undefined) {
    if (body.bannerColor !== null) {
      // Hex-only allowlist prevents CSS injection if the value is ever
      // rendered into a style attribute.
      if (typeof body.bannerColor !== "string" || !BANNER_COLOR_REGEX.test(body.bannerColor.trim())) {
        return writeError("bannerColor must be a hex color like #aabbcc", 400)
      }
      data.bannerColor = body.bannerColor.trim()
    } else {
      data.bannerColor = null
    }
  }
  if (body.statusEmoji !== undefined) {
    if (body.statusEmoji !== null) {
      if (typeof body.statusEmoji !== "string") return writeError("statusEmoji must be a string", 400)
      if (Buffer.byteLength(body.statusEmoji, "utf8") > MAX_EMOJI_BYTES) {
        return writeError(`statusEmoji must be ≤ ${MAX_EMOJI_BYTES} bytes`, 400)
      }
      data.statusEmoji = body.statusEmoji
    } else {
      data.statusEmoji = null
    }
  }
  if (body.statusText !== undefined) {
    if (body.statusText !== null) {
      if (typeof body.statusText !== "string") return writeError("statusText must be a string", 400)
      if (body.statusText.length > MAX_STATUS_TEXT_LENGTH) {
        return writeError(`statusText must be ≤ ${MAX_STATUS_TEXT_LENGTH} characters`, 400)
      }
      data.statusText = body.statusText
    } else {
      data.statusText = null
    }
  }

  let updated: {
    aboutMe: string | null
    bannerColor: string | null
    statusEmoji: string | null
    statusText: string | null
  } | null = null
  if (
    data.aboutMe !== undefined ||
    data.bannerColor !== undefined ||
    data.statusEmoji !== undefined ||
    data.statusText !== undefined
  ) {
    updated = await queries.communityUserProfile.updateProfile(db, ctx.userId, data)
  }

  // Fan out only when a status field was actually part of this patch — a
  // plain aboutMe-only save must not trigger a broadcast.
  if (data.statusEmoji !== undefined || data.statusText !== undefined) {
    await fanOutStatusUpdate(
      ctx.userId,
      updated?.statusEmoji ?? null,
      updated?.statusText ?? null,
    )
  }

  // Normalise the response shape — same as GET — so callers don't see
  // `userId` leak through on PATCH.
  return writeJSON({
    aboutMe: updated?.aboutMe ?? "",
    bannerColor: updated?.bannerColor ?? null,
    statusEmoji: updated?.statusEmoji ?? null,
    statusText: updated?.statusText ?? "",
  })
})
