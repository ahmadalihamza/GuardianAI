import { NextResponse } from "next/server";

import { checkHealth } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Backend health, polled by the sidebar indicator. Proxied rather than read
 * directly by the browser so `BACKEND_URL` stays server-side.
 */
export async function GET() {
  const health = await checkHealth();
  return NextResponse.json(health, {
    headers: { "Cache-Control": "no-store" },
  });
}
