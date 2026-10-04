import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://garage-link.tech").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${baseUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/features`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/demo`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/pricing`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/industries/used-car`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/industries/motorcycle`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/industries/maintenance`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/faq`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/help`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/legal/terms`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${baseUrl}/legal/privacy`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${baseUrl}/legal/tokusho`, changeFrequency: "monthly", priority: 0.2 },
  ];
}
