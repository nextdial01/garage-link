import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://garage-link.tech").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/settings/",
        "/vehicles/",
        "/vehicle-management/",
        "/deals/",
        "/quotes/",
        "/parts/",
        "/maintenance/",
        "/line/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
