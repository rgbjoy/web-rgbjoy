"use client";

import { ScreenQuad, shaderMaterial } from "@react-three/drei/legacy";
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

function sunDirection(azimuth: number, elevation: number, target = new Vector3()) {
  const ce = Math.cos(elevation);
  return target.set(ce * Math.sin(azimuth), Math.sin(elevation), ce * Math.cos(azimuth));
}

// Azimuth is angle in the XZ plane. The sky shader’s view rays point toward -Z, so the sun sits
// in the middle of the screen when the light direction is (0, y, -|z|): sin(azimuth)=0 and
// cos(azimuth)=-1 → azimuth = ±π (same direction on the circle).
const DEFAULT_SUN_AZIMUTH = -Math.PI;
const DEFAULT_SUN_ELEVATION = 0.42;
const SUN_BOUNCE_MIN = -0.017;
const SUN_BOUNCE_MAX = 0.485;
const SUN_BOUNCE_PERIOD = 20; // Seconds for a full rise and fall.

const INITIAL_UNIFORMS: Uniforms = {
  uTime: 0,
  uResolution: new Vector2(1, 1),
  uSunDir: sunDirection(DEFAULT_SUN_AZIMUTH, DEFAULT_SUN_ELEVATION),
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
    elevation: DEFAULT_SUN_ELEVATION,
    bounce: true,
    exposure: 1.05,
  });
  const bouncePhaseRef = useRef(Math.acos(
    1 - 2 * (DEFAULT_SUN_ELEVATION - SUN_BOUNCE_MIN) / (SUN_BOUNCE_MAX - SUN_BOUNCE_MIN),
  ));
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
    const elevationController = gui
      .add(paramsRef.current, "elevation", -0.15, Math.PI * 0.5 - 0.02, 0.001)
      .name("Sun elevation")
      .decimals(3)
      .listen()
      .disable(paramsRef.current.bounce)
      .onChange(syncSun);
    gui
      .add(paramsRef.current, "bounce")
      .name("Bounce")
      .onChange((enabled: boolean) => {
        if (enabled) {
          // Start from the current elevation without jumping within the range.
          const fraction = Math.max(0, Math.min(1,
            (paramsRef.current.elevation - SUN_BOUNCE_MIN) /
              (SUN_BOUNCE_MAX - SUN_BOUNCE_MIN),
          ));
          bouncePhaseRef.current = Math.acos(1 - 2 * fraction);
        }
        elevationController.disable(enabled);
      });
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

  useFrame(({ elapsed, delta }) => {
    if (!materialRef.current) return;
    const material = materialRef.current;
    const params = paramsRef.current;
    material.uTime = elapsed;

    if (params.bounce) {
      bouncePhaseRef.current = (
        bouncePhaseRef.current + delta * Math.PI * 2 / SUN_BOUNCE_PERIOD
      ) % (Math.PI * 2);
      const fraction = (1 - Math.cos(bouncePhaseRef.current)) * 0.5;
      params.elevation = SUN_BOUNCE_MIN + (SUN_BOUNCE_MAX - SUN_BOUNCE_MIN) * fraction;
      sunDirection(params.azimuth, params.elevation, material.uSunDir);
    }

    if (material.uResolution instanceof Vector2) {
      material.uResolution.set(size.width, size.height);
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
