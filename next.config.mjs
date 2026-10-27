import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withSerwist } from "@serwist/turbopack";

/** Hash pendek, branch, dan tanda -dirty dari git; "unknown" kalau git tidak ada. Dicatat di ekspor /eval. */
function gitInfo() {
  const git = (cmd) => execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  try {
    const dirty = git("status --porcelain") !== "";
    return { commit: git("rev-parse --short HEAD") + (dirty ? "-dirty" : ""), branch: git("rev-parse --abbrev-ref HEAD") };
  } catch {
    return { commit: "unknown", branch: "unknown" };
  }
}
const { commit, branch } = gitInfo();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Build uji (NEXT_DIST_DIR) memakai folder terpisah supaya tidak merusak server dev yang sedang jalan.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  env: {
    NEXT_PUBLIC_GIT_COMMIT: commit,
    NEXT_PUBLIC_GIT_BRANCH: branch,
  },

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
