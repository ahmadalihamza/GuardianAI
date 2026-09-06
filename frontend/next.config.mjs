/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Everything the browser talks to lives under /api/* on this origin. The
  // FastAPI backend is only ever reached from the Next.js server, so the
  // browser never needs CORS or a publicly reachable backend URL.
  poweredByHeader: false,
};

export default nextConfig;
