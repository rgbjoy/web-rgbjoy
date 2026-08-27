import { useEffect, useMemo } from "react"
import { Uniform } from "three"
import { BlendFunction, Effect, EffectAttribute } from "postprocessing"

const RadialEdgeBlurShader = {
  fragmentShader: /* glsl */ `
    uniform float strength;
    uniform float radius;
    uniform float feather;

    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
      vec2 p = uv - 0.5;
      float dist = length(p * vec2(1.0, 0.78));
      float edge = smoothstep(radius - feather, radius + feather, dist);

      vec4 color = vec4(0.0);
      float total = 0.0;
      float blurRadius = edge * strength;

      for (int x = -4; x <= 4; x += 1) {
        for (int y = -4; y <= 4; y += 1) {
          vec2 offset = vec2(float(x), float(y)) * blurRadius / resolution;
          float weight = 1.0 - length(vec2(float(x), float(y))) * 0.11;
          vec4 sampleColor = texture2D(inputBuffer, uv + offset);
          color += sampleColor * weight;
          total += weight;
        }
      }

      outputColor = color / total;
    }
  `,
}

class RadialEdgeBlurEffect extends Effect {
  constructor({
    strength = 7,
    radius = 0.34,
    feather = 0.14,
  }: {
    strength?: number
    radius?: number
    feather?: number
  } = {}) {
    super("RadialEdgeBlurEffect", RadialEdgeBlurShader.fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform<number>>([
        ["strength", new Uniform(strength)],
        ["radius", new Uniform(radius)],
        ["feather", new Uniform(feather)],
      ]),
    })
  }
}

export function RadialEdgeBlur({
  strength = 4,
  radius = 0.32,
  feather = 0.16,
}: {
  strength?: number
  radius?: number
  feather?: number
}) {
  const effect = useMemo(
    () => new RadialEdgeBlurEffect({ strength, radius, feather }),
    [strength, radius, feather],
  )

  useEffect(() => {
    effect.uniforms.get("strength")!.value = strength
    effect.uniforms.get("radius")!.value = radius
    effect.uniforms.get("feather")!.value = feather
  }, [effect, strength, radius, feather])

  return <primitive object={effect} />
}
