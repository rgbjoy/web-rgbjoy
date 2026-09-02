"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useEffect, useRef } from "react";
import GUI from "lil-gui";
import { ShaderMaterial, Vector2, Vector3 } from "three";

import fragmentShader from "./moon.frag";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./MoonWavesBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
  uDirectionAngle: number;
  uMoonPosition: Vector3;
  uDebugMode: number;
};

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uDirectionAngle: 0,
  uMoonPosition: new Vector3(-0.8, 0.1, 0.0),
  uDebugMode: 0,
};

const MoonWavesMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader
);

extend({ MoonWavesMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    moonWavesMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>;
  }
}

const ShaderMoonWaves: FC = memo(() => {
  const materialRef = useRef<(ShaderMaterial & Uniforms) | null>(null);
  const { size } = useThree();

  const paramsRef = useRef({
    angle: -0.488592653589793,
    moonX: -0.8,
    moonY: 0.1,
    moonZ: 0,
    debugMode: 0,
  });
  const guiRef = useRef<GUI | null>(null);

  useEffect(() => {
    const gui = new GUI({ title: "Moon Waves" });
    guiRef.current = gui;

    // Keep the UI value in sync with the shader uniform, without re-rendering React.
    const controller = gui
      .add(paramsRef.current, "angle", -Math.PI, Math.PI, 0.001)
      .name("Direction Angle");

    controller.onChange((value: number) => {
      if (!materialRef.current) return;
      materialRef.current.uDirectionAngle = value;
    });

    // Set initial value once the material exists.
    if (materialRef.current) {
      materialRef.current.uDirectionAngle = paramsRef.current.angle;
      materialRef.current.uMoonPosition.set(
        paramsRef.current.moonX,
        paramsRef.current.moonY,
        paramsRef.current.moonZ,
      );
      materialRef.current.uDebugMode = paramsRef.current.debugMode;
    }

    const moonFolder = gui.addFolder("Moon Position");
    moonFolder
      .add(paramsRef.current, "moonX", -2, 2, 0.001)
      .name("X")
      .onChange((value: number) => {
        if (!materialRef.current) return;
        materialRef.current.uMoonPosition.set(
          value,
          paramsRef.current.moonY,
          paramsRef.current.moonZ,
        );
      });
    moonFolder
      .add(paramsRef.current, "moonY", -2, 2, 0.001)
      .name("Y")
      .onChange((value: number) => {
        if (!materialRef.current) return;
        materialRef.current.uMoonPosition.set(
          paramsRef.current.moonX,
          value,
          paramsRef.current.moonZ,
        );
      });
    moonFolder
      .add(paramsRef.current, "moonZ", -2, 2, 0.001)
      .name("Z")
      .onChange((value: number) => {
        if (!materialRef.current) return;
        materialRef.current.uMoonPosition.set(
          paramsRef.current.moonX,
          paramsRef.current.moonY,
          value,
        );
      });

    const debugFolder = gui.addFolder("Debug View");
    debugFolder
      .add(paramsRef.current, "debugMode", 0, 4, 1)
      .name("Mode")
      .onChange((value: number) => {
        if (!materialRef.current) return;
        materialRef.current.uDebugMode = value;
      });

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

  useFrame(({ elapsed }) => {
    if (!materialRef.current) return;
    materialRef.current.uTime = elapsed;
    if (materialRef.current.uResolution instanceof Vector2) {
      materialRef.current.uResolution.set(size.width, size.height);
    }
  });

  return (
    <ScreenQuad>
      <moonWavesMaterial key={MoonWavesMaterial.key} ref={materialRef} />
    </ScreenQuad>
  );
});

ShaderMoonWaves.displayName = "ShaderMoonWaves";

export const ShaderMoonWavesCanvas: FC = () => (
  <Canvas className={styles.canvas} gl={{ alpha: false, antialias: false }}>
    <ShaderMoonWaves />
  </Canvas>
);
