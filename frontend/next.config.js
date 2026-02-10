/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl.replace(/\/$/, '')}/api/:path*` },
    ];
  },
};

module.exports = nextConfig;
