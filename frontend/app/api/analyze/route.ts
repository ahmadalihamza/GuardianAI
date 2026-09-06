import { NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Video analysis is CPU-bound and can run for minutes (ignored by `next start`). */
export const maxDuration = 900;

const ANALYZE_TIMEOUT_MS = Number(
  process.env.ANALYZE_TIMEOUT_MS ?? 15 * 60 * 1000,
);

/**
 * Forwards the operator's upload to `POST /api/analyze` on the FastAPI backend.
 *
 * The multipart body is re-materialised via `formData()` rather than streamed
 * through: the request is buffered by the Next.js server for the duration of
 * the upload, which is a fair trade for the demo-sized clips this tool targets
 * (10-60s) and avoids the `duplex: "half"` streaming-body edge cases.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, detail: "Malformed upload — expected multipart form data." },
      { status: 400 },
    );
  }

  const video = form.get("video");
  if (!(video instanceof File) || video.size === 0) {
    return NextResponse.json(
      { success: false, detail: "No video file provided." },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: "POST",
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await upstream.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          detail: `Backend returned a non-JSON response (HTTP ${upstream.status}).`,
        },
        { status: 502 },
      );
    }

    if (!upstream.ok) {
      const detail =
        (payload as { detail?: unknown })?.detail ?? `HTTP ${upstream.status}`;
      return NextResponse.json(
        {
          success: false,
          detail: typeof detail === "string" ? detail : JSON.stringify(detail),
        },
        { status: upstream.status },
      );
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        success: false,
        detail: aborted
          ? "Analysis timed out. Try a shorter clip or raise ANALYZE_TIMEOUT_MS."
          : "Could not reach the GuardianAI backend. Is it running on port 8000?",
      },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
