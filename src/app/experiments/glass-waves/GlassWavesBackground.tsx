"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei/legacy";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useEffect, useMemo, useRef } from "react";
import { ShaderMaterial, Vector2 } from "three";

import fragmentShader from "./glassWaves.frag";
import { acrossLines, LINE_COUNT, restingLines, stepLines, zoomAt, type Line } from "./waves";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./GlassWavesBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
  uAspectRatio: number;
  uLineShift: Float32Array;
};

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uAspectRatio: 1,
  uLineShift: new Float32Array(LINE_COUNT),
};

const GlassWavesMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader,
);

extend({ GlassWavesMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    glassWavesMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>;
  }
}

/** The pointer's horizontal position in NDC, plus whether it is over the page. */
type ScreenPointer = { x: number; active: boolean };

const ShaderGlassWaves: FC = memo(() => {
  const materialRef = useRef<ShaderMaterial & Partial<Uniforms>>(null);
  const { size, gl } = useThree();
  const screenPointer = useRef<ScreenPointer>({ x: 0, active: false });
  const simulation = useRef<Line[]>(restingLines());
  const shifts = useMemo(() => new Float32Array(LINE_COUNT), []);

  useEffect(() => {
    const canvas = gl.domElement;
    const move = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      screenPointer.current = {
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        active: true,
      };
    };
    const leave = () => {
      screenPointer.current.active = false;
    };
    // A lifted finger lets the strips settle back; a mouse keeps pushing until it leaves.
    const lift = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") leave();
    };
    const root = document.documentElement;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", move);
    window.addEventListener("pointerup", lift);
    window.addEventListener("pointercancel", leave);
    window.addEventListener("blur", leave);
    root.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.removeEventListener("pointerup", lift);
      window.removeEventListener("pointercancel", leave);
      window.removeEventListener("blur", leave);
      root.removeEventListener("pointerleave", leave);
    };
  }, [gl]);

  useFrame(({ elapsed }, delta) => {
    if (!materialRef.current) return;
    const { x, active } = screenPointer.current;
    const across = acrossLines(x, size.width / size.height, zoomAt(elapsed));
    stepLines(simulation.current, { across, active }, delta);
    shifts.set(simulation.current.map((line) => line.shift));

    materialRef.current.uTime = elapsed;
    materialRef.current.uAspectRatio = size.width / size.height;

    if (materialRef.current.uResolution instanceof Vector2) {
      materialRef.current.uResolution.set(size.width, size.height);
    }
  });

  return (
    <ScreenQuad>
      <glassWavesMaterial
        key={GlassWavesMaterial.key}
        ref={materialRef}
        uTime={0}
        uResolution={new Vector2(size.width, size.height)}
        uAspectRatio={1}
        uLineShift={shifts}
      />
    </ScreenQuad>
  );
});

ShaderGlassWaves.displayName = "ShaderGlassWaves";

export const ShaderGlassWavesCanvas: FC = () => (
  <Canvas className={styles.canvas} gl={{ alpha: false, antialias: true }} style={{ background: "#000" }}>
    <ShaderGlassWaves />
  </Canvas>
);
