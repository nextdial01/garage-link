import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return { name: BRAND.serviceName, short_name: "GARAGE", start_url: "/", display: "standalone", background_color: BRAND.colors.background, theme_color: BRAND.colors.theme, icons: [{ src: BRAND.assets.pwa192, sizes: "192x192", type: "image/png", purpose: "any" }, { src: BRAND.assets.pwa512, sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
