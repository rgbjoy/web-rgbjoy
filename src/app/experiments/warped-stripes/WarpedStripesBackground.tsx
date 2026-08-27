"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useEffect, useRef } from "react";
import GUI from "lil-gui";
import { ShaderMaterial, Vector2, Vector3 } from "three";

import fragmentShader from "./warpedStripes.frag";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./WarpedStripesBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
  uAngle: number;
  uTimeScale: number;
  uStripeDensity: number;
  uWarpLarge: number;
  uWarpMedium: number;
  uWarpFine: number;
  uEdgeSoftness: number;
  uGapColor: Vector3;
  uLineColor: Vector3;
};

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uAngle: 0.4,
  uTimeScale: 0.15,
  uStripeDensity: 17.0,
  uWarpLarge: 0.45,
  uWarpMedium: 0.15,
  uWarpFine: 0.02,
  uEdgeSoftness: 0.3,
  uGapColor: new Vector3(0.09, 0.1, 0.122),
  uLineColor: new Vector3(0.625, 0.165, 0.2),
};

const WarpedStripesMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader,
);

extend({ WarpedStripesMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    warpedStripesMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>;
  }
}

const colorToGui = (color: Vector3) => ({
  r: color.x,
  g: color.y,
  b: color.z,
});

const ShaderWarpedStripes: FC = memo(() => {
  const materialRef = useRef<(ShaderMaterial & Uniforms) | null>(null);
  const { size } = useThree();

  const paramsRef = useRef({
    angle: INITIAL_UNIFORMS.uAngle,
    timeScale: INITIAL_UNIFORMS.uTimeScale,
    stripeDensity: INITIAL_UNIFORMS.uStripeDensity,
    warpLarge: INITIAL_UNIFORMS.uWarpLarge,
    warpMedium: INITIAL_UNIFORMS.uWarpMedium,
    warpFine: INITIAL_UNIFORMS.uWarpFine,
    edgeSoftness: INITIAL_UNIFORMS.uEdgeSoftness,
    gapColor: colorToGui(INITIAL_UNIFORMS.uGapColor),
    lineColor: colorToGui(INITIAL_UNIFORMS.uLineColor),
  });

  useEffect(() => {
    const gui = new GUI({ title: "Warped Stripes" });

    const syncMaterial = () => {
      const mat = materialRef.current;
      const p = paramsRef.current;
      if (!mat) return;

      mat.uAngle = p.angle;
      mat.uTimeScale = p.timeScale;
      mat.uStripeDensity = p.stripeDensity;
      mat.uWarpLarge = p.warpLarge;
      mat.uWarpMedium = p.warpMedium;
      mat.uWarpFine = p.warpFine;
      mat.uEdgeSoftness = p.edgeSoftness;
      mat.uGapColor.set(p.gapColor.r, p.gapColor.g, p.gapColor.b);
      mat.uLineColor.set(p.lineColor.r, p.lineColor.g, p.lineColor.b);
    };

    const motionFolder = gui.addFolder("Motion");
    motionFolder.add(paramsRef.current, "angle", 0, 1.57, 0.01).name("Angle").onChange(syncMaterial);
    motionFolder.add(paramsRef.current, "timeScale", 0, 0.5, 0.01).name("Time scale").onChange(syncMaterial);
    motionFolder.open();

    const patternFolder = gui.addFolder("Pattern");
    patternFolder.add(paramsRef.current, "stripeDensity", 4, 40, 0.5).name("Stripe density").onChange(syncMaterial);
    patternFolder.add(paramsRef.current, "edgeSoftness", 0.05, 0.6, 0.01).name("Edge softness").onChange(syncMaterial);

    const warpFolder = gui.addFolder("Warp");
    warpFolder.add(paramsRef.current, "warpLarge", 0, 1, 0.01).name("Large").onChange(syncMaterial);
    warpFolder.add(paramsRef.current, "warpMedium", 0, 0.5, 0.01).name("Medium").onChange(syncMaterial);
    warpFolder.add(paramsRef.current, "warpFine", 0, 0.1, 0.001).name("Fine").onChange(syncMaterial);

    const colorFolder = gui.addFolder("Colors");
    colorFolder.addColor(paramsRef.current, "gapColor").name("Gap").onChange(syncMaterial);
    colorFolder.addColor(paramsRef.current, "lineColor").name("Line").onChange(syncMaterial);
    colorFolder.open();

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
      <warpedStripesMaterial key={WarpedStripesMaterial.key} ref={materialRef} uTime={0} />
    </ScreenQuad>
  );
});

ShaderWarpedStripes.displayName = "ShaderWarpedStripes";

export const ShaderWarpedStripesCanvas: FC = () => (
  <Canvas className={styles.canvas} gl={{ alpha: false, antialias: false }}>
    <ShaderWarpedStripes />
  </Canvas>
);
