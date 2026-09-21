import { createRequire } from "node:module";
import { dirname } from "node:path";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

const glslify = createRequire(import.meta.url)("glslify") as { compile(source: string, options: { basedir: string }): string };

export default defineConfig({
  plugins: [
    {
      name: "portfolio-shaders",
      enforce: "pre",
      transform(source, id) {
        if (!/\.(glsl|vs|fs|vert|frag)$/.test(id)) return;
        return { code: `export default ${JSON.stringify(glslify.compile(source, { basedir: dirname(id) }))}`, map: null };
      },
    },
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
