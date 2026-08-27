"use client";

import { ShaderGlassLinesCanvas } from "./GlassLinesBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderGlassLinesCanvas />
    </main>
  );
}
