import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf ships its own serverless-friendly PDF.js build; keep it external so
  // the Workers bundle doesn't try to inline its dynamic requires.
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
