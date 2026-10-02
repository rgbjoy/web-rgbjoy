"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei/legacy";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useEffect, useMemo, useRef } from "react";
import { ShaderMaterial, Vector2 } from "three";

import fragmentShader from "./glassPoint.frag";
import {
  gridHomes,
  POINT_COUNT,
  restingPoints,
  stepPoints,
  type LensPoint,
  type Pointer,
} from "./points";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./GlassPointBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
  uAspectRatio: number;
  uPoints: Vector2[];
};

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uAspectRatio: 1,
  uPoints: Array.from({ length: POINT_COUNT }, () => new Vector2()),
};

const GlassPointMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader,
);

extend({ GlassPointMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    glassPointMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>;
  }
}

const ShaderGlassPoint: FC = memo(() => {
  const materialRef = useRef<ShaderMaterial & Partial<Uniforms>>(null);
  const { size, gl } = useThree();
  const pointer = useRef<Pointer>({ x: 0, y: 0, active: false });
  const simulation = useRef<LensPoint[] | null>(null);
  const lensPoints = useMemo(
    () => Array.from({ length: POINT_COUNT }, () => new Vector2()),
    [],
  );
  // A resize moves the homes; the points spring over to the new grid.
  const homes = useMemo(() => gridHomes(size.width / size.height), [size.width, size.height]);

  // The pointer in lens space: x scaled by the aspect ratio, screen height 2.
  useEffect(() => {
    const canvas = gl.domElement;
    const move = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.current = {
        x: (((event.clientX - bounds.left) / bounds.width) * 2 - 1) * (bounds.width / bounds.height),
        y: 1 - ((event.clientY - bounds.top) / bounds.height) * 2,
        active: true,
      };
    };
    const leave = () => {
      pointer.current.active = false;
    };
    // A lifted finger lets the points settle back; a mouse keeps pushing until it leaves.
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
    simulation.current ??= restingPoints(homes);
    stepPoints(simulation.current, homes, pointer.current, delta);
    simulation.current.forEach((point, i) => lensPoints[i].set(point.x, point.y));

    materialRef.current.uTime = elapsed;
    materialRef.current.uAspectRatio = size.width / size.height;

    if (materialRef.current.uResolution instanceof Vector2) {
      materialRef.current.uResolution.set(size.width, size.height);
    }
  });

  return (
    <ScreenQuad>
      <glassPointMaterial
        key={GlassPointMaterial.key}
        ref={materialRef}
        uTime={0}
        uResolution={new Vector2(size.width, size.height)}
        uAspectRatio={1}
        uPoints={lensPoints}
      />
    </ScreenQuad>
  );
});

ShaderGlassPoint.displayName = "ShaderGlassPoint";

export const ShaderGlassPointCanvas: FC = () => (
  <Canvas className={styles.canvas} gl={{ alpha: false, antialias: true }} style={{ background: "#000" }}>
    <ShaderGlassPoint />
  </Canvas>
);
