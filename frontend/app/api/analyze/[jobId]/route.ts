import { NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ jobId: string }> };

/** Poll one backend analysis job without exposing BACKEND_URL to the browser. */
export async function GET(_request: Request, { params }: Params) {
  const { jobId } = await params;
  if (!/^[a-f0-9]{32}$/i.test(jobId)) {
    return NextResponse.json(
      { status: "failed", detail: "Invalid analysis job id." },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch(`${BACKEND_URL}/api/analyze/jobs/${jobId}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await upstream.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { status: "failed", detail: `Backend returned HTTP ${upstream.status}.` },
        { status: 502 },
      );
    }
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        status: "unreachable",
        detail: timedOut
          ? "Timed out while checking analysis progress."
          : "Backend is temporarily unreachable while checking progress.",
      },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
