export type Project = {
  href: string
  /** Domain, shown verbatim as the row title. */
  title: string
  /** Year the site shipped, or "Ongoing" / "Coming soon" for unshipped work. */
  year: string
  description?: string
}

/**
 * Client work. Sorting by date leans on "Ongoing" sorting above any year
 * string, which puts continuing work at the top.
 */
export const PROJECTS: Project[] = [
  {
    href: "https://golfisweird.com",
    title: "golfisweird.com",
    year: "Coming soon",
    description:
      "Something weird for golf, in the works. All it takes is one good look.",
  },
  {
    href: "https://tenniswoodsmiles.com",
    title: "tenniswoodsmiles.com",
    year: "2026",
    description:
      "A patient-focused site for a multigenerational dental practice, built with Payload CMS and Next.js.",
  },
  {
    href: "https://veronightout.com",
    title: "veronightout.com",
    year: "2026",
    description:
      "A curated guide to the best bars, restaurants, and local hangouts in Vero Beach, with clear vibes for every spot.",
  },
  {
    href: "https://checkcheck.app",
    title: "checkcheck.app",
    year: "2026",
    description:
      "A minimalist checklist app that lets you easily create tasks, sort, and use keyboard shortcuts.",
  },
  {
    href: "https://valeriechiang.com",
    title: "valeriechiang.com",
    year: "2025",
    description:
      "A portfolio site for a New York City photographer and filmmaker, built with Payload CMS.",
  },
  {
    href: "https://thenewrepublic.com",
    title: "thenewrepublic.com",
    year: "Ongoing",
    description:
      "Reader-facing features and custom editorial CMS tooling for the magazine, built and shipped front to back.",
  },
  {
    href: "https://oib.beer",
    title: "oib.beer",
    year: "2025",
  },
]

export function projectSearchText(project: Project): string {
  return [project.title, project.year, project.description ?? ""]
    .join(" ")
    .toLowerCase()
}
