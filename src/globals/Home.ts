import { GlobalConfig } from 'payload'
import { revalidateGlobal } from '../hooks/revalidateGlobal'

export const Home: GlobalConfig = {
  slug: 'home',
  label: 'Home Page',
  typescript: {
    interface: 'Home',
  },
  graphQL: {
    name: 'Home',
  },
  admin: {
    group: 'Content',
    preview: (doc, { req }) => {
      return `${req.protocol}//${req.headers.get('host')}/`
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
      label: 'Header',
    },
    {
      name: 'subhead',
      type: 'text',
      label: 'Subheading',
    },
    {
      name: 'intro',
      type: 'textarea',
      label: 'Introduction',
    },
    {
      name: 'button',
      type: 'text',
      label: 'Button Text',
    },
  ],
}
