import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['node:sqlite'],
  poweredByHeader: false,
  // Runtime credentials and private evidence belong to the host, never the build artifact.
  outputFileTracingExcludes: {
    '/*': ['./data/**/*', './.env*', './test-results/**/*', './playwright-report/**/*'],
  },
  outputFileTracingIncludes: { '/api/*': ['./migrations/*.sql'] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'" +
              (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '') +
              "; connect-src 'self'",
          },
        ],
      },
    ];
  },
};
export default config;
