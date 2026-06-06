import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const isProductionBuild = process.env.NODE_ENV === "production";
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  // Keep Turbopack rooted at this project even when parent directories contain lockfiles.
  turbopack: {
    root: projectRoot,
  },
  // Electron dev may reach the app through loopback aliases.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Relative assets are required for Electron static export, but they break
  // Next dev hydration under nested routes like /playground. Keep dev on the
  // default /_next asset path so `pnpm run desktop` stays interactive.
  ...(isProductionBuild ? { assetPrefix: "./", output: "export" } : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
