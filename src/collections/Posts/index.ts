import type { CollectionConfig } from 'payload'
import {
  lexicalEditor,
  BlocksFeature,
  lexicalHTML,
  HTMLConverterFeature,
  HTMLConverter,
  SerializedBlockNode,
} from '@payloadcms/richtext-lexical'
import { revalidatePost } from './hooks/revalidatePost'
import { slugField } from '@/fields/slug'
import { authenticated } from '../../access/authenticated'
import { authenticatedOrPublished } from '../../access/authenticatedOrPublished'
import { populatePublishedAt } from '../../hooks/populatePublishedAt'

const BlockHtmlConverter: HTMLConverter<SerializedBlockNode> = {
  converter({ node }) {
    switch (node.fields.blockType) {
      case 'embed':
        const id = `embed-container-${node.fields.id}`
        const width = node.fields.width + 'px' || 'auto'
        const height = node.fields.height + 'px' || 'auto'
        return `
          <div class="embed" id="${id}" style="width:${width}; height:${height};">
            ${node.fields.embed_code}
          </div>
        `
      default:
        return `<span>unknown node.</span>`
    }
  },
  nodeTypes: ['block'],
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    useAsTitle: 'title',
    preview: () => null,
    components: {
      edit: {
        PreviewButton: 'src/collections/Posts/components/PreviewButton',
      },
    },
  },
  fields: [
    {
      name: 'featuredImage',
      type: 'upload',
      label: 'Featured Image',
      relationTo: 'media',
      required: false,
    },
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
      },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            if (siblingData._status === 'published' && !value) {
              return new Date()
            }
            return value
          },
        ],
      },
    },
    {
      name: 'contentRichText',
      type: 'richText',
      label: 'Content',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({
            blocks: [
              {
                slug: 'embed',
                fields: [
                  {
                    name: 'embed_code',
                    label: 'Embed Code',
                    type: 'textarea',
                  },
                  {
                    name: 'width',
                    label: 'Width',
                    type: 'text',
                  },
                  {
                    name: 'height',
                    label: 'Height',
                    type: 'text',
                  },
                ],
              },
            ],
          }),
          HTMLConverterFeature({
            converters: ({ defaultConverters }) =>
              [...defaultConverters, BlockHtmlConverter] as HTMLConverter[],
          }),
        ],
      }),
    },
    lexicalHTML('contentRichText', { name: 'contentRichText_html' }),
    ...slugField(),
  ],
  hooks: {
    beforeChange: [populatePublishedAt],
    afterChange: [revalidatePost],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 100,
      },
    },
    maxPerDoc: 50,
  },
}

export default Posts
