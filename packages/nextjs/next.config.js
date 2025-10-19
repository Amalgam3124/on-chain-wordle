/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Only enforce COOP/COEP in production; in dev these headers can block
    // third‑party SDKs (e.g. WalletConnect pulse beacon) and cause errors.
    if (process.env.NODE_ENV === 'production') {
      return [
        {
          source: '/(.*)',
          headers: [
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
            { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          ],
        },
      ];
    }
    return [];
  },
  webpack: (config) => {
    // Alias optional Node-only logger pretty printer to a no-op stub in browser bundles
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'pino-pretty': path.join(__dirname, 'utils', 'pino-pretty-stub.js'),
      '@react-native-async-storage/async-storage': path.join(
        __dirname,
        'utils',
        'async-storage-stub.js'
      ),
    };
    return config;
  },
};

module.exports = nextConfig;
