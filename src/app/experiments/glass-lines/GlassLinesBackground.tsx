"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei/legacy";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useEffect, useMemo, useRef } from "react";
import { ShaderMaterial, Vector2 } from "three";

import fragmentShader from "./glassLines.frag";
import {
  LINE_COUNT,
  restingLines,
  stepLines,
  toLineSpace,
  zoomAt,
  type Line,
  type Pointer,
} from "./lines";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./GlassLinesBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
  uLineShift: Float32Array;
  uBumpAlong: number;
};

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uLineShift: new Float32Array(LINE_COUNT),
  uBumpAlong: 0,
};

const GlassLinesMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader,
);

extend({ GlassLinesMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    glassLinesMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>;
  }
}

/** The pointer in NDC, plus whether it is over the page. */
type ScreenPointer = { x: number; y: number; active: boolean };

const ShaderGlassLines: FC = memo(() => {
  const materialRef = useRef<ShaderMaterial & Partial<Uniforms>>(null);
  const { size, gl } = useThree();
  const screenPointer = useRef<ScreenPointer>({ x: 0, y: 0, active: false });
  const simulation = useRef<Line[]>(restingLines());
  // Where along the lines the bulge sits; it stays put while the lines relax after the pointer leaves.
  const bumpAlong = useRef(0);
  const shifts = useMemo(() => new Float32Array(LINE_COUNT), []);

  useEffect(() => {
    const canvas = gl.domElement;
    const move = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      screenPointer.current = {
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: 1 - ((event.clientY - bounds.top) / bounds.height) * 2,
        active: true,
      };
    };
    const leave = () => {
      screenPointer.current.active = false;
    };
    // A lifted finger lets the lines settle back; a mouse keeps pushing until it leaves.
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
    const { x, y, active } = screenPointer.current;
    const { across, along } = toLineSpace(x, y, size.width / size.height, zoomAt(elapsed));
    if (active) bumpAlong.current = along;
    const pointer: Pointer = { across, along, active };
    stepLines(simulation.current, pointer, delta);
    shifts.set(simulation.current.map((line) => line.shift));

    materialRef.current.uTime = elapsed;
    materialRef.current.uBumpAlong = bumpAlong.current;

    if (materialRef.current.uResolution instanceof Vector2) {
      materialRef.current.uResolution.set(size.width, size.height);
    }
  });

  return (
    <ScreenQuad>
      <glassLinesMaterial
        key={GlassLinesMaterial.key}
        ref={materialRef}
        uTime={0}
        uResolution={new Vector2(size.width, size.height)}
        uLineShift={shifts}
        uBumpAlong={0}
      />
    </ScreenQuad>
  );
});

ShaderGlassLines.displayName = "ShaderGlassLines";

export const ShaderGlassLinesCanvas: FC = () => (
  <Canvas className={styles.canvas} gl={{ alpha: false, antialias: false }} style={{ background: "#000" }}>
    <ShaderGlassLines />
  </Canvas>
);
