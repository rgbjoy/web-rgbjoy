import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import styles from "./BackLink.module.css"

/** One way out, pinned top-left: every experiment steps back out to the site. */
export function BackLink() {
  return (
    <Link
      href="/"
      scroll={false}
      className={styles.back}
      aria-label="Back to rgbjoy.com"
    >
      <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
      rgbjoy.com
    </Link>
  )
}
