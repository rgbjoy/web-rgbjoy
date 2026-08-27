# Frog Ace (`FrogHop`)

A frog-sized golf game. You drag back from the frog like a slingshot to set
direction and power, read the wind, and release. The frog arcs off a wooden dock
onto an **endless, procedurally generated pond** of lily pads; land on the
highlighted pad to keep your streak alive, miss and you splash. There is no
finish — the score is how long a streak you can hold.

The first four hops are a **fixed tutorial run along the dock**: painted deck
targets where a miss costs a streak but never a splash, with a ghost ring
showing where you'll land. Wind ramps in across those hops (calm → crosswind →
headwind → full), and the training wheels come off the moment you step onto a
lily pad. Everything past the dock is generated.

Route: [`/frog-hop`](../frog-hop/page.tsx) → thin wrapper that renders
`FrogHopPage`. Registered in [`experiments.ts`](../experiments.ts) under
**Play**, status `wip`.

Built on plain React Three Fiber + Three.js primitives — no drei, no
postprocessing, no physics engine. Everything (frog, dock, pads, lilies, logs,
splash, wind streaks) is boxes, spheres, cylinders, one lathe and a couple of
bezier curves.

### Lily pads

Modelled on *Victoria amazonica*: a flat floor that turns up into a raised wall
at the rim, like a shallow tray. `LILY_PROFILE` is the half-section and
`LatheGeometry` revolves it; heights are expressed as offsets from
`LILY_SURFACE_Y` so the floor — what the frog stands on and what
`surfaceHeightAt` reports — can't drift from the rest of the game.

Two things worth keeping:

- **One unit-radius geometry for the whole pond.** Pads scale it on X/Z only,
  so wall height and thickness stay constant across pad sizes and the scene
  never holds more than a single lily geometry.
- **Materials live at module scope.** Pads re-render every hop, and inline JSX
  materials minted ~130 of them each time — ten ribs on each of ~19 live pads.

An earlier pass built the pad from an extruded `Shape` with a wedge notch cut
out. Worth knowing if you ever want the notch back: a cylinder with a
`thetaLength` gap leaves the notch's two radial faces open, so you see straight
through the pad into its hollow — `ExtrudeGeometry` closes them, and its bevel
rounds the rim for free.

## Files

| File | Role |
| --- | --- |
| `index.ts` | Re-exports `FrogHopPage` as the default. |
| `FrogHopPage.tsx` | Client component. Owns the `<Canvas>`, the DOM HUD and intro modal, and mints the run seed once at mount. Holds the only React state that re-renders the page. |
| `FrogHopScene.tsx` | Everything inside the canvas: game loop, input handling, camera rig, and all the scene meshes. |
| `FrogModel.tsx` | Loads the rigged frog FBX, drives its jump clip from the game phase, and cancels the clip's own vertical lift. |
| `game.ts` | Pure game math — power curve, hop range, wind generation and offset, launch solve, trajectory sampling, landing test. No scene objects, no React. |
| `course.ts` | The fixed dock prologue, the endless lily generator, windowing/culling, dock bounds and surface heights. |
| `FrogHop.module.css` | HUD, intro card, wind readout, responsive rules. |

The split is deliberate: `game.ts` and `course.ts` are dependency-light and
checkable in isolation; `FrogHopScene.tsx` is the only place that touches the
render loop.

## Game loop / state machine

Phase lives in `phaseRef` (a ref, not state — see *Performance* below) and is
mirrored to the HUD via `onHudChange`.

```
        pointer down (on frog)
 idle ─────────────────────────► aiming
   ▲                               │ release with drag > dead zone
   │                               ▼
   │                           shooting  ── frog follows the arc, t: 0→1
   │                               │
   │              ┌────────────────┼──────────────────┐
   │        lands on a pad   lands on bare deck   lands in water
   │              ▼                │                  ▼
   │           landed              │              missed  (sinks + splash ring)
   │              │ 0.28s          │                  │ 0.55s
   │              │                ▼                  ▼
   │              │           resetting ◄──────────────┘
   │              │          (0.48s ease back to the last pad)
   └──────────────┴────────────────┘
```

There is no win state — the pond is endless, and a splash only costs a streak.
The HUD reads just **Streak / Best**. A phase readout and a pads-cleared counter
were both tried and cut: the phase is already obvious from the screen, and with
the retry-on-miss rule the pad count only ever differs from the streak by
off-target landings, so it was a second score competing with the real one.
`HudState.phase` is still published — it's what triggers HUD updates — it just
isn't displayed.

Cancelling: while `aiming`, pushing the pointer *forward* past
`FORWARD_CANCEL_DISTANCE` above the drag origin aborts the shot. Releasing
inside the 12px dead zone does the same.

`safePositionRef` is the respawn point — updated on every successful pad
landing, and where `resetting` glides the frog back to.

## Aiming and the shot

`makeShotFromPointer` converts a pointer drag into a `Shot`:

1. **Direction** — inverted and camera-relative, so it reads as a slingshot
   pullback: dragging *down and left* fires *forward and right*.
2. **Power** — `powerFromDrag`: drag pixels remapped from the 12px dead zone to
   `MAX_DRAG_DISTANCE = 150`, clamped to 0…1.
3. **Range** — `jumpDistance(power)` lerps between `MIN_HOP_DISTANCE` and
   `MAX_HOP_DISTANCE` (1.4 → 6.6 world units).
4. **Wind offset** — `windOffset()`: `windDirection * strength`, scaled by power
   and hop length.
5. **Launch solve** — `solveLaunchDistance()` solves the launch vector so that
   *after* wind is added the total displacement still measures `desiredRange`:

   ```
   L = -(d·W) + √((d·W)² + R² - |W|²)
   ```

   Wind rotates where you end up; it doesn't lengthen or shorten the hop.
6. **Landing height** — `launchEnd.y` and `end.y` are set to
   `restHeightAt(end)`, so the descent from the dock down to a lily is spread
   across the arc instead of snapping on touchdown.

### Range is absolute, not target-relative

Originally `jumpDistance` took the target distance and returned
`targetDistance * (0.28 + power * 0.72)`. That capped a full-power hop at
*exactly* the target's centre, which had two bad consequences: overshooting was
mathematically impossible, and the top of the power bar was dead travel — it
felt maxed out well before the drag ended.

The range is now a flat 1.4–6.6 regardless of target. Course hops land at 36–74%
power, leaving real headroom in both directions:

| Hop | Distance | Power needed | Drag |
| --- | --- | --- | --- |
| `dock-start → mark-a` | 3.25 | 36% | 61px |
| `mark-a → mark-b` | 3.54 | 41% | 69px |
| `mark-b → mark-c` | 4.39 | 58% | 91px |
| generated pond hops | 3.2–5.0 | 35–69% | 61–107px |

Full power from any dock pad overshoots onto bare decking; from `mark-c` (the
last dock pad) it overshoots into the water.

### The aim basis is frozen at pointer-down

`aimForwardRef` / `aimRightRef` snapshot the camera's flattened basis when the
drag starts, and the drag is resolved against that snapshot for its whole life.

**Do not re-read the live camera inside the drag.** It did originally, and the
result was an aim that felt glitchy and sticky: the camera turns to follow
`viewDirectionRef`, which is itself set from the aim, so a fixed lateral drag
was measured against a basis that had already rotated toward it. Each pointer
event added the same angular offset again — lateral drag became angular
*velocity* instead of angular *position*, and the aim spun away as long as you
held it off-centre. With the basis frozen the camera can still swing to follow
your aim without feeding back into the input.

## Landing

`findLandingPad` is a flat XZ radius test against every pad, using the pad's
**full** radius. The frog's *centre* is what gets tested, so anywhere over the
disc counts, but its actual touchdown XZ is preserved instead of snapping to
the platform's middle. This was inset to `radius - 0.22`, which meant a hop that
visibly put the frog half onto a pad still splashed. Generated pads are always
separated by at least `r1 + r2 + 0.35` (and the fixed dock pads by more), so
full-radius zones still can't overlap — verified over 2000 hops: no overlapping
zones, and every rim point resolves to its own pad. Nearest qualifying pad wins.
Then, in priority order:

- **On a pad** (deck or lily — same branch) → keep the touchdown point at the
  pad's surface height and fire the landing burst there. Streak increments only
  if that pad was the *current target*; otherwise it resets to 0 but you keep
  the progress.
- **On bare decking** (`isOnDock`) → no splash, but no ground gained either:
  glide back to the last pad and take the hop again. Standing where you landed
  used to leave you *past* the target, having to aim backwards to recover.
- **Anywhere else** → water. `missed`: the frog sinks, a splash ring expands,
  streak resets, then `resetting` glides you back.

## Knowing where you'll land

Four separate reads, deliberately layered:

**`TrajectoryDots`** — 16 dots along the shot's real flight path, sampled
straight from `pointOnShot`, so they show the wind bend and the arc height
rather than a straight aim line. One `InstancedMesh` repositioned imperatively
while dragging; dots grow toward the far end and take the power colour so the
whole aim readout reads as one object. `frustumCulled={false}`, since the
instance matrices are set by hand and the bounding sphere is never right.

**Dock only**, on the same `isOnDock(shot.start)` gate as the landing ring. The
trail effectively ends at the touchdown point, so leaving it on out in the pond
hands over exactly the information the wind tuning exists to make you earn — it
would undo the ~87% must-lead difficulty in one step. On the dock it's the
clearest possible way to teach what wind does to a hop; past it, you read the
arrow.

**`FrogShadow`** — a hard stylised circle pinned directly under the frog at
`surfaceHeightAt(x, z)`, tightening and fading with altitude. This is the
continuous read: it slides along the ground beneath the arc and converges on the
touchdown point. The frog deliberately casts **no** light shadow — the
directional light throws one off to the side, which tells you nothing about
where a hop is going, and two shadows read as noise. Its radius has to clear the
frog's own silhouette; sized to the body it is completely hidden behind it from
this chase angle.

**`LandingPreview`** — the tutorial's ghost ring at `shot.end` while aiming.

| Colour | Meaning |
| --- | --- |
| Green | Lands on the current target |
| Amber | Lands somewhere safe — another pad, or bare decking |
| Red | Lands in the water |

Gated on `isOnDock(shot.start)` — on *where the frog is standing*, not a step
counter. So it retires itself when you reach the pond, and returns if you're
ever knocked back onto the dock. Because `mark-c` is still on the dock, the
first hop over water is previewed and the helper disappears one hop later.
`TrajectoryDots` rides the same gate; the aim stick is the only aid that stays.

**`LandingBurst`** — a 0.5s expanding ring at the touchdown point, green
on-target and amber otherwise. The after-the-fact confirmation.

All four are driven imperatively (refs and `useImperativeHandle`), so none of
them render React while you drag.

## Course

A linked list via `nextTargetId`. Every pad declares a `surface`, which is what
separates the fixed tutorial from the generated pond:

```
  ── dock (fixed) ─────────────────────┐  ── lily (generated, endless) ──────
  dock-start ─► mark-a ─► mark-b ─► mark-c ─► l<seed>-0 ─► l<seed>-1 ─► …
                 calm    breeze    full            ▲
                                            l<seed>-0a  (bail-out pad)
```

Dock pads sit inside `DOCK_BOUNDS`, so overshooting one lands on decking rather
than in the pond — that is the whole reason the tutorial is safe, and it needs
no special-casing in the landing code.

Each pad carries an optional `hint`, shown in the bottom bar while it is the
active target, so the coaching lives next to the geometry it describes.

## Endless generation

`Course` holds a rolling window: the four dock pads (kept forever, they're
cheap) plus lilies from `cursor - KEEP_BEHIND` to `cursor + LOOK_AHEAD`. Every
landing calls `advanceCourse`, which grows the frontier and culls what's behind.
About **19 pads are alive at once** regardless of how far you get.

Each lily is placed off the frontier by a seeded `mulberry32` draw:

- **Span** 3.2–5.0 world units, comfortably inside the 6.6 max hop.
- **Heading** a bounded random walk (`meander`) within ±34° of straight down the
  pond, plus a centering term pulling back toward `x = 0`. Without the centering
  an endless random walk drifts sideways forever and eventually leaves the water.
- **Radius** 0.86–1.26, so pads vary in difficulty.
- Overlap is checked against every live pad, nudging the span outward up to four
  times if the meander doubled back onto something.

### Logs

Roughly half the pads get a drifting log beside them, placed and culled on the
same schedule as the pad. They used to be four fixed positions near the origin —
fine for a fixed course, but once pads were randomly generated a pad could spawn
straight through one, and the pond went bare of scenery past ~15 pads either way.

Each log is a texture-free detailed assembly: a tapered faceted trunk, layered
cut faces with two growth rings, deterministic bark plates, a knot, a capped
branch stub, and a dark wet underside. Geometry and PBR materials live at module
scope and are shared by every live log; `dispose={null}` prevents culling one log
from disposing resources still used by the others.

Placement is a clearance test against pads *and* other logs, retried over a few
random angles. Two details it's easy to get wrong:

- The offset from the parent pad has to clear `collides`' own margin. At a
  slightly smaller reach every candidate is rejected by the very pad it belongs
  to, and **no logs spawn at all** — which looks like working code, since a pond
  with no logs renders perfectly happily.
- Pad placement gives up after four attempts and places the pad regardless, so
  a later pad can still land on an existing log. Pads are gameplay and logs are
  scenery, so any log the final pad position touches is culled.

### Bail-out pads

Roughly 45% of pads get a smaller neighbour that links to the same next target —
land on it and you skip the splash but lose your streak.

**These are placed once *both* neighbours exist**, offset perpendicular to the
chord from predecessor to successor. The first implementation offset them from
the *incoming* hop direction and placed them at generation time, before the next
pad existed. When the next pad happened to bend the other way, the lateral
offsets compounded: a 1750-hop sweep found bail-outs sitting **7.21 units** from
their next target, past the 6.6 max hop — landing on one stranded the frog with
no legal move. Candidates are now also explicitly range-checked against
`ALT_MAX_SPAN` on both the way in and the way out, and dropped if they breach it.

### Seeding

Pad ids embed the run seed (`l<seed>-<index>`) because **wind is hashed from the
pad id** — without it every run would blow exactly the same way at the same pad
number.

The seed comes from the page as `useState(randomSeed)` — a **lazy initializer**,
which the React Compiler accepts even though it rejects a bare `Math.random()`
in the render body. That matters: it mints the seed exactly once per mount, so
the pond behind the intro modal is the pond you play.

Seeding in the "Start round" handler instead was tried and is wrong. It bumps
the `key` on `<FrogHopScene>`, so the world you were looking at through the
modal is torn down and rebuilt the instant the modal closes — and the backdrop
is only lightly blurred, so you watch the whole pond pop. **Only `Restart`
should change the seed**, because that's the one place a new world is expected.

`advanceCourse` returns a **new** `Course` rather than mutating, for the same
reason — the compiler rejects mutating render-scope values from the frame loop.
The scene keeps the course in state and mirrors it into a ref, because the
landing handler needs the newly-grown course within the same frame, before the
sync effect runs.

### The world has to follow

Two things break at distance and are easy to miss, since nothing is wrong for
the first twenty-odd pads:

- **Water** is a slab that follows the frog. A fixed one runs out and the frog
  starts hopping over the void.
- **The sun** follows too. Its shadow camera is a tight box around the target,
  so leaving it at the origin drops every shadow once the course carries the
  frog out of it.

## Surfaces and heights

Three stacked surfaces, all declared in `course.ts` so nothing drifts:

| Surface | Top | Frog rests at |
| --- | --- | --- |
| Water | −0.03 | — |
| Lily pad | 0.14 | 0.18 |
| Dock deck | 0.26 | 0.30 |

`surfaceHeightAt(x, z)` returns whatever is directly below a point, using each
pad's **full** radius (not the stricter landing radius) so the drop shadow rides
a pad's visible edge instead of popping at its rim. `restHeightAt` adds
`FROG_FOOT_CLEARANCE`.

The dock standing 0.12 above the lilies is what makes the hop to `one` a step
down; see *Landing height* above for how the arc absorbs it.

## Wind

Wind is **deterministic, not random** — `windForTarget` hashes the target pad's
id and derives:

- `angle`: −78°…+78° relative to the direct line to the target
- `speed`: 4–11 mph, scaled by the pad's `windScale`
- `strength`: `0.28 + speed * 0.145` world units of drift

Every run plays the same winds in the same places. That is the whole reason the
tutorial can teach the feel of "8 mph ≈ lead by a pad width".

The hash is djb2 followed by a murmur3 finalizer. Plain djb2 is not enough here:
pad ids are short and similar, its low bits barely move, and four consecutive
pond hops came out within a few degrees of each other — the entire pond blew one
way. Every step is forced back to unsigned with `>>> 0`; `^` yields a *signed*
int in JS, and one negative hash puts the angle outside ±78°.

The fixed tutorial rows, measured at the power each hop actually needs:

| Hop | mph | Drift | Landing radius | |
| --- | --- | --- | --- | --- |
| `dock-start → mark-a` | 0 | 0.00 | 1.40 | calm |
| `mark-a → mark-b` | 3 | 0.57 | 1.20 | forgiving |
| `mark-b → mark-c` | 4 | 0.84 | 1.15 | forgiving |
| `mark-c → l…-0` | 6 | 0.98 | 1.15 | forgiving |

The curriculum is deliberate — calm (aim and power only), then a crosswind you
can still hit *without* leading, then a stronger one where drift nearly fills
the landing radius, then one you genuinely have to lead.

**`mark-b`'s `windScale` is what keeps this ramp monotonic.** Raw hashed speeds
don't ramp on their own — at `0.45` the "a breeze now" hop came out *stronger*
(5 mph) than the "full wind" hop after it (4 mph), which reads as broken. `0.28`
puts it at 3 mph and restores the climb. Retune it whenever the wind constants
or the tutorial pad ids change.

Out on the generated pond, wind is whatever the pad ids hash to. Over ~1200 hops
that means a mean of **7.6 mph**, drift averaging **31% of the hop** (max 43%),
**70% of hops needing a real lead**, and a worst-case lead angle of **25°**.
(That was 88% before landing zones widened to the full pad radius — worth
knowing if the pond ever needs its difficulty back.)
Drift routinely exceeds the landing radius, which is the point: out there you
aim into the wind, not at the pad.

Because pad ids seed the wind, **renaming a pad reshuffles its wind.** The
tutorial ids were picked by checking the resulting angles and speeds, not chosen
for readability alone.

`windOffset` scales the base strength by power (`lerp(0.6, 1.25, power)`) and
mildly by hop length, so wind stays a roughly consistent fraction of any hop.

`pointOnShot` samples the arc:

```ts
p = lerp(start, launchEnd, t) + wind * t^1.7   // drift accumulates late
p.y += sin(π * t) * arcHeight                  // symmetric arc
```

`WIND_DRIFT_EXPONENT` (1.7) is why a shot looks straight early then bends near
the end — it reads as drift rather than a constant sideways push. Any exponent
works as long as it's ≥ 1 and hits exactly 1 at `t = 1`, so the frog still lands
on the `end` that `findLandingPad` was given.

**The HUD arrow is camera-relative.** Every frame the scene computes
`playerYaw - windYaw`, wraps it to ±180°, and writes it straight to
`windArrowRef.current.style.transform` — no React re-render.

The readout stacks label, arrow and speed on one centre axis at a **fixed
width**, so the arrow doesn't shift sideways as the reading goes from 4 to 11.
The number and its unit sit in a `display: flex; align-items: baseline` row;
they were previously aligned by nudging `mph` with a hard-coded `margin-bottom`,
which is what made the pairing look off.

At `speed === 0`
the readout shows **Calm** instead of the arrow and `WindLines` hides itself;
streaks drifting past a HUD that says there's no wind is a straight
contradiction on the very hop meant to isolate aim from wind.

`WindLines` visualises the same vector: six cubic bezier streaks parented to the
frog, oriented by a `setFromUnitVectors` quaternion, animated by advancing each
curve's `drawRange` — a moving dash of geometry rather than a shader.

## The dock

Decking is laid crosswise as individual plank meshes rather than one textured
slab, so the gaps catch the light and the far edge reads as boards. Frame beams
tuck under the plank ends, pilings carry it, and two mooring posts flank the
jump-off end.

Two things that are load-bearing rather than decorative:

- A **dark backing panel** sits just under the boards. Without it the plank gaps
  show bright water and the deck reads as stripes.
- **Piling tops must finish below the boards.** At deck height they punch
  through the planks and leave stubs standing inside the painted targets.

Dock targets are flat painted overlays (concentric rings), not geometry, so the
plank gaps still read through the edge of each circle.

## Flight attitude

The frog leans into what the wind is doing to it, so the drift reads on the body
and not only in the path.

- **Yaw follows real travel, not the aim.** `velocityOnShot` is the analytic
  derivative of `pointOnShot`: a constant launch term plus a wind term growing as
  `n·t^(n-1)`. So a hop leaves pointing where you aimed and arrives pointing
  where the wind actually took it. It's fed into `viewDirectionRef` rather than
  written straight to `rotation.y`, which reuses the existing damping and lets
  the camera drift into the curve too.
- **Roll turns the belly into the wind, not into the curve.** A frog in flight
  is a flat body: a crosswind gets under the windward flank and rolls it over,
  rather than banking it into the turn the way a steering animal would. So
  `BANK_PER_RADIAN` is *negative* — the roll opposes the heading drift. Verified
  by building the frog's transform and checking the belly vector: wind from the
  right pushes the frog left and the belly ends up facing right, into the wind.
- **Pitch** comes from `climbRateOnShot` — nose up climbing, level at the apex,
  nose down falling.
- **The frog group uses `YXZ` Euler order**, not the default `XYZ`. Yaw has to be
  outermost so pitch and roll act on the frog's own axes; under `XYZ`,
  `rotation.x` is applied about *world* X, so pitch bled into roll as soon as the
  heading turned away from -Z — which it does constantly on a meandering pond.

Measured across the real wind range, peak bank scales the way it should:

| Wind | Peak heading drift | Bank |
| --- | --- | --- |
| 4° (near tailwind) | 1.7° | 1.4° |
| 33° crosswind | 14.2° | 12.1° |
| 61° crosswind | 20.5° | 17.4° |
| ±78° at 11 mph | ~35° | 24° (capped) |

A tailwind barely tilts the frog, which is correct — it bends the path very
little. Roll is held through the apex, then multiplied by a smooth landing fade
from 50% to 86% of the hop so the frog visibly levels during descent rather
than snapping upright after contact. Both angles also ease back to level
whenever the frog isn't airborne, so it never sits on a pad holding a tilt.

## The frog model

A rigged FBX (`public/models/frog/`) — one skinned mesh, 112 bones, 32.5k verts,
with two 0.8s clips. Loaded with a focused `FBXLoader` subclass and driven by a
hand-rolled `AnimationMixer`; this project has no drei, so there's no `useGLTF`
or `useAnimations` to lean on. The loader already keeps and normalises the four
strongest bone influences supported by WebGL; the subclass only suppresses that
one known excess-weight warning from this asset while preserving all others.

Four things about it are load-bearing:

- **`metarig|jumpInPlace`, not `metarig|jump`.** The travelling clip moves the
  body ~890cm forward, and position is owned by `pointOnShot` — the two would
  fight for control of where the frog actually is.
- **The clip's vertical lift is cancelled every frame.** "In place" only means
  no *horizontal* travel: the spine still rises ~292cm, which is ~0.99 world
  units once scaled, on top of the arc the game already draws. There are no root
  position tracks (the lift comes from bone rotation), so it can't be stripped
  from the clip. Instead `FrogModel` measures the spine against its rest pose
  each frame and offsets a holder group by the negative. Verified: spine
  world-Y holds constant across the hop, so the clip contributes no net height
  and `pointOnShot` stays the only source of vertical motion. The lift is
  whole-body — spine and toe both rise ~290 — so removing it leaves the pose
  intact.
- **Two shadows serve different jobs.** The animated skinned mesh casts the
  directional-light shadow so it can fall across raised lily lips. A separate
  flat contact circle stays directly below the frog, making height and the
  eventual touchdown position readable while airborne.
- **The clip is scrubbed, not played.** `mixer.setTime()` is driven from the
  hop's 0→1 progress rather than wall-clock time, because flight duration varies
  with power (0.62–0.92s) while the clip is a fixed 0.8s.
- **`SkeletonUtils.clone`, never `Object3D.clone`.** A plain clone copies the
  SkinnedMesh but leaves it bound to the *original* skeleton; the copy renders
  collapsed to nothing. This cost a debugging round — the frog was invisible
  while its drop shadow rendered fine.

The per-phase squash-and-stretch that the primitive frog used is gone: the clip
carries the crouch, launch and landing, and scaling a skinned mesh on top of its
own animation just fights it. Only a gentle idle breath remains, since the model
ships no idle clip.

`MODEL_SCALE` (0.0034 — the FBX is in centimetres) and `MODEL_YAW` (π, to put
the model's rest facing on the game's forward −Z) are the two dials to touch if
the frog looks wrong.

## Camera

A damped chase rig, recomputed at the end of `useFrame`:

- `CAMERA_DISTANCE = 7.2` behind and `CAMERA_HEIGHT = 5.8` above the frog.
- Looks `CAMERA_LOOK_AHEAD = 2.1` in front, plus a small Y offset.
- Position exponentially damped (`1 - exp(-delta * 4.2)`), frame-rate
  independent.

Heading is smoothed separately: `dampAngle` interpolates the *yaw* by the
shortest angular path rather than lerping direction vectors. Three directions
are tracked — `viewDirectionRef` (live aim), `settledDirectionRef` (committed,
restored on cancel), `smoothedDirectionRef` (what the camera and frog use).

## Frog and feedback

A group of spheres, plus an **invisible 0.92-radius sphere carrying all pointer
handlers** — a generous hit target that doesn't depend on hitting the small body
meshes. Pointer capture is taken on down, so the drag survives leaving the frog.

Squash-and-stretch is done by lerping `frog.scale` per phase: breathing when
idle, crouch while aiming, stretch in flight, impact squash on landing.

`AimGuide` is the pullback stick drawn *behind* the frog, length
`0.45 + power * 1.65`, coloured green → orange → red by `powerColor`.
`TargetRing` is a pulsing torus over the current target, floating a fixed
`padSurfaceY(pad) + 0.125` above whatever it marks. Derive that from the pad's
surface, never a literal per surface: it was a hardcoded `0.14` for deck pads,
correct while they were sand at `0.07`, and the ring ended up buried inside the
planks the moment the dock rose to `0.26`.

## Performance

- All mutable game state lives in **refs**; the only `useState` inside the scene
  is `targetId`, which changes at most once per hop.
- Module-scope scratch vectors — no per-frame allocation in `useFrame`.
- `Course` and `Frog` are `memo`'d; the guide, preview, burst and splash are
  ref-driven.
- HUD wind arrow is written via direct DOM style mutation, not state.
- Geometries and materials created in `useMemo` are disposed in cleanup.
- `dpr={[1, 1.5]}`, 1024² shadow map, tightly cropped directional shadow camera.

Restart is a **full remount**: `FrogHopPage` bumps a `run` counter used as
`<FrogHopScene key={run}>`, throwing away every ref rather than resetting state
field by field.

Note for anyone extending the animated components: the React Compiler's
immutability rule rejects mutating a `useMemo`'d material inside `useFrame`.
Hold the mesh in a ref, declare the material in JSX, and reach it via
`mesh.material` — see `LandingBurst`.

## Tuning constants

| Constant | Where | Value | Effect |
| --- | --- | --- | --- |
| `MIN_HOP_DISTANCE` / `MAX_HOP_DISTANCE` | game.ts | 1.4 / 6.6 | Hop range — sets where course hops sit on the power bar |
| `DRAG_DEAD_ZONE` | game.ts | 12px | Minimum drag before a shot registers |
| `MAX_DRAG_DISTANCE` | game.ts | 150px | Drag distance for full power |
| `FORWARD_CANCEL_DISTANCE` | Scene | 44px | Forward push that cancels aiming |
| `WIND_BASE_STRENGTH` | game.ts | 0.28 | Drift floor |
| `WIND_STRENGTH_PER_SPEED` | game.ts | 0.145 | Per-mph drift — **the main wind dial** |
| `WIND_DRIFT_EXPONENT` | game.ts | 1.7 | How late in the arc the bend appears |
| wind angle / speed | game.ts | ±78° / 4–11 | Course difficulty |
| `windScale` | course.ts | per pad | Tutorial ramp: 0 → 0.28 → 1 |
| `HOP_MIN` / `HOP_MAX` | course.ts | 3.2 / 5.0 | Generated pad spacing |
| `MAX_SPREAD` | course.ts | 0.6 rad | How much the pond meanders |
| `LOOK_AHEAD` / `KEEP_BEHIND` | course.ts | 5 / 2 | Live pad window (~19 pads) |
| `ALT_CHANCE` / `ALT_MAX_SPAN` | course.ts | 0.45 / 6.0 | Bail-out frequency and reachability ceiling |
| duration / arcHeight | Scene | 0.62–0.92s / 0.85–1.9 | Flight feel by power |
| `landed` hold | Scene | 0.28s | Squash pause before aiming again |
| `missed` / `resetting` | Scene | 0.55s / 0.48s | Splash and recovery timing |
| `TURN_DAMPING` / camera damping | Scene | 4.2 / 4.2 | Turn and chase responsiveness |

## Rough edges

- `FrogProps` declares `phaseRef` and `FrogHopScene` passes it, but the `Frog`
  component never uses it — dead prop.
- The intro modal is dismiss-only; no way to bring it back short of a reload.
- Input is pointer-drag only — no keyboard path, so the game isn't playable
  without a pointing device despite the HUD's `aria-live` labelling.
- The tutorial replays in full on every Restart, with no skip and no memory of
  having played before.
- Landing back on `dock-start` re-points the target at `mark-a`, so a bad early
  hop can rewind you into the tutorial.
- Bare-deck landings always return you to the last pad, including on the pond
  side — harmless today only because you'd have to aim backwards to reach the
  dock from a lily.
- Nothing persists between runs — the best streak and pad count reset on reload,
  which is a thin ending for a score-chasing endless mode.
- There is no difficulty ramp with distance; pad 200 generates from the same
  distribution as pad 5.
- The frog is a **6.1 MB download** (2.8 MB FBX + two 2048² PNGs). That's heavy
  for a page in an experiments gallery and it all blocks the frog appearing.
  Converting to GLB with Draco and halving the textures to 1024² would cut it by
  roughly an order of magnitude.
