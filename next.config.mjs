import { withPayload } from '@payloadcms/next/withPayload'
/** @type {import('next').NextConfig} */

// Prefer explicit SERVER_URL, otherwise pick from Vercel vars and ensure protocol
// For PR deployments, prioritize branch URL over production URL
const pickVercelHost = () =>
  process.env.VERCEL_BRANCH_URL ||
  process.env.VERCEL_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL

const ensureProtocol = (url) => (url?.startsWith('http') ? url : url ? `https://${url}` : undefined)

const NEXT_PUBLIC_SERVER_URL = ensureProtocol(pickVercelHost()) || 'http://localhost:3000'

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      ...[NEXT_PUBLIC_SERVER_URL].map((item) => {
        const url = new URL(item)

        return {
          hostname: url.hostname,
          protocol: url.protocol.replace(':', ''),
        }
      }),
    ],
  },
  turbopack: {
    rules: {
      '*.module.scss': {
        loaders: ['sass-loader'],
        as: '*.module.css',
      },
      '*.scss': {
        loaders: ['sass-loader'],
        as: '*.css',
      },
    },
  },
  sassOptions: {
    compilerOptions: {
      quietDeps: true,
    },
    silenceDeprecations: ['legacy-js-api', 'import'],
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
