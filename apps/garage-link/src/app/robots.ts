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
        "/auth/",
        "/login",
        "/signup",
        "/forgot-password",
        "/onboarding",
        "/logout",
        "/analytics",
        "/appointments",
        "/customers",
        "/dashboard",
        "/deals",
        "/inquiries",
        "/inventory-counts",
        "/invoices",
        "/line/",
        "/line-package/",
        "/maintenance",
        "/menu",
        "/parts",
        "/quotes",
        "/security/",
        "/settings/",
        "/supabase-test",
        "/vehicle-management",
        "/vehicles",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
