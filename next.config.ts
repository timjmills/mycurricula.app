import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray lockfile in the user's
  // home directory otherwise makes Next infer the wrong tracing root.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
