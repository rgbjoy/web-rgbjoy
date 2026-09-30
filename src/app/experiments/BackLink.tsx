"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import styles from "./BackLink.module.css"

/** One way out, pinned top-left: an experiment steps up to the index, and the
 *  index steps back out to the site. */
export function BackLink() {
  const atIndex = usePathname() === "/experiments"
  const label = atIndex ? "rgbjoy.com" : "experiments"

  return (
    <Link
      href={atIndex ? "/" : "/experiments"}
      className={styles.back}
      aria-label={`Back to ${label}`}
    >
      <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
      {label}
    </Link>
  )
}
