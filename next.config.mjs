import { withPayload } from '@payloadcms/next/withPayload'
/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/api/media/file/**',
      },
      {
        protocol: 'https',
        hostname: 'rgbjoy.com',
        pathname: '/api/media/file/**',
      },
      {
        protocol: 'https',
        hostname: '*.rgbjoy.com',
        pathname: '/api/media/file/**',
      },
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
