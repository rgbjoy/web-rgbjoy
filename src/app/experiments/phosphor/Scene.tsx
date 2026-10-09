"use client"

import { PhosphorCanvas } from "./Phosphor"
import styles from "./page.module.css"

export default function Page() {
  return (
    <main
      className={styles.main}
      aria-label="Large soft blocks of colour, some crisp-edged and some smeared, with faint ghosted copies of each other, seen through the staggered slot mask of a CRT screen and a layer of moving grain. Every few seconds the picture cuts to a new frame in a ragged wipe. Click or press space for a new frame, R to roll every setting at random, S to save it as a 4K PNG."
    >
      <PhosphorCanvas />
    </main>
  )
}
