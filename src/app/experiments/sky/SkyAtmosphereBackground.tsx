"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import React, { type FC, memo, useEffect, useRef } from "react";
import GUI from "lil-gui";
import { ShaderMaterial, Vector2, Vector3, Vector4 } from "three";

import fragmentShader from "./sky.frag";
import vertexShader from "../../utilities/shaders/gradient.vert";

import styles from "./SkyAtmosphereBackground.module.css";

type Uniforms = {
  uTime: number;
  uResolution: Vector2;
  uSunDir: Vector3;
  uExposure: number;
  uMouse: Vector4;
};

function sunDirection(azimuth: number, elevation: number) {
  const ce = Math.cos(elevation);
  return new Vector3(ce * Math.sin(azimuth), Math.sin(elevation), ce * Math.cos(azimuth));
}

// Azimuth is angle in the XZ plane. The sky shader’s view rays point toward -Z, so the sun sits
// in the middle of the screen when the light direction is (0, y, -|z|): sin(azimuth)=0 and
// cos(azimuth)=-1 → azimuth = ±π (same direction on the circle).
const DEFAULT_SUN_AZIMUTH = -Math.PI;

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uSunDir: sunDirection(DEFAULT_SUN_AZIMUTH, 0.42),
  uExposure: 1.05,
  uMouse: new Vector4(0, 0, 0, 0),
};

const SkyAtmosphereMaterial = shaderMaterial(
  INITIAL_UNIFORMS,
  vertexShader,
  fragmentShader,
);

extend({ SkyAtmosphereMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    skyAtmosphereMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] &
      Partial<Uniforms>;
  }
}

const ShaderSkyAtmosphere: FC = memo(() => {
  const materialRef = useRef<(ShaderMaterial & Uniforms) | null>(null);
  const { size } = useThree();

  const paramsRef = useRef({
    azimuth: DEFAULT_SUN_AZIMUTH,
    elevation: 0.42,
    exposure: 1.05,
  });
  const guiRef = useRef<GUI | null>(null);

  useEffect(() => {
    const gui = new GUI({ title: "Sky Atmosphere" });
    guiRef.current = gui;

    const syncSun = () => {
      if (!materialRef.current) return;
      materialRef.current.uSunDir.copy(
        sunDirection(paramsRef.current.azimuth, paramsRef.current.elevation),
      );
    };

    gui
      .add(paramsRef.current, "azimuth", -Math.PI, Math.PI, 0.001)
      .name("Sun azimuth")
      .onChange(syncSun);
    gui
      .add(paramsRef.current, "elevation", -0.15, Math.PI * 0.5 - 0.02, 0.001)
      .name("Sun elevation")
      .onChange(syncSun);
    gui
      .add(paramsRef.current, "exposure", 0.4, 2.2, 0.01)
      .name("Exposure")
      .onChange((value: number) => {
        if (!materialRef.current) return;
        materialRef.current.uExposure = value;
      });

    if (materialRef.current) {
      syncSun();
      materialRef.current.uExposure = paramsRef.current.exposure;
    }

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
      <skyAtmosphereMaterial key={SkyAtmosphereMaterial.key} ref={materialRef} />
    </ScreenQuad>
  );
});

ShaderSkyAtmosphere.displayName = "ShaderSkyAtmosphere";

export const ShaderSkyAtmosphereCanvas: FC = () => (
  <Canvas className={styles.canvas} gl={{ alpha: false, antialias: false }}>
    <ShaderSkyAtmosphere />
  </Canvas>
);
