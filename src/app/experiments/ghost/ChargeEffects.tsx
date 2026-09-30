'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { CHARGE_HORIZON, type GhostCharge } from './charge'
import type { GhostQuality } from './quality'

const eyeVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`

export function EyeCharge({
  charge,
  head,
  quality,
  reducedMotion,
}: {
  charge: React.RefObject<GhostCharge>
  head: React.RefObject<{ head: Matrix4 }>
  quality: GhostQuality
  reducedMotion: boolean
}) {
  const root = useRef<Group>(null)
  const rays = useRef<InstancedMesh | null>(null)
  const transform = useRef(new Object3D())
  const count = quality === 'mobile' ? 4 : 6

  useEffect(() => {
    const owner = root.current
    if (!owner) return
    const uniforms = { uCharge: charge.current.glow, uTime: charge.current.time }
    const haloGeometry = new PlaneGeometry(0.62, 0.72)
    const haloMaterial = new ShaderMaterial({
      uniforms,
      vertexShader: eyeVertex,
      fragmentShader: `
        uniform float uCharge;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float glow = exp(-dot(p, p) * 4.5) * (1.0 - smoothstep(0.7, 1.0, length(p)));
          gl_FragColor = vec4(1.9, 0.00015, 0.00008, glow * uCharge * 0.42);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      blending: AdditiveBlending,
      toneMapped: false,
      depthWrite: false,
      side: DoubleSide,
    })
    const halos = new InstancedMesh(haloGeometry, haloMaterial, 2)
    const matrix = new Matrix4()
    for (let eye = 0; eye < 2; eye++) {
      matrix.makeTranslation(eye === 0 ? -0.235 : 0.235, 2.14, 0.65)
      halos.setMatrixAt(eye, matrix)
    }
    halos.instanceMatrix.needsUpdate = true
    halos.computeBoundingSphere()
    halos.renderOrder = 4

    const rayGeometry = new BufferGeometry()
    rayGeometry.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([-0.025, 0, 0, 0.025, 0, 0, -0.24, 1, 0, 0.24, 1, 0]),
        3,
      ),
    )
    rayGeometry.setAttribute(
      'uv',
      new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2),
    )
    rayGeometry.setIndex([0, 1, 2, 2, 1, 3])
    const rayMaterial = new ShaderMaterial({
      uniforms: { ...uniforms, uMotion: { value: reducedMotion ? 0 : 1 } },
      vertexShader: eyeVertex,
      fragmentShader: `
        uniform float uCharge;
        uniform float uTime;
        uniform float uMotion;
        varying vec2 vUv;
        void main() {
          float sides = pow(max(0.0, 1.0 - abs(vUv.x * 2.0 - 1.0)), 2.0);
          float tail = pow(1.0 - vUv.y, 1.7);
          float flow = 0.88 + sin(vUv.y * 14.0 - uTime * 1.6) * 0.12 * uMotion;
          float alpha = sides * tail * flow * uCharge * uCharge * 0.32;
          gl_FragColor = vec4(2.1, 0.00015, 0.00003, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      blending: AdditiveBlending,
      toneMapped: false,
      depthWrite: false,
      side: DoubleSide,
    })
    const shafts = new InstancedMesh(rayGeometry, rayMaterial, count * 2)
    shafts.frustumCulled = false
    shafts.renderOrder = 3
    rays.current = shafts
    owner.add(halos, shafts)
    return () => {
      rays.current = null
      owner.remove(halos, shafts)
      halos.dispose()
      shafts.dispose()
      haloGeometry.dispose()
      haloMaterial.dispose()
      rayGeometry.dispose()
      rayMaterial.dispose()
    }
  }, [charge, count, reducedMotion])

  useFrame(() => {
    const owner = root.current
    const shafts = rays.current
    if (!owner || !shafts) return
    const power = charge.current.glow.value
    owner.visible = power > 0.001
    if (!owner.visible) return
    owner.matrix.copy(head.current.head)
    owner.matrixWorldNeedsUpdate = true
    const object = transform.current
    for (let eye = 0; eye < 2; eye++) {
      for (let ray = 0; ray < count; ray++) {
        const angle = (ray / count) * Math.PI * 2 + (eye ? 0.24 : -0.24)
        object.position.set(eye === 0 ? -0.235 : 0.235, 2.14, 0.66)
        object.rotation.set(
          0,
          0,
          angle + (reducedMotion ? 0 : Math.sin(charge.current.time.value * 0.3) * 0.08),
        )
        const length =
          (quality === 'mobile' ? 1.65 : 2.4) * (0.12 + power * 0.88) * (ray % 2 ? 0.72 : 1)
        object.scale.set(0.55 + power * 0.6, length, 1)
        object.updateMatrix()
        shafts.setMatrixAt(eye * count + ray, object.matrix)
      }
    }
    shafts.instanceMatrix.needsUpdate = true
  })

  return <group ref={root} matrixAutoUpdate={false} visible={false} />
}

export default function ChargeSky({ charge }: { charge: React.RefObject<GhostCharge> }) {
  const sky = useRef<Mesh>(null)
  const material = useRef<ShaderMaterial>(null)
  useFrame(() => {
    const power = charge.current.glow.value
    if (sky.current) sky.current.visible = power > 0.001
    if (material.current) {
      material.current.uniforms.uCharge.value = power
      material.current.uniforms.uTime.value = charge.current.time.value
    }
  })
  return (
    <mesh ref={sky} visible={false} renderOrder={-1}>
      <sphereGeometry args={[30, 16, 8]} />
      <shaderMaterial
        ref={material}
        side={BackSide}
        depthWrite={false}
        uniforms={{
          uCharge: charge.current.glow,
          uTime: charge.current.time,
          uHorizon: { value: new Color(CHARGE_HORIZON) },
        }}
        vertexShader={`varying vec3 vDirection;
          void main() { vDirection = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`uniform float uCharge; uniform float uTime; uniform vec3 uHorizon; varying vec3 vDirection;
          void main() {
            vec3 d = normalize(vDirection);
            float height = smoothstep(-0.08, 0.65, d.y);
            float clouds = sin(d.x * 11.0 + sin(d.y * 17.0) + uTime * 0.025)
              * sin(d.z * 13.0 - d.y * 9.0 - uTime * 0.018) * 0.5 + 0.5;
            vec3 ember = mix(vec3(0.3, 0.043, 0.008), vec3(0.057, 0.004, 0.008), height);
            ember *= 0.7 + clouds * 0.3;
            gl_FragColor = vec4(mix(vec3(0.00152, 0.00212, 0.00243), ember, uCharge), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            // Three's distance fog is applied AFTER tone mapping. Match it
            // here in output color space so the distant ground has no seam.
            vec3 horizon = linearToOutputTexel(vec4(mix(vec3(0.00152, 0.00212, 0.00243), uHorizon, uCharge), 1.0)).rgb;
            gl_FragColor.rgb = mix(horizon, gl_FragColor.rgb, smoothstep(0.08, 0.38, d.y));
          }`}
      />
    </mesh>
  )
}
