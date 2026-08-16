/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: '10mb' } }, // upload foto bon
  headers: async () => [
    {
      // WebLLM butuh cross-origin isolation utk WebGPU/WASM threads
      source: '/chat/:path*',
      headers: [
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    },
  ],
}
export default nextConfig
