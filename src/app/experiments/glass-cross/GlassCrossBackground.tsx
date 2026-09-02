"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei/legacy";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useRef } from "react";
import { ShaderMaterial, Vector2 } from "three";

import fragmentShader from "./glassCross.frag";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./GlassCrossBackground.module.css";

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

const GlassCrossMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader,
);

extend({ GlassCrossMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    glassCrossMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>;
  }
}

const ShaderGlassCross: FC = memo(() => {
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
      <glassCrossMaterial
        key={GlassCrossMaterial.key}
        ref={materialRef}
        uTime={0}
        uResolution={new Vector2(size.width, size.height)}
        uAspectRatio={1}
      />
    </ScreenQuad>
  );
});

ShaderGlassCross.displayName = "ShaderGlassCross";

export const ShaderGlassCrossCanvas: FC = () => (
  <Canvas className={styles.canvas} gl={{ alpha: false, antialias: true }} style={{ background: "#000" }}>
    <ShaderGlassCross />
  </Canvas>
);
