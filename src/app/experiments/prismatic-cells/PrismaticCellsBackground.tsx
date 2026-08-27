"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useEffect, useRef } from "react";
import GUI from "lil-gui";
import { ShaderMaterial, Vector2 } from "three";

import fragmentShader from "./prismaticCells.frag";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./PrismaticCellsBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
  uTimeScale: number;
  uStepZ: number;
  uWarpFreq: number;
  uSinBias: number;
  uWarpStrength: number;
  uCellGlow: number;
  uCellScale: number;
};

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uTimeScale: 1.0,
  uStepZ: 0.07,
  uWarpFreq: 9.0,
  uSinBias: 1.0,
  uWarpStrength: 1.0,
  uCellGlow: 0.01,
  uCellScale: 1.0,
};

const PrismaticCellsMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader,
);

extend({ PrismaticCellsMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    prismaticCellsMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>;
  }
}

const ShaderPrismaticCells: FC = memo(() => {
  const materialRef = useRef<(ShaderMaterial & Uniforms) | null>(null);
  const { size } = useThree();

  const paramsRef = useRef({
    timeScale: INITIAL_UNIFORMS.uTimeScale,
    stepZ: INITIAL_UNIFORMS.uStepZ,
    warpFreq: INITIAL_UNIFORMS.uWarpFreq,
    sinBias: INITIAL_UNIFORMS.uSinBias,
    warpStrength: INITIAL_UNIFORMS.uWarpStrength,
    cellGlow: INITIAL_UNIFORMS.uCellGlow,
    cellScale: INITIAL_UNIFORMS.uCellScale,
  });
  const guiRef = useRef<GUI | null>(null);

  useEffect(() => {
    const gui = new GUI({ title: "Prismatic Cells" });
    guiRef.current = gui;

    const syncMaterial = () => {
      const mat = materialRef.current;
      const p = paramsRef.current;
      if (!mat) return;
      mat.uTimeScale = p.timeScale;
      mat.uStepZ = p.stepZ;
      mat.uWarpFreq = p.warpFreq;
      mat.uSinBias = p.sinBias;
      mat.uWarpStrength = p.warpStrength;
      mat.uCellGlow = p.cellGlow;
      mat.uCellScale = p.cellScale;
    };

    const motionFolder = gui.addFolder("Motion");
    motionFolder.add(paramsRef.current, "timeScale", 0.1, 4, 0.05).name("Time scale").onChange(syncMaterial);
    motionFolder.add(paramsRef.current, "stepZ", 0.01, 0.2, 0.005).name("Depth step").onChange(syncMaterial);
    motionFolder.open();

    const warpFolder = gui.addFolder("Warp");
    warpFolder.add(paramsRef.current, "warpFreq", 1, 24, 0.1).name("Warp frequency").onChange(syncMaterial);
    warpFolder.add(paramsRef.current, "sinBias", 0, 3, 0.05).name("Sin bias").onChange(syncMaterial);
    warpFolder
      .add(paramsRef.current, "warpStrength", 0, 3, 0.05)
      .name("Warp strength")
      .onChange(syncMaterial);

    const cellFolder = gui.addFolder("Cells");
    cellFolder
      .add(paramsRef.current, "cellGlow", 0.001, 0.05, 0.001)
      .name("Glow")
      .onChange(syncMaterial);
    cellFolder.add(paramsRef.current, "cellScale", 0.25, 4, 0.05).name("Cell scale").onChange(syncMaterial);

    syncMaterial();

    let isHidden = true;
    const setGuiHidden = (hidden: boolean) => {
      const el = gui.domElement;
      if (!el) return;
      isHidden = hidden;
      el.style.display = hidden ? "none" : "";
    };
    setGuiHidden(true);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key.toLowerCase() !== "h") return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (target?.isContentEditable) return;

      setGuiHidden(!isHidden);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      gui.destroy();
      guiRef.current = null;
    };
  }, []);

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = clock.elapsedTime;

    if (materialRef.current.uResolution instanceof Vector2) {
      materialRef.current.uResolution.set(size.width, size.height);
    }
  });

  return (
    <ScreenQuad>
      <prismaticCellsMaterial key={PrismaticCellsMaterial.key} ref={materialRef} uTime={0} />
    </ScreenQuad>
  );
});

ShaderPrismaticCells.displayName = "ShaderPrismaticCells";

export const ShaderPrismaticCellsCanvas: FC = () => (
  <Canvas className={styles.canvas} gl={{ alpha: false, antialias: false }}>
    <ShaderPrismaticCells />
  </Canvas>
);
