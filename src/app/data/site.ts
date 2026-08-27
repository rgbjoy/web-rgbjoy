/** Single source for site identity, SEO, and masthead copy. */
export const SITE = {
  name: "rgbjoy.com",
  author: "Tom Fletcher",
  email: "tom@rgbjoy.com",
  url: "https://rgbjoy.com",
  handle: "@rgbjoy",

  /** Browser tab and search result headline. */
  title: "Tom Fletcher — web development, consulting, and design",

  /** Search results and link previews. */
  description:
    "Tom Fletcher builds, consults on, and designs for the web — client sites, product engineering, and shader experiments. Available for new work.",

  /** Masthead copy. Split so the invite can end in a real mailto link. */
  intro: {
    lead: "Hi, I'm Tom Fletcher. I love building, consulting, and designing for the web.",
    invite: "If you'd like to work together,",
    linkLabel: "email me",
  },
} as const
