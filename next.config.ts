import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray package-lock.json in the user profile
  // otherwise makes Turbopack treat C:\Users\scott as the root and fail
  // creating cross-directory symlinks on Windows.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
