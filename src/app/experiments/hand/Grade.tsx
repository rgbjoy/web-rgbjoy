'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  HalfFloatType,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three'

import { FX_LAYER, GLOW_LAYER, type Grasp } from './grasp'
import { tuning } from './tuning'

/** Light shafts: samples marched toward the light, and how fast each fades. */
const RAY_SAMPLES = 48
const RAY_REACH = 0.85
const RAY_DECAY = 0.955

const fragmentShader = `
  uniform sampler2D uScene;
  uniform sampler2D uRays;
  uniform vec2 uLight;
  uniform float uRayStrength;
  uniform float uRayExposure;
  uniform float uAspect;
  uniform float uTime;
  uniform float uFrame;
  uniform float uGrainSize;
  varying vec2 vUv;
  #include <tonemapping_pars_fragment>

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Two summed uniforms: a cheap, roughly bell-shaped grain with unit variance.
  float grain(vec2 cell, float seed) {
    return (hash(cell + seed) + hash(cell + seed + 71.3) - 1.0) * 2.449;
  }

  // March from this pixel toward the light through the mask's red channel,
  // where only light escaping between the fingers is lit. Gaps smear into shafts.
  float lightShafts(vec2 uv) {
    vec2 step = (uv - uLight) * (${RAY_REACH.toFixed(3)} / ${RAY_SAMPLES.toFixed(1)});
    vec2 coord = uv;
    float falloff = 1.0;
    float sum = 0.0;
    for (int i = 0; i < ${RAY_SAMPLES}; i++) {
      coord -= step;
      sum += texture2D(uRays, coord).r * falloff;
      falloff *= ${RAY_DECAY.toFixed(3)};
    }
    return sum / ${RAY_SAMPLES.toFixed(1)};
  }

  void main() {
    vec3 hdr = max(texture2D(uScene, vUv).rgb, vec3(0.0));
    vec3 color = linearToOutputTexel(vec4(ACESFilmicToneMapping(hdr), 1.0)).rgb;
    float l = dot(color, vec3(0.2126, 0.7152, 0.0722));

    // Crush the shadows and pop the highlights, then lift the floor a touch
    // so the grain still has somewhere to live in the blacks.
    l = l * l * (3.0 - 2.0 * l);
    l = 0.035 + 0.95 * l;

    if (uRayStrength > 0.0) {
      // A slow angular pattern breaks the glow up a little; the gaps between
      // the fingers do most of the shaping.
      vec2 away = (vUv - uLight) * vec2(uAspect, 1.0);
      float angle = atan(away.y, away.x);
      float pattern = sin(angle * 19.0 + uTime * 0.35) * sin(angle * 31.0 - uTime * 0.23);
      // Faded out near the light, where every streak converges into a star.
      float streaks = 1.0 + 0.25 * pattern * smoothstep(0.02, 0.12, length(away));
      // Shafts live in the air and over the soft light peeking out from
      // behind the hand, never across the hand itself (green).
      float air = 1.0 - texture2D(uRays, vUv).g;
      l += lightShafts(vUv) * streaks * air * uRayStrength * uRayExposure;
    }

    float r = length((vUv - 0.5) * 2.0);
    l *= 1.0 - 0.35 * pow(clamp(r - 0.55, 0.0, 1.0), 1.5);

    // Fine grain plus a coarser clump at twice the cell size, strongest in the
    // midtones like film. Cells are CSS pixels so density matches across DPRs.
    vec2 cell = floor(gl_FragCoord.xy / uGrainSize);
    float seed = uFrame * 17.31;
    float g = 0.65 * grain(cell, seed) + 0.35 * grain(floor(cell * 0.5), seed + 5.7);
    l += g * (0.0225 + 0.2 * l * (1.0 - l));

    gl_FragColor = vec4(vec3(clamp(l, 0.0, 1.0)), 1.0);
  }
`

/** Film grain is re-seeded at film rate, not display rate — 120Hz grain reads as static. */
const GRAIN_FPS = 24

/** A white disc that fades from the centre out, for the soft light behind the fist. */
function softDisc() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.6)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
  }
  return new CanvasTexture(canvas)
}

export default function Grade({
  frozen,
  grasp: graspRef,
}: {
  frozen: boolean
  grasp: React.RefObject<Grasp>
}) {
  const { gl, scene: world, camera: view } = useThree()
  const resources = useRef<{
    target: WebGLRenderTarget
    rays: WebGLRenderTarget
    scene: Scene
    camera: OrthographicCamera
    material: ShaderMaterial
    occluder: MeshBasicMaterial
    volume: Sprite
  } | null>(null)
  const drawingSize = useRef(new Vector2())
  const light = useRef(new Vector3())
  const clock = useRef(0)

  // The main camera draws see-through effects too; the shaft mask leaves them out.
  useEffect(() => {
    view.layers.enable(FX_LAYER)
  }, [view])

  useEffect(() => {
    const target = new WebGLRenderTarget(1, 1, {
      // Half float keeps highlights above 1 for the filmic curve to roll off.
      type: gl.extensions.has('EXT_color_buffer_float') ? HalfFloatType : UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      // The canvas itself is not antialiased; the hand's silhouette is the
      // whole picture, so resolve it cleanly here.
      samples: 4,
    })
    target.texture.colorSpace = LinearSRGBColorSpace
    target.texture.name = 'Hand grade'
    // Half resolution is plenty for shafts that are blurred along their length anyway.
    const rays = new WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false })
    rays.texture.name = 'Hand light shafts'
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    )
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2))
    const material = new ShaderMaterial({
      uniforms: {
        uScene: { value: target.texture },
        uRays: { value: rays.texture },
        uLight: { value: new Vector2(0.5, 0.5) },
        uRayStrength: { value: 0 },
        uRayExposure: { value: tuning.shaftStrength },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uFrame: { value: 0 },
        uGrainSize: { value: 1 },
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

    // Mask colours: the scene is green (blocks light, and marks where shafts
    // are suppressed), the light is red, and the empty void stays black.
    const occluder = new MeshBasicMaterial({ color: '#00ff00' })
    // The light behind the hand: a soft red glow drawn only into the mask,
    // its radius `tuning.shaftSource`. Larger than the fist, its edges peek
    // around the thumb and fingers, like a hand held up to the sun; its soft
    // falloff keeps the light that shows from reading as a hard disc.
    const volume = new Sprite(
      new SpriteMaterial({
        map: softDisc(),
        color: '#ff0000',
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    )
    volume.layers.set(GLOW_LAYER)
    volume.visible = false
    world.add(volume)

    resources.current = {
      target,
      rays,
      scene,
      camera: new OrthographicCamera(),
      material,
      occluder,
      volume,
    }
    return () => {
      resources.current = null
      world.remove(volume)
      volume.material.map?.dispose()
      volume.material.dispose()
      occluder.dispose()
      scene.remove(mesh)
      geometry.dispose()
      material.dispose()
      target.dispose()
      rays.dispose()
    }
  }, [gl, world])

  useFrame(
    ({ gl: renderer, scene, camera }, delta) => {
      const pass = resources.current
      if (!pass) {
        renderer.render(scene, camera)
        return
      }
      renderer.getDrawingBufferSize(drawingSize.current)
      const { x: width, y: height } = drawingSize.current
      if (pass.target.width !== width || pass.target.height !== height) {
        pass.target.setSize(width, height)
        pass.rays.setSize(Math.ceil(width / 2), Math.ceil(height / 2))
      }
      if (!frozen) clock.current += Math.min(delta, 0.1)
      const uniforms = pass.material.uniforms
      // Wrapped so the hash input stays small enough for mediump precision.
      uniforms.uFrame.value = Math.floor(clock.current * GRAIN_FPS) % 997
      uniforms.uTime.value = clock.current % 1000
      uniforms.uGrainSize.value = renderer.getPixelRatio()
      uniforms.uAspect.value = width / height
      uniforms.toneMappingExposure.value = renderer.toneMappingExposure
      const previousTarget = renderer.getRenderTarget()

      // Shaft mask, only while the cursor glows: the scene as flat green, then
      // the soft light behind the fist, depth-tested so only what peeks around
      // and between the fingers sends out light.
      const { glow, light: lightPosition } = graspRef.current
      uniforms.uRayStrength.value = glow > 0.01 ? glow : 0
      pass.volume.visible = glow > 0.01
      if (glow > 0.01) {
        pass.volume.position.copy(lightPosition)
        pass.volume.scale.setScalar(tuning.shaftSource * 2)
        uniforms.uRayExposure.value = tuning.shaftStrength
        light.current.copy(lightPosition).project(camera)
        uniforms.uLight.value.set(light.current.x * 0.5 + 0.5, light.current.y * 0.5 + 0.5)
        const layers = camera.layers.mask
        const autoClear = renderer.autoClear
        const shadows = renderer.shadowMap.autoUpdate
        renderer.shadowMap.autoUpdate = false
        renderer.setRenderTarget(pass.rays)
        scene.overrideMaterial = pass.occluder
        camera.layers.set(0)
        renderer.render(scene, camera)
        scene.overrideMaterial = null
        // A colour background clears on every render, autoClear or not, which
        // would wipe the hand out of the mask; drop it for the light pass.
        const background = scene.background
        scene.background = null
        camera.layers.set(GLOW_LAYER)
        renderer.autoClear = false
        renderer.render(scene, camera)
        scene.background = background
        renderer.autoClear = autoClear
        camera.layers.mask = layers
        renderer.shadowMap.autoUpdate = shadows
      }

      renderer.setRenderTarget(pass.target)
      renderer.render(scene, camera)
      renderer.setRenderTarget(previousTarget)
      renderer.render(pass.scene, pass.camera)
      // The render phase runs after every update; a job here replaces R3F's default render.
    },
    { phase: 'render' },
  )

  return null
}
