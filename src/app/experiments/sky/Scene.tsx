"use client";

import { ShaderSkyAtmosphereCanvas } from "./SkyAtmosphereBackground";

import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <ShaderSkyAtmosphereCanvas />
    </main>
  );
}
