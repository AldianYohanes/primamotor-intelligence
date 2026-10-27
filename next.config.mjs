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

/** Host Supabase dari env, untuk connect-src (REST dan realtime). */
function supabaseHosts() {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
    return host ? `https://${host} wss://${host}` : "";
  } catch {
    return "";
  }
}

/**
 * Header keamanan semua halaman. CSP sengaja Report-Only dulu: WebLLM memuat model dari
 * huggingface.co dan pustaka WASM dari raw.githubusercontent.com, memakai worker blob, dan Next
 * memakai skrip inline. Pantau pelanggarannya di konsol browser selama satu putaran uji, baru
 * ganti jadi Content-Security-Policy.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${supabaseHosts()} https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com`.trim(),
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

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
    { source: "/:path*", headers: securityHeaders },
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
