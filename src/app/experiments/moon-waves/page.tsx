"use client";

import { ShaderMoonWavesCanvas } from "./MoonWavesBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderMoonWavesCanvas />
    </main>
  );
}
