import type { Metadata } from "next"
import Link from "next/link"

import { catalogExperiments } from "../data/content"
import { EXPERIMENT_GROUPS } from "../data/experiments"
import { SITE } from "../data/site"
import { getPublicCatalog } from "../server/content"
import styles from "./page.module.css"

export const metadata: Metadata = {
  title: `Experiments — ${SITE.name}`,
  alternates: { canonical: "/experiments" },
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function formatDate(date: string): string {
  const [year, month] = date.split("-")
  return `${MONTHS[parseInt(month, 10) - 1] ?? ""} ’${year.slice(2)}`
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export default async function ExperimentsPage() {
  const experiments = catalogExperiments(await getPublicCatalog()).sort((a, b) =>
    b.date.localeCompare(a.date),
  )
  const groups = EXPERIMENT_GROUPS.map((name) => ({
    name,
    items: experiments.filter((experiment) => experiment.group === name),
  })).filter((group) => group.items.length > 0)

  return (
    <main className={styles.index}>
      <h1 className={styles.heading}>
        <span className={styles.headingName}>experiments</span>
        <span className={styles.rule} aria-hidden="true" />
        <span className={styles.headingCount}>{pad2(experiments.length)}</span>
      </h1>

      {groups.map((group) => (
        <section key={group.name} className={styles.group}>
          <h2 className={styles.heading}>
            <span className={styles.groupName}>{group.name}</span>
            <span className={styles.rule} aria-hidden="true" />
            <span className={styles.groupCount}>{pad2(group.items.length)}</span>
          </h2>

          {group.items.map((experiment) => (
            <Link key={experiment.href} href={experiment.href} className={styles.item}>
              <div className={styles.itemBody}>
                <span className={styles.itemTitle}>{experiment.title}</span>
                <p className={styles.itemDesc}>{experiment.description}</p>
                {experiment.tech.length > 0 && (
                  <ul className={styles.itemTech}>
                    {experiment.tech.map((name) => (
                      <li key={name} className={styles.itemTechTag}>
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span className={styles.itemDate}>{formatDate(experiment.date)}</span>
            </Link>
          ))}
        </section>
      ))}
    </main>
  )
}
