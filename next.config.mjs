const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  // The label scan needs the camera on this site only
  { key: 'Permissions-Policy', value: 'camera=(self)' },
];

// The browser checks for a new service worker after each deploy
const SERVICE_WORKER_HEADERS = [{ key: 'Cache-Control', value: 'no-cache' }];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/sw.js', headers: SERVICE_WORKER_HEADERS },
    ];
  },
};

export default nextConfig;
