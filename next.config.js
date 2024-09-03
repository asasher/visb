/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: false, // If this is enabled then spotify doesn't work
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.scdn.co',
      },
      {
        protocol: "https",
        hostname: "mosaic.scdn.co"
      },
      {
        protocol: "https",
        hostname: "image-cdn-ak.spotifycdn.com"
      },
      {
        protocol: "https",
        hostname: "i2o.scdn.co" 
      }
    ],
  },
};

export default config;
