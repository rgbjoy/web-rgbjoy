// storage-adapter-import-placeholder
import { vercelPostgresAdapter } from '@payloadcms/db-vercel-postgres'
import { s3Storage } from '@payloadcms/storage-s3'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { resendAdapter } from '@payloadcms/email-resend'
import sharp from 'sharp'
import { getServerSideURL } from './utilities/getURL'
import { regenerateMedia, regenerateSingleMedia } from './scripts/regenerate-media'

// Collections
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Posts } from './collections/Posts'

// Hooks
import { revalidateRedirects } from './hooks/revalidateRedirects'

// Globals
//-- Content
import { Home } from './globals/Home'
import { Info } from './globals/Info'
import { Dev } from './globals/Dev'
import { Art } from './globals/Art'
//-- Site Settings
import { Footer } from './globals/Footer'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// test db connection first

export default buildConfig({
  admin: {
    avatar: 'default',
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname, 'src'),
    },
    components: {
      graphics: {
        Icon: 'src/components/Icon',
        Logo: 'src/components/Logo',
      },
      beforeNavLinks: ['src/components/Admin#ViewSite'],
    },
  },
  serverURL: getServerSideURL(),
  routes: {
    admin: '/dashboard',
  },
  collections: [Users, Media, Posts],
  globals: [Home, Info, Dev, Art, Footer],
  editor: lexicalEditor(),
  cors: [getServerSideURL()].filter(Boolean),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: vercelPostgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  endpoints: [
    {
      path: '/regenerate-media',
      method: 'post',
      handler: async () => {
        const message = await regenerateMedia()
        return Response.json({ success: true, message })
      },
    },
    {
      path: '/regenerate-media/:id',
      method: 'post',
      handler: async (req) => {
        const { id } = req.routeParams as { id: string }
        const message = await regenerateSingleMedia(id)
        return Response.json({ success: true, message })
      },
    },
  ],
  sharp,
  plugins: [
    s3Storage({
      collections: {
        [Media.slug]: {
          prefix: process.env.NODE_ENV || '',
          signedDownloads: {
            shouldUseSignedURL: () => true,
          },
        },
      },
      bucket: process.env.S3_BUCKET || '',
      config: {
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
        region: process.env.S3_REGION || '',
      },
    }),
    redirectsPlugin({
      collections: [Posts.slug],
      overrides: {
        admin: {
          group: 'Site Settings',
        },
        hooks: {
          afterChange: [revalidateRedirects],
        },
      },
    }),
  ],
  email: resendAdapter({
    defaultFromAddress: 'admin@rgbjoy.com',
    defaultFromName: 'RGBJOY.com',
    apiKey: process.env.RESEND_API_KEY || '',
  }),
})
