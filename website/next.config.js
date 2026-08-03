/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async rewrites() {
    // Proxifie /api/* vers le backend FastAPI (même que l'app mobile).
    // Ceci évite les problèmes CORS + rend l'app web transparente.
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8001/api/:path*",
      },
    ];
  },
};
module.exports = nextConfig;
