/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async rewrites() {
    // Proxifie /api/* vers le backend FastAPI (même que l'app mobile).
    // Ceci évite les problèmes CORS + rend l'app web transparente.
    //
    // - En local (dev) : définir BACKEND_URL=http://localhost:8001 dans .env.local
    // - En production (Vercel) : définir BACKEND_URL=https://jokoo-mobile-dev.emergent.host
    //   dans Project Settings → Environment Variables
    const backend =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "https://jokoo-mobile-dev.emergent.host";
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};
module.exports = nextConfig;
