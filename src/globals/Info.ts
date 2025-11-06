import { GlobalConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { revalidateGlobal } from '../hooks/revalidateGlobal'

export const Info: GlobalConfig = {
  slug: 'info',
  label: 'Info Page',
  typescript: {
    interface: 'Info',
  },
  graphQL: {
    name: 'Info',
  },
  admin: {
    group: 'Content',
    preview: (doc, { req }) => {
      return `${req.protocol}//${req.headers.get('host')}/${doc.globalType}`
    },
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
      name: 'profileImage',
      type: 'upload',
      relationTo: 'media',
      label: 'Profile Image',
    },
    {
      name: 'resume',
      type: 'upload',
      relationTo: 'media',
      label: 'Resume File',
      admin: {
        description: 'Upload your resume (PDF, DOC, DOCX)',
      },
      filterOptions: {
        mimeType: {
          in: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ],
        },
      },
    },
    {
      name: 'links',
      type: 'array',
      label: 'Links',
      labels: {
        singular: 'Link',
        plural: 'Links',
      },
      admin: {
        components: {
          RowLabel: '../components/RowLabel',
        },
      },
      fields: [
        {
          name: 'link',
          type: 'group',
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
            },
            {
              name: 'url',
              type: 'text',
              required: true,
              hooks: {
                beforeValidate: [
                  ({ value }) => {
                    if (!value) return value
                    if (value.startsWith('mailto:')) return value
                    if (!value.startsWith('https://')) {
                      return `https://${value}`
                    }
                    return value
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      name: 'content',
      type: 'richText',
      label: 'Page Content',
      editor: lexicalEditor({}),
    },
    {
      name: 'strengths',
      type: 'array',
      label: 'Strengths Sections',
      labels: {
        singular: 'Strength Section',
        plural: 'Strength Sections',
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
          name: 'strengthsList',
          type: 'text',
          label: 'Strengths',
          required: true,
        },
      ],
    },
  ],
}
