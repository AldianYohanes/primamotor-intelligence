/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    optimizePackageImports: [
      "@mantine/core",
      "@tabler/icons-react",
      "lucide-react",
      "@tanstack/react-table",
    ],
  },

  turbopack: {
    root: "C:\\Users\\aldia\\Documents\\skripsi-program\\primamotor-intelligence",
  },

  reactStrictMode: true,

  headers: async () => [
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
export default nextConfig;
