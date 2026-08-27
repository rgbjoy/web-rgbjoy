"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useEffect, useRef } from "react";
import GUI from "lil-gui";
import { ShaderMaterial, Vector2 } from "three";

import fragmentShader from "./unbreakingWaves.frag";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./UnbreakingWavesBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
  uSpeed: number;
  uFogMix: number;
  uEdgeSoftness: number;
  uBaseWashStrength: number;
  uFlowToFull: number;
  uSpin: number;
  uPetalK: number;
  uBaseR: number;
  uPetalAmp: number;
  uOrbitCenter: Vector2;
  uPetalSize: Vector2;
  uPaletteScrollSpeed: number;
  uDirection: number;
};

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uSpeed: 0.55,
  uFogMix: 0.06,
  uEdgeSoftness: 0.125,
  uBaseWashStrength: 0.18,
  uFlowToFull: 0.12,
  uSpin: 0.22,
  uPetalK: 4.0,
  uBaseR: 0.4,
  uPetalAmp: 0.18,
  uOrbitCenter: new Vector2(0.5, 0.5),
  uPetalSize: new Vector2(1.0, 1.25),
  uPaletteScrollSpeed: 0.22,
  uDirection: 0,
};

const UnbreakingWavesMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader,
);

extend({ UnbreakingWavesMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    unbreakingWavesMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>;
  }
}

const ShaderUnbreakingWaves: FC = memo(() => {
  const materialRef = useRef<(ShaderMaterial & Uniforms) | null>(null);
  const { size } = useThree();

  const paramsRef = useRef({
    speed: INITIAL_UNIFORMS.uSpeed,
    fogMix: INITIAL_UNIFORMS.uFogMix,
    edgeSoftness: INITIAL_UNIFORMS.uEdgeSoftness,
    baseWashStrength: INITIAL_UNIFORMS.uBaseWashStrength,
    flowToFull: INITIAL_UNIFORMS.uFlowToFull,
    spin: INITIAL_UNIFORMS.uSpin,
    petalK: INITIAL_UNIFORMS.uPetalK,
    baseR: INITIAL_UNIFORMS.uBaseR,
    petalAmp: INITIAL_UNIFORMS.uPetalAmp,
    orbitX: INITIAL_UNIFORMS.uOrbitCenter.x,
    orbitY: INITIAL_UNIFORMS.uOrbitCenter.y,
    petalSizeX: INITIAL_UNIFORMS.uPetalSize.x,
    petalSizeY: INITIAL_UNIFORMS.uPetalSize.y,
    paletteScrollSpeed: INITIAL_UNIFORMS.uPaletteScrollSpeed,
    directionDeg: 0,
  });
  const guiRef = useRef<GUI | null>(null);

  useEffect(() => {
    const gui = new GUI({ title: "Unbreaking Waves" });
    guiRef.current = gui;

    const syncMaterial = () => {
      const mat = materialRef.current;
      const p = paramsRef.current;
      if (!mat) return;
      mat.uSpeed = p.speed;
      mat.uFogMix = p.fogMix;
      mat.uEdgeSoftness = p.edgeSoftness;
      mat.uBaseWashStrength = p.baseWashStrength;
      mat.uFlowToFull = p.flowToFull;
      mat.uSpin = p.spin;
      mat.uPetalK = p.petalK;
      mat.uBaseR = p.baseR;
      mat.uPetalAmp = p.petalAmp;
      mat.uOrbitCenter.set(p.orbitX, p.orbitY);
      mat.uPetalSize.set(p.petalSizeX, p.petalSizeY);
      mat.uPaletteScrollSpeed = p.paletteScrollSpeed;
      mat.uDirection = (p.directionDeg * Math.PI) / 180;
    };

    const motionFolder = gui.addFolder("Motion");
    motionFolder
      .add(paramsRef.current, "directionDeg", 0, 360, 1)
      .name("Direction (°)")
      .onChange(syncMaterial);
    motionFolder.add(paramsRef.current, "speed", 0.05, 2, 0.01).name("Wave speed").onChange(syncMaterial);
    motionFolder.add(paramsRef.current, "spin", -1, 1, 0.01).name("Orbit spin").onChange(syncMaterial);
    motionFolder
      .add(paramsRef.current, "paletteScrollSpeed", 0, 1, 0.01)
      .name("Palette scroll")
      .onChange(syncMaterial);
    motionFolder.open();

    const petalsFolder = gui.addFolder("Petals");
    petalsFolder.add(paramsRef.current, "petalK", 1, 12, 0.1).name("Petal count (K)").onChange(syncMaterial);
    petalsFolder.add(paramsRef.current, "baseR", 0.1, 0.9, 0.01).name("Orbit radius").onChange(syncMaterial);
    petalsFolder.add(paramsRef.current, "petalAmp", 0, 0.5, 0.01).name("Radius wobble").onChange(syncMaterial);
    petalsFolder.add(paramsRef.current, "petalSizeX", 0.4, 2.5, 0.01).name("Petal width").onChange(syncMaterial);
    petalsFolder.add(paramsRef.current, "petalSizeY", 0.4, 2.5, 0.01).name("Petal height").onChange(syncMaterial);

    const centerFolder = gui.addFolder("Center");
    centerFolder.add(paramsRef.current, "orbitX", 0, 1, 0.01).name("Orbit X").onChange(syncMaterial);
    centerFolder.add(paramsRef.current, "orbitY", 0, 1, 0.01).name("Orbit Y").onChange(syncMaterial);

    const lookFolder = gui.addFolder("Look");
    lookFolder.add(paramsRef.current, "fogMix", 0, 0.4, 0.01).name("Fog mix").onChange(syncMaterial);
    lookFolder.add(paramsRef.current, "edgeSoftness", 0.02, 0.35, 0.005).name("Edge softness").onChange(syncMaterial);
    lookFolder
      .add(paramsRef.current, "baseWashStrength", 0, 0.6, 0.01)
      .name("Base wash")
      .onChange(syncMaterial);
    lookFolder.add(paramsRef.current, "flowToFull", 0, 0.5, 0.01).name("Flow to full").onChange(syncMaterial);

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
      <unbreakingWavesMaterial key={UnbreakingWavesMaterial.key} ref={materialRef} uTime={0} />
    </ScreenQuad>
  );
});

ShaderUnbreakingWaves.displayName = "ShaderUnbreakingWaves";

export const ShaderUnbreakingWavesCanvas: FC = () => (
  <Canvas className={styles.canvas} gl={{ alpha: false, antialias: false }}>
    <ShaderUnbreakingWaves />
  </Canvas>
);
