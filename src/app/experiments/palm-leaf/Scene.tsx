"use client";

import { ShaderPalmLeafCanvas } from "./PalmLeafBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderPalmLeafCanvas />
    </main>
  );
}
