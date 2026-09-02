"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei/legacy";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useRef } from "react";
import { ShaderMaterial, Vector2 } from "three";

import fragmentShader from "./glassPoint.frag";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./GlassPointBackground.module.css";

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
  const { size } = useThree();

  useFrame(({ elapsed }) => {
    if (!materialRef.current) return;
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
