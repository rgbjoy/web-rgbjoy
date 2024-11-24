import { GlobalConfig } from 'payload'
import {
  lexicalEditor,
  HTMLConverterFeature,
  lexicalHTML,
} from '@payloadcms/richtext-lexical'

export const Art: GlobalConfig = {
  slug: 'art',
  label: 'Art Page',
  typescript: {
    interface: 'Art',
  },
  graphQL: {
    name: 'Art',
  },
  admin: {
    group: 'Content',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'header',
      type: 'text',
      label: 'Page Title',
    },
    {
      name: 'content',
      type: 'richText',
      label: 'Page Content',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          HTMLConverterFeature({}),
        ],
      }),
    },
    lexicalHTML('content', { name: 'content_html' }),
    {
      name: 'artworks',
      type: 'array',
      label: 'Artworks',
      labels: {
        singular: 'Artwork',
        plural: 'Artworks',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
          label: 'Artwork Title',
        },
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
          label: 'Artwork Image',
        },
        {
          name: 'description',
          type: 'textarea',
          label: 'Artwork Description',
        },
      ],
    },
  ],
}
