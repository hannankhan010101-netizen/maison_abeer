/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * The dev overlay badge, off.
   *
   * It anchors to a bottom corner, which is exactly where the phone tab bar
   * now lives — it sat on top of the first tab and swallowed taps meant for
   * it. Only present in development, but development on a phone is how this
   * app gets checked, so it may as well not be in the way.
   */
  devIndicators: false,

  /**
   * Where the build output goes.
   *
   * `next build` and `next dev` both write to `.next` by default, so building
   * while a dev server is running corrupts the directory underneath it. The
   * symptom is not obviously a build problem: chunks start 404ing as
   * `text/plain`, the client bundle never executes, and React reports a
   * *hydration mismatch* — sending you looking for a rendering bug that is
   * not there.
   *
   * Set `NEXT_DIST_DIR=.next-build` for builds and verification runs so they
   * cannot tread on a live dev server.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',

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
