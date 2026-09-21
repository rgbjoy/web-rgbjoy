"use client";

import { ShaderGlassGridCanvas } from "./GlassGridBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderGlassGridCanvas />
    </main>
  );
}
