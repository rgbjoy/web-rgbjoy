import { withPayload } from '@payloadcms/next/withPayload'
/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      ...[process.env.SERVER_URL].map((item) => {
        const url = new URL(item)

        return {
          hostname: url.hostname,
          protocol: url.protocol.replace(':', ''),
          pathname: '/api/media/file/**',
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
