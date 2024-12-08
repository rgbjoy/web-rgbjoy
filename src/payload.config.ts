// storage-adapter-import-placeholder
import { postgresAdapter } from '@payloadcms/db-postgres'
import { s3Storage } from '@payloadcms/storage-s3'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { resendAdapter } from '@payloadcms/email-resend'
import sharp from 'sharp'
import { getServerSideURL } from './utilities/getURL'

// Collections
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Posts } from './collections/Posts'

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
      baseDir: path.resolve(dirname),
    },
    components: {
      graphics: {
        Icon: './components/Icon',
        Logo: './components/Logo',
      },
      beforeNavLinks: ['./components/Admin#ViewSite'],
    },
  },
  collections: [Users, Media, Posts],
  globals: [Home, Info, Dev, Art, Footer],
  editor: lexicalEditor(),
  cors: [getServerSideURL()].filter(Boolean),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
  sharp,
  plugins: [
    s3Storage({
      collections: {
        media: true,
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
  ],
  email: resendAdapter({
    defaultFromAddress: 'admin@rgbjoy.com',
    defaultFromName: 'Payload CMS',
    apiKey: process.env.RESEND_API_KEY || '',
  }),
})
