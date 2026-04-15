import type { NextConfig } from "next";
import path from "node:path";
import { readFileSync } from "node:fs";

// Resolve NEXTJS_ENV for client bundles. Wrangler bindings are runtime-only,
// so we read the value at build/dev time from .dev.vars (overrides) → wrangler.toml.
function resolveEnv(key: string): string | undefined {
	if (process.env[key]) return process.env[key];
	const dir = __dirname;
	// .dev.vars overrides wrangler.toml (same precedence wrangler uses)
	for (const file of [".dev.vars", "wrangler.toml"]) {
		try {
			const content = readFileSync(path.resolve(dir, file), "utf-8");
			const match = content.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]*)"?`, "m"));
			if (match?.[1]) return match[1];
		} catch { /* file may not exist */ }
	}
	return undefined;
}

const isProduction = resolveEnv("NEXTJS_ENV") === "production";

const nextConfig: NextConfig = {
	turbopack: {
		root: path.resolve(__dirname, "../.."),
	},
	env: {
		NEXT_PUBLIC_AUTH_MODE: isProduction ? "otp" : "password",
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
