import { join } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle for a small production Docker image.
  output: "standalone",
  outputFileTracingRoot: join(import.meta.dirname, "..", ".."),
  // Pin the workspace root so Next doesn't get confused by other lockfiles.
  turbopack: {
    root: join(import.meta.dirname, "..", ".."),
  },
};

export default nextConfig;
