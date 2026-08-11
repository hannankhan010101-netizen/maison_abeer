/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * Webpack's on-disk cache, in development on Windows only.
   *
   * Windows holds a lock on the pack file while another process reads it, so
   * the rename webpack does to commit a new one fails with EPERM. The cache
   * is then half-written, and the next request dies inside a chunk with
   * `__webpack_modules__[moduleId] is not a function` — an error that points
   * at nothing and is fixed only by deleting .next by hand.
   *
   * Memory caching costs a slower cold start and removes the failure. Left
   * alone everywhere else: on CI and on Linux the disk cache is a real win,
   * and production builds do not use this path at all.
   */
  webpack(config, { dev }) {
    if (dev && process.platform === 'win32') {
      config.cache = { type: 'memory' };
    }

    return config;
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
