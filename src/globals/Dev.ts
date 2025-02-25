import { GlobalConfig } from 'payload'
import { lexicalEditor, HTMLConverterFeature, lexicalHTML } from '@payloadcms/richtext-lexical'
import { revalidateGlobal } from '../hooks/revalidateGlobal'

export const Dev: GlobalConfig = {
  slug: 'dev',
  label: 'Dev Page',
  typescript: {
    interface: 'Dev',
  },
  graphQL: {
    name: 'Dev',
  },
  admin: {
    group: 'Content',
    preview: (doc, { req }) => {
      return `${req.protocol}//${req.headers.get('host')}/${doc.globalType}`
    }
  },
  access: {
    read: () => true,
  },
  hooks: {
    afterChange: [revalidateGlobal],
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
        features: ({ defaultFeatures }) => [...defaultFeatures, HTMLConverterFeature({})],
      }),
    },
    lexicalHTML('content', { name: 'content_html' }),
    {
      name: 'pastProjects',
      type: 'array',
      label: 'Past Projects',
      labels: {
        singular: 'Project',
        plural: 'Projects',
      },
      admin: {
        components: {
          RowLabel: '../components/RowLabel',
        },
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
        },
        {
          name: 'link',
          type: 'group',
          fields: [
            {
              name: 'url',
              type: 'text',
              required: true,
              hooks: {
                beforeValidate: [
                  ({ value }) => {
                    if (value && !value.startsWith('https://')) {
                      return `https://${value}`
                    }
                    return value
                  },
                ],
              },
            },
          ],
        },
        {
          name: 'description',
          type: 'textarea',
        },
      ],
    },
  ],
}
