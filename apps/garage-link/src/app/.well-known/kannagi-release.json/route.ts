import { BRAND } from "@/lib/brand";

export const dynamic = "force-static";
export function GET() { return Response.json({ service: BRAND.serviceName, gitSha: process.env.KANNAGI_RELEASE_SHA ?? "UNSET" }); }
