"use client"

import Link from "next/link"

import brandStyles from "../utilities/Brand.module.css"
import { SmileIcon } from "../utilities/SmileIcon"
import { StudioMenu } from "./StudioMenu"
import styles from "./StudioNav.module.css"
import { useActiveSection } from "./useActiveSection"

const LINKS = [
  { label: "ai", id: "without-the-slop" },
  { label: "details", id: "the-details" },
  { label: "steps", id: "every-step" },
]

const WATCHED = [...LINKS.map((link) => link.id), "estimate"]

/** Marks a link as the section being read, for the styles and for screen readers. */
function current(active: boolean) {
  return active ? ("location" as const) : undefined
}

/** A floating frosted menu that stays at the top while the page scrolls, like Framelet's and Scriptlet's. */
export function StudioNav() {
  const active = useActiveSection(WATCHED)

  return (
    <header className={styles.bar}>
      <nav className={styles.nav} aria-label="Studio">
        <Link href="/" className={`${brandStyles.brand} ${styles.brand}`}>
          <span className={brandStyles.mark}>
            <SmileIcon size={34} />
          </span>
          <span className={brandStyles.wordmark}>rgbjoy</span>
        </Link>
        <div className={styles.links}>
          {LINKS.map((link) => (
            <a key={link.id} href={`#${link.id}`} aria-current={current(active === link.id)}>
              {link.label}
            </a>
          ))}
        </div>
        <a href="#estimate" className={styles.cta} aria-current={current(active === "estimate")}>
          estimate
        </a>
        <StudioMenu links={LINKS} active={active} />
      </nav>
    </header>
  )
}
