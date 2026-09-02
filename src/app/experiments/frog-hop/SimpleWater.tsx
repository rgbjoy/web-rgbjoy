"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  ShaderMaterial,
  Vector2,
  type Group as ThreeGroup,
} from "three";

import {
  DOCK_BOUNDS,
  POND_FLOOR_Y,
  POND_FOG_COLOR,
  POND_FOG_FAR,
  POND_FOG_NEAR,
  WATER_SURFACE_Y,
} from "./course";

const WATER_SIZE = 150;

/** Shared by the water vertex shader and every lightweight floating object. */
export function sampleWaterDisplacement(x: number, z: number, time: number) {
  return (
    Math.sin(x * 0.18 + time * 0.65) * 0.026 +
    Math.sin(z * 0.13 - time * 0.48) * 0.018 +
    Math.sin((x + z) * 0.09 + time * 0.3) * 0.01
  );
}

const waterVertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uCenter;
  varying float vWorldZ;
  varying float vWave;
  varying float vFogDepth;

  float waterWave(vec2 worldPosition) {
    return sin(worldPosition.x * 0.18 + uTime * 0.65) * 0.026
      + sin(worldPosition.y * 0.13 - uTime * 0.48) * 0.018
      + sin((worldPosition.x + worldPosition.y) * 0.09 + uTime * 0.3) * 0.01;
  }

  void main() {
    vec3 transformed = position;
    vec2 worldPosition = vec2(position.x + uCenter.x, -position.y + uCenter.y);
    vWorldZ = worldPosition.y;
    vWave = waterWave(worldPosition);
    transformed.z += vWave;
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    vFogDepth = -viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const waterFragmentShader = /* glsl */ `
  uniform float uShoreZ;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying float vWorldZ;
  varying float vWave;
  varying float vFogDepth;

  void main() {
    float depth = smoothstep(0.0, 10.0, max(0.0, uShoreZ - vWorldZ));
    vec3 shallowColor = vec3(0.13, 0.52, 0.55);
    vec3 deepColor = vec3(0.04, 0.31, 0.4);
    vec3 color = mix(shallowColor, deepColor, depth);
    color += vWave * 1.7;
    float opacity = mix(0.58, 0.92, depth);
    float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
    color = mix(color, uFogColor, fogFactor);
    opacity = mix(opacity, 1.0, fogFactor);
    gl_FragColor = vec4(color, opacity);
  }
`;

const causticsVertexShader = /* glsl */ `
  uniform vec2 uCenter;
  varying vec2 vWorldPosition;
  varying float vFogDepth;

  void main() {
    vWorldPosition = vec2(position.x + uCenter.x, -position.y + uCenter.y);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const causticsFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uShoreZ;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec2 vWorldPosition;
  varying float vFogDepth;

  vec2 hashCell(vec2 cell) {
    vec2 hash = vec2(
      dot(cell, vec2(127.1, 311.7)),
      dot(cell, vec2(269.5, 183.3))
    );
    return fract(sin(hash) * 43758.5453);
  }

  float voronoiEdge(vec2 position) {
    vec2 cell = floor(position);
    vec2 local = fract(position);
    float nearest = 10.0;
    float secondNearest = 10.0;

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 random = hashCell(cell + offset);
        vec2 point = offset + 0.5 + 0.38 * sin(
          uTime * 0.34 + random * 6.2831853
        );
        float distanceToPoint = length(point - local);

        if (distanceToPoint < nearest) {
          secondNearest = nearest;
          nearest = distanceToPoint;
        } else if (distanceToPoint < secondNearest) {
          secondNearest = distanceToPoint;
        }
      }
    }

    return secondNearest - nearest;
  }

  void main() {
    vec2 warpedPosition = vWorldPosition * 1.08;
    warpedPosition += vec2(
      sin(vWorldPosition.y * 0.34 + uTime * 0.22)
        + 0.42 * sin(vWorldPosition.x * 0.61 - uTime * 0.14),
      cos(vWorldPosition.x * 0.29 - uTime * 0.18)
        + 0.42 * cos(vWorldPosition.y * 0.57 + uTime * 0.16)
    ) * 0.32;

    float edge = voronoiEdge(warpedPosition);
    // Gaussian profiles create an actual soft-focus band instead of a crisp
    // threshold with antialiased edges. Derivatives keep that blur stable as
    // the camera and 0.5-DPR pixel footprint change.
    float antialias = max(fwidth(edge) * 1.35, 0.006);
    float coreRadius = 0.055 + antialias * 1.25;
    float haloRadius = 0.18 + antialias * 2.0;
    float coreDistance = edge / coreRadius;
    float haloDistance = edge / haloRadius;
    float core = exp(-coreDistance * coreDistance * 1.35);
    float halo = exp(-haloDistance * haloDistance * 1.05);

    // One edge-distance calculation drives three subtly offset channel widths.
    // The white core stays aligned while its fading rim separates into color.
    float dispersionPhase =
      dot(vWorldPosition, vec2(0.42, -0.31)) + uTime * 0.24;
    vec3 channelWidths = vec3(0.13) + 0.018 * cos(
      dispersionPhase + vec3(0.0, 2.0943951, 4.1887902)
    );
    vec3 spectralDistance = vec3(edge) /
      (channelWidths + vec3(antialias * 1.6));
    vec3 spectralHalo = exp(-spectralDistance * spectralDistance);
    float spectralAverage =
      (spectralHalo.r + spectralHalo.g + spectralHalo.b) / 3.0;
    vec3 baseColor = vec3(0.66, 0.96, 0.83);
    vec3 dispersedColor = clamp(
      baseColor + (spectralHalo - vec3(spectralAverage)) * 0.3,
      0.0,
      1.0
    );

    float depth = smoothstep(0.0, 10.0, max(0.0, uShoreZ - vWorldPosition.y));
    float depthAttenuation = mix(1.0, 0.04, depth);
    float distanceFade = 1.0 - smoothstep(uFogNear, uFogFar, vFogDepth);
    float brightness = (core * 0.1 + halo * 0.055)
      * depthAttenuation
      * distanceFade;

    gl_FragColor = vec4(dispersedColor, brightness);
  }
`;

export function SimpleWater({
  frogRef,
}: {
  frogRef: React.RefObject<ThreeGroup | null>;
}) {
  const groupRef = useRef<Group>(null);
  const waterMaterial = useMemo(
    () =>
      new ShaderMaterial({
        depthWrite: false,
        fragmentShader: waterFragmentShader,
        side: DoubleSide,
        transparent: true,
        uniforms: {
          uCenter: { value: new Vector2() },
          uFogColor: { value: new Color(POND_FOG_COLOR) },
          uFogFar: { value: POND_FOG_FAR },
          uFogNear: { value: POND_FOG_NEAR },
          uShoreZ: { value: DOCK_BOUNDS.minZ },
          uTime: { value: 0 },
        },
        vertexShader: waterVertexShader,
      }),
    [],
  );
  const causticsMaterial = useMemo(
    () =>
      new ShaderMaterial({
        blending: AdditiveBlending,
        depthWrite: false,
        fragmentShader: causticsFragmentShader,
        transparent: true,
        uniforms: {
          uCenter: { value: new Vector2() },
          uFogFar: { value: POND_FOG_FAR },
          uFogNear: { value: POND_FOG_NEAR },
          uShoreZ: { value: DOCK_BOUNDS.minZ },
          uTime: { value: 0 },
        },
        vertexShader: causticsVertexShader,
      }),
    [],
  );

  useEffect(
    () => () => {
      waterMaterial.dispose();
      causticsMaterial.dispose();
    },
    [causticsMaterial, waterMaterial],
  );

  /* eslint-disable react-hooks/immutability -- Three.js uniforms and scene transforms are imperative frame state, not React render state. */
  useFrame((state) => {
    const frog = frogRef.current;
    const group = groupRef.current;
    if (!frog || !group) return;

    const centerX = Math.round(frog.position.x / 10) * 10;
    const centerZ = Math.round(frog.position.z / 10) * 10;
    group.position.x = centerX;
    group.position.z = centerZ;
    waterMaterial.uniforms.uCenter.value.set(centerX, centerZ);
    waterMaterial.uniforms.uTime.value = state.elapsed;
    causticsMaterial.uniforms.uCenter.value.set(centerX, centerZ);
    causticsMaterial.uniforms.uTime.value = state.elapsed;
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <group ref={groupRef}>
      <mesh
        position={[0, POND_FLOOR_Y + 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-1}
      >
        <planeGeometry args={[WATER_SIZE, WATER_SIZE, 1, 1]} />
        <primitive object={causticsMaterial} attach="material" />
      </mesh>
      <mesh position={[0, POND_FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WATER_SIZE, WATER_SIZE, 1, 1]} />
        <meshStandardMaterial color="#c9ad74" roughness={0.94} />
      </mesh>
      <mesh
        frustumCulled={false}
        position={[0, WATER_SURFACE_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      >
        <planeGeometry args={[WATER_SIZE, WATER_SIZE, 48, 48]} />
        <primitive object={waterMaterial} attach="material" />
      </mesh>
    </group>
  );
}
