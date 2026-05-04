import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/og"],
        disallow: ["/w/", "/workspaces", "/api/"],
      },
    ],
    sitemap: "https://alook.ai/sitemap.xml",
  };
}
