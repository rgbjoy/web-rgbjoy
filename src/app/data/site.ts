/** Single source for site identity, SEO, and masthead copy. */
export const SITE = {
  name: "rgbjoy.com",
  author: "Tom Fletcher",
  email: "tom@rgbjoy.com",
  url: "https://rgbjoy.com",
  handle: "@rgbjoy",

  /** Browser tab and search result headline. */
  title: "Tom Fletcher — fullstack engineering, architecture, and design",

  /** Search results and link previews. */
  description:
    "Tom Fletcher is a fullstack engineer who architects and designs for the web — client sites, product systems, and shader experiments. Available for new work.",

  /** Masthead copy. Split so the invite can end in a real mailto link. */
  intro: {
    lead: "Hi, I'm Tom Fletcher. I love engineering, designing, and dreaming up amazing things for the web.",
    invite: "If you'd like to work together,",
    linkLabel: "email me",
  },
} as const
