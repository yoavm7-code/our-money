/** @type {import('next').NextConfig} */
let apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
// Ensure URL has protocol prefix
if (apiUrl && !apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
  apiUrl = `http://${apiUrl}`;
}
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
