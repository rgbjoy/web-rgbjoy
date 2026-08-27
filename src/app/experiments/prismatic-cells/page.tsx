"use client";

import { ShaderPrismaticCellsCanvas } from "./PrismaticCellsBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderPrismaticCellsCanvas />
    </main>
  );
}
