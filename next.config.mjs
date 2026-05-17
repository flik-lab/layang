/** @type {import('next').NextConfig} */
const isProductionBuild = process.env.NODE_ENV === "production";

const nextConfig = {
  // Relative assets are required for Electron static export, but they break
  // Next dev hydration under nested routes like /playground. Keep dev on the
  // default /_next asset path so `pnpm run desktop` stays interactive.
  ...(isProductionBuild ? { assetPrefix: "./", output: "export" } : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
