import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://garage-link.tech").replace(/\/$/, "");
const isStagingDeployment = process.env.GARAGE_DEPLOYMENT_ENV === "staging";

export default function robots(): MetadataRoute.Robots {
  if (isStagingDeployment) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

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
