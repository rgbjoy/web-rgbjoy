"use client";

import { ShaderUnbreakingWavesCanvas } from "./UnbreakingWavesBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderUnbreakingWavesCanvas />
    </main>
  );
}
