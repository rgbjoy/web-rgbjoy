import { withPayload } from '@payloadcms/next/withPayload'
/** @type {import('next').NextConfig} */

const ensureProtocol = (url) => (url?.startsWith('http') ? url : url ? `https://${url}` : undefined)

const NEXT_PUBLIC_SERVER_URL = ensureProtocol(process.env.SERVER_URL) || 'http://localhost:3000'

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    turbopackUseBuiltinSass: true,
  },
  allowedDevOrigins: ['10.0.0.141'],
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
  sassOptions: {
    compilerOptions: {
      quietDeps: true,
    },
    silenceDeprecations: ['legacy-js-api', 'import'],
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
