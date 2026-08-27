"use client";

import { ShaderWarpedStripesCanvas } from "./WarpedStripesBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderWarpedStripesCanvas />
    </main>
  );
}
