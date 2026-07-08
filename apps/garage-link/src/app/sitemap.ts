import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://garage-link.tech").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/legal/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${baseUrl}/legal/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${baseUrl}/legal/tokusho`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
  ];
}
