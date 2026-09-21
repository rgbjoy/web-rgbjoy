"use client";

import { ShaderGradientCanvas } from "./BackgroundGradient";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderGradientCanvas />
    </main>
  );
}
