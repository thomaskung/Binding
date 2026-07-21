import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/ui ships client components ("use client") as TS source, not a
  // pre-built dist — Next must transpile it itself so "use client" directives
  // survive (a bundled dist wouldn't preserve them reliably).
  transpilePackages: ["@jumponboard/ui"],
  // unpdf ships its own serverless-friendly PDF.js build; keep it external so
  // the Workers bundle doesn't try to inline its dynamic requires.
  serverExternalPackages: ["unpdf"],
  // Dev server is often opened via 127.0.0.1 (matches Supabase's local URLs).
  // Without this, Next blocks the cross-origin HMR websocket and falls back
  // to full page reloads on any dev-client hiccup — which silently wipes
  // client-component state (e.g. mid-typing on the signup form) and looks
  // like a broken "Create account" button. Not actually a signup bug.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
