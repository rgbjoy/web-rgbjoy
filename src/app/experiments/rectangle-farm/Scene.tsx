"use client";

import { Canvas } from "@react-three/fiber";

import { RectangleFarmCanvas } from "./RectangleFarm";
import styles from "./page.module.css";

export default function Page() {
  return (
    <main className={styles.main}>
      <Canvas
        className={styles.canvas}
        dpr={[1, 1.5]}
        frameloop="always"
        gl={{ antialias: true }}
      >
        <RectangleFarmCanvas />
      </Canvas>
    </main>
  );
}
