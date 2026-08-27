import type { NextConfig } from "next"

const shaderLoaders = ["raw-loader", "glslify-loader"]

const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  allowedDevOrigins: ['10.0.0.232'],

  turbopack: {
    rules: {
      "*.glsl": { loaders: shaderLoaders, as: "*.js" },
      "*.vs": { loaders: shaderLoaders, as: "*.js" },
      "*.fs": { loaders: shaderLoaders, as: "*.js" },
      "*.vert": { loaders: shaderLoaders, as: "*.js" },
      "*.frag": { loaders: shaderLoaders, as: "*.js" },
    },
  },
}

export default nextConfig
