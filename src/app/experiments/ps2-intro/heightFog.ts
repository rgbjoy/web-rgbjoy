import { ShaderChunk, ShaderLib } from "three"
import type { WebGLProgramParametersWithUniforms } from "three"

export type HeightFogOptions = {
  fogHeight: number
  /** Outer X half-extent; fog fades to zero at this edge. */
  fogHalfWidth: number
  /** Outer Z half-extent; fog fades to zero at this edge. */
  fogHalfDepth: number
  /** Inner grid half-extent on X; full fog inside this edge. */
  fogInnerHalfWidth?: number
  /** Inner grid half-extent on Z; full fog inside this edge. */
  fogInnerHalfDepth?: number
  /** How much linear distance fog contributes (0 = height only). */
  distanceFogStrength?: number
}

const PATCH_MARKERS = ["vHeightFogWorldPosition", "PS2_HEIGHT_FOG"]

/** Reset global fog chunks if a prior dev-session patch left them dirty. */
export function restoreDefaultFogChunks() {
  if (!PATCH_MARKERS.some((marker) => ShaderChunk.fog_fragment.includes(marker))) {
    return
  }

  ShaderChunk.fog_pars_vertex = "#ifdef USE_FOG\n\tvarying float vFogDepth;\n#endif"
  ShaderChunk.fog_vertex = "#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n#endif"
  ShaderChunk.fog_pars_fragment =
    "#ifdef USE_FOG\n\tuniform vec3 fogColor;\n\tvarying float vFogDepth;\n\t#ifdef FOG_EXP2\n\t\tuniform float fogDensity;\n\t#else\n\t\tuniform float fogNear;\n\t\tuniform float fogFar;\n\t#endif\n#endif"
  ShaderChunk.fog_fragment =
    "#ifdef USE_FOG\n\t#ifdef FOG_EXP2\n\t\tfloat fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n\t#else\n\t\tfloat fogFactor = smoothstep( fogNear, fogFar, vFogDepth );\n\t#endif\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif"

  if (ShaderLib.sprite.vertexShader.includes("PS2_HEIGHT_FOG")) {
    ShaderLib.sprite.vertexShader = ShaderLib.sprite.vertexShader.replace(
      /\s*vec3 transformed = position;\s*PS2_HEIGHT_FOG\s*/,
      "\n",
    )
  }
}

if (typeof window !== "undefined") {
  restoreDefaultFogChunks()
}

function buildHeightFogFragment({
  fogHalfWidth,
  fogHalfDepth,
  fogInnerHalfWidth,
  fogInnerHalfDepth,
  distanceFogStrength = 0.18,
}: HeightFogOptions) {
  const innerX = (fogInnerHalfWidth ?? fogHalfWidth * 0.94).toFixed(4)
  const innerZ = (fogInnerHalfDepth ?? fogHalfDepth * 0.94).toFixed(4)

  return `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float distFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float distFog = smoothstep( fogNear, fogFar, vFogDepth );
  #endif

  float heightFactor = 1.0 - smoothstep( 0.0, fogHeight, vHeightFogWorldPosition.y );
  float cameraHeightFactor = 1.0 - smoothstep( 0.0, fogHeight, cameraPosition.y );
  float gridFactorX = 1.0 - smoothstep( ${innerX}, ${fogHalfWidth.toFixed(4)}, abs( vHeightFogWorldPosition.x ) );
  float gridFactorZ = 1.0 - smoothstep( ${innerZ}, ${fogHalfDepth.toFixed(4)}, abs( vHeightFogWorldPosition.z ) );
  float gridFactor = gridFactorX * gridFactorZ;
  float heightFog = max( heightFactor, cameraHeightFactor ) * gridFactor;

  float fogFactor = clamp( max( heightFog, distFog * ${distanceFogStrength.toFixed(4)} ), 0.0, 1.0 );

  // Opaque fade — same look as alpha over black, without transparent sort artifacts.
  gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 0.0 ), fogFactor );
#endif`
}

/**
 * Injects height- and grid-bounded fog into a built-in lit material shader.
 * Fades fragments toward black by height/grid — opaque, so instancing stays stable at any camera angle.
 * @see https://woodenraft.games/blog/height-fog-implementation-three-js
 */
export function applyHeightFogShader(
  shader: WebGLProgramParametersWithUniforms,
  options: HeightFogOptions,
) {
  const { fogHeight, fogHalfWidth, fogHalfDepth } = options

  shader.vertexShader = shader.vertexShader.replace(
    "#include <fog_pars_vertex>",
    `#include <fog_pars_vertex>
#ifdef USE_FOG
  varying vec3 vHeightFogWorldPosition;
#endif`,
  )

  shader.vertexShader = shader.vertexShader.replace(
    "#include <fog_vertex>",
    `#include <fog_vertex>
#ifdef USE_FOG
  vec4 heightFogWorldPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    heightFogWorldPosition = instanceMatrix * heightFogWorldPosition;
  #endif
  heightFogWorldPosition = modelMatrix * heightFogWorldPosition;
  vHeightFogWorldPosition = heightFogWorldPosition.xyz;
#endif`,
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <fog_pars_fragment>",
    `#include <fog_pars_fragment>
#ifdef USE_FOG
  varying vec3 vHeightFogWorldPosition;
  const float fogHeight = ${fogHeight.toFixed(4)};
  const float fogHalfWidth = ${fogHalfWidth.toFixed(4)};
  const float fogHalfDepth = ${fogHalfDepth.toFixed(4)};
  const float fogInnerHalfWidth = ${(options.fogInnerHalfWidth ?? fogHalfWidth * 0.94).toFixed(4)};
  const float fogInnerHalfDepth = ${(options.fogInnerHalfDepth ?? fogHalfDepth * 0.94).toFixed(4)};
#endif`,
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <fog_fragment>",
    buildHeightFogFragment(options),
  )
}
