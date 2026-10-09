import { fileURLToPath } from "node:url";
import { withSerwist } from "@serwist/turbopack";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    optimizePackageImports: [
      "@tabler/icons-react",
      "lucide-react",
      "@tanstack/react-table",
    ],
  },

  turbopack: {
    // Folder file ini, bukan path Windows tetap (build Vercel berjalan di Linux).
    root: fileURLToPath(new URL(".", import.meta.url)),
  },

  headers: async () => [
    {
      // Service worker harus selalu dicek ulang supaya versi baru terdeteksi.
      source: "/serwist/:path*",
      headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
    },
    {
      // WebLLM butuh cross-origin isolation utk WebGPU/WASM threads
      source: "/chat/:path*",
      headers: [
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    },
  ],
};
export default withSerwist(nextConfig);
