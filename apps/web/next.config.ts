import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @romanica/shared ships raw TS (type-only imports here, but be safe)
  transpilePackages: ["@romanica/shared"],
};

export default nextConfig;
