## Physics (Box3D)

**Always use [box3d.js](https://github.com/isaac-mason/box3d.js) for 3D rigid-body physics in this repo.**

Do not add or use Rapier, Cannon-es, matter-js, `@react-three/rapier`, or other physics engines unless the user explicitly asks for something else.

### What it is

- **[box3d.js](https://github.com/isaac-mason/box3d.js)** — WebAssembly bindings for **[Box3D](https://github.com/erincatto/box3d)** (Erin Catto’s 3D engine, sibling of Box2D).
- The JS API mirrors the C API 1:1 (`b3CreateWorld`, `b3World_Step`, …). Upstream Box3D docs and the [box3d.js live examples](https://isaac-mason.github.io/box3d.js/) apply directly.
- Package: `box3d.js` — add it when starting a physics experiment.

### Import for Next.js / browser

Use the **inline** build so Turbopack/Next.js does not need to serve a separate `.wasm` file:

```ts
import Box3DFactory from "box3d.js/inline";
import type {
  Box3DModule,
  b3Vec3,
  b3Quat,
  b3BodyId,
  b3WorldId,
} from "box3d.js";

const b3: Box3DModule = await Box3DFactory();
```

| Import               | When                                                           |
| -------------------- | -------------------------------------------------------------- |
| `box3d.js/inline`    | **Default for this repo** — browser, Next.js, single-file WASM |
| `box3d.js`           | Node or bundlers that can serve `.wasm` alongside JS           |
| `box3d.js/mt-inline` | Multithreaded browser (needs cross-origin isolation)           |

### Conventions in this repo

1. **Async init** — WASM loads async. Dynamic-import physics setup from a `"use client"` page.
2. **Math types** — Plain arrays: `b3Vec3` = `[x, y, z]`, `b3Quat` = `[x, y, z, w]`. Identity rotation: `[0, 0, 0, 1]`.
3. **Out-param getters** — Reuse scratch arrays each frame to avoid GC: `b3.b3Body_GetPosition(scratch, body)`.
4. **Step loop** — `b3.b3World_Step(worldId, delta, 4)` once per frame (4 substeps is a good default).
5. **Mass & impulses** — Default shape density is **1000 kg/m³**. Scale impulses by `b3.b3Body_GetMass(body)` for predictable feel.
6. **Filter bits** — `categoryBits` / `maskBits` are `bigint`. Target ES2017: use `BigInt(1)`, not `1n`.
7. **Cleanup** — On teardown: `b3.b3DestroyWorld(worldId)`, then `b3.b3DestroyHull(hull)` for any hulls you created.
8. **Compound shapes** — `b3CreateCompoundShape` is for **static** bodies only. For dynamic compound colliders, attach multiple shapes to one body (e.g. `b3CreateTransformedHullShape`) or use joints between simple bodies.
9. **Joints** — Prefer Box3D joints (`b3CreateSphericalJoint`, `b3CreateRevoluteJoint`, `b3CreateDistanceJoint`, …) for chains, ragdolls, and constraints. Set `collideConnected: false` on connected pairs when overlap is unwanted.

### Further reading

- [box3d.js README & API guide](https://github.com/isaac-mason/box3d.js/tree/main)
- [Interactive examples](https://isaac-mason.github.io/box3d.js/) — shapes, joints, impulses, collision filtering, CCD, ragdoll, etc.
- [Box3D upstream](https://github.com/erincatto/box3d) — engine features and C docs

Load the **`box3d-js`** skill (`.agents/skills/box3d-js/SKILL.md`) when implementing or reviewing physics code.
