/** Deployment identity and seed defaults; editable Info and SEO are stored in D1. */
export const SITE = {
  name: "rgbjoy.com",
  author: "Tom Fletcher",
  email: "tom@rgbjoy.com",
  url: "https://rgbjoy.com",
  handle: "@rgbjoy",

  /** Browser tab and search result headline. */
  title: "Tom Fletcher is a full-stack engineer and creative developer who designs and builds for the web, from client sites and product systems to shader experiments. Available for new work.",

  /** Search results and link previews. */
  description:
    "Tom Fletcher is a full-stack engineer and creative developer who designs and builds for the web, from client sites and product systems to shader experiments. Available for new work.",

  /** Masthead copy. Split so the invite can end in the contact trigger. */
  intro: {
    lead: "Hi, I'm Tom Fletcher. I love engineering, designing, and dreaming up amazing things for the web.",
    invite: "If you'd like to work together,",
    linkLabel: "contact me",
  },
} as const
