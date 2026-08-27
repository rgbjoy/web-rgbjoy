"use client";

import { ShaderGlassPointCanvas } from "./GlassPointBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderGlassPointCanvas />
    </main>
  );
}
