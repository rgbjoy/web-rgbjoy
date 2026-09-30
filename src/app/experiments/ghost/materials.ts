import {
  DoubleSide,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshPhysicalMaterial,
  RGBADepthPacking,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import type { GhostQuality } from './quality'

// The opening and its shaded rim use one distance field, so the rim closes
// with the eyelid instead of leaving an open oval behind during a blink.
const eyeDistance = `
float ghostEyeDistance() {
  float eyeOpening = max(0.001, 1.0 - uBlink);
  vec2 leftEye = vec2((vRestPosition.x + 0.235) / 0.10,
    (vRestPosition.y - 2.14) / (0.145 * eyeOpening));
  vec2 rightEye = vec2((vRestPosition.x - 0.235) / 0.10,
    (vRestPosition.y - 2.14) / (0.145 * eyeOpening));
  return min(length(leftEye), length(rightEye));
}
`

const eyeMask = `
  if (uBlink < 0.999 && vRestPosition.z > 0.42 && ghostEyeDistance() < 1.0) discard;
`

const eyeBackingMask = `
  if (uBlink >= 0.999 || vRestPosition.z <= 0.42 || ghostEyeDistance() >= 1.12) discard;
`

export function createClothMaterials(quality: GhostQuality = 'desktop') {
  const blink = { value: 0 }
  const charge = { value: 0 }
  const material = new MeshPhysicalMaterial({
    color: '#e4e0d4',
    roughness: 0.93,
    metalness: 0,
    sheen: 0.7,
    sheenColor: '#d9d5cc',
    sheenRoughness: 0.85,
    side: DoubleSide,
  })
  const depthMaterial = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking,
    side: DoubleSide,
  })
  const eyeMaterial = new MeshBasicMaterial({
    color: '#020305',
    side: DoubleSide,
    toneMapped: false,
  })

  const inject = (shader: WebGLProgramParametersWithUniforms, mask: string) => {
    shader.uniforms.uBlink = blink
    shader.uniforms.uCharge = charge
    shader.vertexShader = `attribute vec3 restPosition;
      varying vec3 vRestPosition;
      varying vec2 vClothUv;
      ${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `
        #include <begin_vertex>
        vRestPosition = restPosition;
        vClothUv = uv;
      `,
    )
    shader.fragmentShader = `uniform float uBlink;
      uniform float uCharge;
      varying vec3 vRestPosition;
      varying vec2 vClothUv;
      ${eyeDistance}
      ${shader.fragmentShader}`.replace(
      '#include <alphatest_fragment>',
      `
        #include <alphatest_fragment>
        ${mask}
      `,
    )
  }
  material.onBeforeCompile = (shader) => {
    inject(shader, eyeMask)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      // Tiny threads in both directions, with a low contrast irregular weave.
      // Subpixel threads alias at the mobile render resolution.
      float weave = ${quality === 'mobile' ? '0.0' : 'sin(vClothUv.x * 1800.0) * sin(vClothUv.y * 1400.0)'};
      diffuseColor.rgb *= 0.975 + weave * 0.025;
      float edge = smoothstep(1.0, 1.32, ghostEyeDistance());
      if (vRestPosition.z > 0.42)
        diffuseColor.rgb *= mix(1.0, mix(0.54, 1.0, edge), 1.0 - uBlink);
    `,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       if (vRestPosition.z > 0.42) {
         float eyeSpill = exp(-pow(ghostEyeDistance(), 2.0) * 1.5);
         totalEmissiveRadiance += vec3(2.2, 0.008, 0.002) * eyeSpill * uCharge;
       }`,
    )
  }
  depthMaterial.onBeforeCompile = (shader) => inject(shader, eyeMask)
  eyeMaterial.onBeforeCompile = (shader) => {
    inject(shader, eyeBackingMask)
    // Only the eye patches render. They share the moving cloth geometry,
    // slightly inset behind it, so there is no visible head surface to clip.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n transformed -= normal * 0.008;',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float core = 1.0 - smoothstep(0.0, 0.95, ghostEyeDistance());
       vec3 burningEye = mix(vec3(2.8, 0.003, 0.001), vec3(6.0, 0.028, 0.002), core * core);
       outgoingLight = mix(outgoingLight, burningEye, uCharge);
       #include <opaque_fragment>`,
    )
  }
  material.customProgramCacheKey = () => `ghost-cloth-v4-${quality}`
  depthMaterial.customProgramCacheKey = () => 'ghost-cloth-depth-v3'
  eyeMaterial.customProgramCacheKey = () => 'ghost-eye-backing-v2'

  return { material, depthMaterial, eyeMaterial, blink, charge }
}
