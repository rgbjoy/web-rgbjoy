"use client"

import { shaderMaterial } from "@react-three/drei"
import { extend, useFrame } from "@react-three/fiber"
import { useRef } from "react"
import { AdditiveBlending, DoubleSide, type ShaderMaterial } from "three"

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uInnerHalfWidth;
  uniform float uOuterHalfWidth;
  uniform float uInnerHalfDepth;
  uniform float uOuterHalfDepth;

  varying vec3 vWorldPosition;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 flow = vec2(uTime * 0.03, -uTime * 0.024);
    vec2 sampleUv = vWorldPosition.xz * 0.17 + flow;

    float n1 = fbm(sampleUv);
    float n2 = fbm(sampleUv * 1.65 + vec2(3.7, 2.1) + flow * 0.5);
    float n = mix(n1, n2, 0.45);

    float blueMask = smoothstep(0.32, 0.78, n);
    float softMask = smoothstep(0.15, 0.55, n);

    vec3 deepBlue = vec3(0.02, 0.07, 0.22);
    vec3 blue = vec3(0.06, 0.16, 0.48);
    vec3 mistColor = mix(deepBlue, blue, blueMask);

    float gridX = 1.0 - smoothstep(uInnerHalfWidth, uOuterHalfWidth, abs(vWorldPosition.x));
    float gridZ = 1.0 - smoothstep(uInnerHalfDepth, uOuterHalfDepth, abs(vWorldPosition.z));
    float edgeFade = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    edgeFade *= smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);

    float alpha = (softMask * 0.35 + blueMask * 0.55) * gridX * gridZ * edgeFade * uOpacity;

    gl_FragColor = vec4(mistColor * alpha, alpha);
  }
`

const NoiseCloudMaterial = shaderMaterial(
  {
    uTime: 0,
    uOpacity: 0.42,
    uInnerHalfWidth: 6,
    uOuterHalfWidth: 8,
    uInnerHalfDepth: 10,
    uOuterHalfDepth: 12,
  },
  vertexShader,
  fragmentShader,
)

extend({ NoiseCloudMaterial })

declare module "@react-three/fiber" {
  interface ThreeElements {
    noiseCloudMaterial: import("@react-three/fiber").ThreeElements["shaderMaterial"] & {
      uTime?: number
      uOpacity?: number
      uInnerHalfWidth?: number
      uOuterHalfWidth?: number
      uInnerHalfDepth?: number
      uOuterHalfDepth?: number
    }
  }
}

export type NoiseCloudProps = {
  width: number
  depth: number
  /** World Y of the mist plane, just above the ground. */
  y?: number
  opacity?: number
  innerHalfWidth: number
  outerHalfWidth: number
  innerHalfDepth: number
  outerHalfDepth: number
}

export function NoiseCloud({
  width,
  depth,
  y = 0.06,
  opacity = 0.42,
  innerHalfWidth,
  outerHalfWidth,
  innerHalfDepth,
  outerHalfDepth,
}: NoiseCloudProps) {
  const materialRef = useRef<ShaderMaterial>(null)

  useFrame((state) => {
    const uniforms = materialRef.current?.uniforms
    if (!uniforms) return
    uniforms.uTime.value = state.elapsed
  })

  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
      <planeGeometry args={[width, depth, 1, 1]} />
      <noiseCloudMaterial
        ref={materialRef}
        attach="material"
        transparent
        depthWrite={false}
        depthTest
        blending={AdditiveBlending}
        side={DoubleSide}
        toneMapped={false}
        uOpacity={opacity}
        uInnerHalfWidth={innerHalfWidth}
        uOuterHalfWidth={outerHalfWidth}
        uInnerHalfDepth={innerHalfDepth}
        uOuterHalfDepth={outerHalfDepth}
      />
    </mesh>
  )
}
