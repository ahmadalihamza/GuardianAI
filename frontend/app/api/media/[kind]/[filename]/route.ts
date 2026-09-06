import { BACKEND_URL } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = new Set(["evidence", "processed"]);

/** Headers worth carrying over so `<video>` seeking and caching behave. */
const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
];

type Params = { params: Promise<{ kind: string; filename: string }> };

/**
 * Streams evidence images and processed videos from the backend's `/evidence`
 * and `/processed` static mounts.
 *
 * `Range` is forwarded and 206 responses are passed through untouched, so
 * scrubbing an annotated video works the same as hitting FastAPI directly.
 */
async function proxy(request: Request, { params }: Params, method: "GET" | "HEAD") {
  const { kind, filename } = await params;

  if (!KINDS.has(kind)) {
    return new Response("Unknown media kind", { status: 400 });
  }

  const name = decodeURIComponent(filename);
  // The backend stores flat filenames in these directories; anything with a
  // separator or a parent reference is an attempt to escape them.
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return new Response("Invalid filename", { status: 400 });
  }

  const range = request.headers.get("range");

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/${kind}/${encodeURIComponent(name)}`, {
      method,
      headers: range ? { Range: range } : undefined,
      cache: "no-store",
    });
  } catch {
    return new Response("Backend unreachable", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Media not found", { status: upstream.status });
  }

  const headers = new Headers();
  for (const key of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  // Evidence frames and processed clips are immutable once written, but they
  // live under uniquely generated names, so a short private cache is enough.
  headers.set("Cache-Control", "private, max-age=300");

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function GET(request: Request, ctx: Params) {
  return proxy(request, ctx, "GET");
}

export async function HEAD(request: Request, ctx: Params) {
  return proxy(request, ctx, "HEAD");
}
