'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  LinearSRGBColorSpace,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three'
import type { GhostCharge } from './charge'

const fragmentShader = `
  uniform sampler2D uScene;
  uniform float uCharge;
  varying vec2 vUv;
  #include <tonemapping_pars_fragment>

  void main() {
    vec4 frame = texture2D(uScene, vUv);
    vec3 hdr = max(frame.rgb, vec3(0.0));
    vec3 color = ACESFilmicToneMapping(hdr);

    // ACES shifts very bright red emitters toward orange. Preserve the hue
    // of the charged eyes and rays while retaining their filmic brightness.
    float redRatio = max(hdr.g, hdr.b) / max(hdr.r, 0.0001);
    float redEnergy = smoothstep(0.8, 2.0, hdr.r)
      * (1.0 - smoothstep(0.06, 0.22, redRatio));
    float peak = max(color.r, max(color.g, color.b));
    color = mix(color, hdr / max(hdr.r, 0.0001) * peak, redEnergy * 0.95);

    // Grade in display space: restrained contrast keeps the dark scenery
    // readable, with cool night shadows and warm ivory cloth highlights.
    color = linearToOutputTexel(vec4(color, 1.0)).rgb;
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float shadows = 1.0 - smoothstep(0.06, 0.48, luminance);
    float highlights = smoothstep(0.35, 0.95, luminance);
    color *= mix(vec3(1.0), vec3(0.96, 1.015, 1.06), shadows * 0.6 * (1.0 - uCharge * 0.85));
    color *= mix(vec3(1.0), vec3(1.025, 1.01, 0.975), highlights * 0.7);
    color += (color - 0.5) * color * (1.0 - color) * 0.16;
    color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, mix(0.975, 1.0, redEnergy));
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), frame.a);
  }
`

export default function ColorGrade({ charge }: { charge: React.RefObject<GhostCharge> }) {
  const { gl } = useThree()
  const resources = useRef<{
    target: WebGLRenderTarget
    scene: Scene
    camera: OrthographicCamera
    material: ShaderMaterial
  } | null>(null)
  const drawingSize = useRef(new Vector2())

  useEffect(() => {
    // Keep the original renderer path on devices without a float color buffer.
    if (!gl.extensions.has('EXT_color_buffer_float')) return
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    })
    target.texture.colorSpace = LinearSRGBColorSpace
    target.texture.name = 'Ghost color grading'
    const geometry = new BufferGeometry()
    // One fullscreen triangle needs only one sample per output pixel.
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    )
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2))
    const material = new ShaderMaterial({
      uniforms: {
        uScene: { value: target.texture },
        uCharge: { value: 0 },
        toneMappingExposure: { value: gl.toneMappingExposure },
      },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
      fragmentShader,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    })
    const scene = new Scene()
    const mesh = new Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    resources.current = { target, scene, camera: new OrthographicCamera(), material }
    return () => {
      resources.current = null
      scene.remove(mesh)
      geometry.dispose()
      material.dispose()
      target.dispose()
    }
  }, [gl])

  useFrame(({ scene, camera }) => {
    const pass = resources.current
    if (!pass) {
      gl.render(scene, camera)
      return
    }
    gl.getDrawingBufferSize(drawingSize.current)
    const { x: width, y: height } = drawingSize.current
    if (pass.target.width !== width || pass.target.height !== height)
      pass.target.setSize(width, height)
    pass.material.uniforms.uCharge.value = charge.current.glow.value
    pass.material.uniforms.toneMappingExposure.value = gl.toneMappingExposure
    const previousTarget = gl.getRenderTarget()
    // Three renders linear HDR into the buffer. ACES and the grade are
    // applied together once, after transparent mist and light rays composite.
    gl.setRenderTarget(pass.target)
    gl.render(scene, camera)
    gl.setRenderTarget(previousTarget)
    gl.render(pass.scene, pass.camera)
  }, 1)

  return null
}
