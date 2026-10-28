/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracing: false,
  eslint: { ignoreDuringBuilds: true },
  // These packages ship native binaries or are too large for the bundler.
  experimental: {
    serverComponentsExternalPackages: [
      'bullmq',
      'ioredis',
      'pdfjs-dist',
      'tesseract.js',
      'ffmpeg-static',
      '@napi-rs/canvas',
      'youtube-transcript',
      'jsdom',
      'xlsx',
      'pptxgenjs',
    ],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },
};

export default nextConfig;
