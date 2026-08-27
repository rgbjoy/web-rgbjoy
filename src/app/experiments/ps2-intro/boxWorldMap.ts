import type { WebGLProgramParametersWithUniforms } from "three"

/**
 * Per-face world-unit UVs for axis-aligned boxes.
 * Square cross-section + varying height: top/bottom use xz, sides use world y.
 */
export function applyBoxWorldMapShader(
  shader: WebGLProgramParametersWithUniforms,
  tileScale: number,
) {
  shader.uniforms.boxMapTileScale = { value: tileScale }

  shader.vertexShader = shader.vertexShader.replace(
    "#include <uv_pars_vertex>",
    `#include <uv_pars_vertex>
#ifdef USE_MAP
  uniform float boxMapTileScale;
  varying vec3 vBoxWorldPos;
#endif`,
  )

  shader.vertexShader = shader.vertexShader.replace(
    "#include <worldpos_vertex>",
    `#include <worldpos_vertex>
#ifdef USE_MAP
  vec4 boxWorldPos = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    boxWorldPos = instanceMatrix * boxWorldPos;
  #endif
  boxWorldPos = modelMatrix * boxWorldPos;
  vBoxWorldPos = boxWorldPos.xyz;

  vec3 faceNormal = abs( normal );
  if ( faceNormal.y >= faceNormal.x && faceNormal.y >= faceNormal.z ) {
    vMapUv = vBoxWorldPos.xz * boxMapTileScale;
  } else if ( faceNormal.x >= faceNormal.z ) {
    vMapUv = vBoxWorldPos.zy * boxMapTileScale;
  } else {
    vMapUv = vBoxWorldPos.xy * boxMapTileScale;
  }
#endif`,
  )
}
