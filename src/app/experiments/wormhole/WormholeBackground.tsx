"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useRef } from "react";
import { ShaderMaterial, Vector2 } from "three";

import fragmentShader from "./wormhole.frag";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./WormholeBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
};

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
};

const WormholeMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader
);

extend({ WormholeMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    wormholeMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>;
  }
}

const ShaderWormhole: FC = memo(() => {
  const materialRef = useRef<ShaderMaterial & Partial<Uniforms>>(null);
  const { size } = useThree();

  useFrame(({ elapsed }) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = elapsed;

    if (materialRef.current.uResolution instanceof Vector2) {
      materialRef.current.uResolution.set(size.width, size.height);
    }
  });

  return (
    <ScreenQuad>
      <wormholeMaterial
        key={WormholeMaterial.key}
        ref={materialRef}
        uTime={0}
        uResolution={new Vector2(size.width, size.height)}
      />
    </ScreenQuad>
  );
});

ShaderWormhole.displayName = "ShaderWormhole";

export const ShaderWormholeCanvas: FC = () => (
  <Canvas className={styles.canvas} gl={{ alpha: false, antialias: false }}>
    <ShaderWormhole />
  </Canvas>
);
