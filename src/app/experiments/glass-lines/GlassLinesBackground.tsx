"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useRef } from "react";
import { ShaderMaterial, Vector2 } from "three";

import fragmentShader from "./glassLines.frag";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./GlassLinesBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
};

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
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

const ShaderGlassLines: FC = memo(() => {
  const materialRef = useRef<ShaderMaterial & Partial<Uniforms>>(null);
  const { size } = useThree();

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = clock.elapsedTime;

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
