"use client";

import { ShaderGlassCrossCanvas } from "./GlassCrossBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderGlassCrossCanvas />
    </main>
  );
}
