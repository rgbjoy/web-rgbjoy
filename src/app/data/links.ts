export type SiteLink = {
  href: string
  /** Platform name, shown as the row title. */
  title: string
}

/** Authored order stands in for a date, since these have none. */
export const LINKS: SiteLink[] = [
  {
    href: "mailto:tom@rgbjoy.com",
    title: "Email",
  },
  {
    href: "https://www.linkedin.com/in/rgbjoy/",
    title: "LinkedIn",
  },
  {
    href: "https://x.com/rgbjoy",
    title: "X",
  },
  {
    href: "https://www.instagram.com/rgbjoy/",
    title: "Instagram",
  },
  {
    href: "https://github.com/rgbjoy/",
    title: "GitHub",
  },
]

// The href carries the handle and the address, so it covers search on its own.
export function linkSearchText(link: SiteLink): string {
  return [link.title, link.href].join(" ").toLowerCase()
}
