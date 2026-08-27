"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useRef } from "react";
import { ShaderMaterial, Vector2 } from "three";

import fragmentShader from "./glassWaves.frag";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./GlassWavesBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
  uAspectRatio: number;
};

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uAspectRatio: 1,
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

const ShaderGlassWaves: FC = memo(() => {
  const materialRef = useRef<ShaderMaterial & Partial<Uniforms>>(null);
  const { size } = useThree();

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = clock.elapsedTime;
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
