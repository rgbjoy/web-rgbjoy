"use client";

import { ShaderGlassWavesCanvas } from "./GlassWavesBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderGlassWavesCanvas />
    </main>
  );
}
