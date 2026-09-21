"use client";

import { ShaderWormholeCanvas } from "./WormholeBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderWormholeCanvas />
    </main>
  );
}
