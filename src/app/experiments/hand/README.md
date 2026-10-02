# Hand

A single sculpted hand hanging into frame from the top edge, fingers rolling
closed and open — little finger first, index last — in a seamless
eight-second loop. One hard key light, a rim from behind, and a grade pass
that turns it into grainy black and white.

The cursor is a white 3D arrow in the scene. Its tip sits under the pointer
but travels in depth along a tilted screen axis — in front of the hand toward
the bottom left, behind it toward the top right (the angle is tunable) — so it
can pass through the fingers and be hidden by them. Bring it into the hand's
grasp and the fingers close on it — the arrow starts to glow white, lighting
the fingers from inside and throwing volumetric light shafts out through the
gaps between them, and the hand gives it a slow, subtle shake. It stays held
while you move across the axis and is only let go when you pull along it: out
the front or out the back. A thin ring marks the real pointer while it is
held. The grab logic tracks a marble at the arrow's tip, which the debug panel
can show.

Route: [`/experiments/hand`](./page.tsx). Registered in
[`experiments.ts`](../../data/experiments.ts) under **3D & Spatial**, status `wip`.

## Pieces

- [`loop.ts`](./loop.ts) — the whole animation as a pure function of time.
  Every value is periodic in `LOOP_SECONDS`, so the loop never seams;
  `loop.test.ts` checks that.
- [`HandModel.tsx`](./HandModel.tsx) — loads the rig, derives each finger
  joint's bend axis from the skeleton (across the finger, relative to the palm
  normal) and composes the curl onto the bone's rest rotation. Also frames the
  camera so the cut wrist always runs off the top of the screen.
- [`grasp.ts`](./grasp.ts) — the depth mapping and the grab/release rules,
  pure and tested. Grabbing needs the marble near the grip *and* the pointer
  inside a narrow band; letting go needs it outside a wider one, so a release
  never snaps straight back into a grab.
- [`Cursor.tsx`](./Cursor.tsx) — the arrow, the marble it tracks, and the frame-by-frame grab state.
- [`Debug.tsx`](./Debug.tsx) / [`tuning.ts`](./tuning.ts) — open
  `/experiments/hand?debug` for a panel that nudges the grasp point (x right,
  y up, z toward you, in world units), sets idle and held curls for the
  fingers and thumb, sets the depth axis's angle and how far the cursor
  travels in front of and behind the grip, draws the grasp zone, the cursor path (with a top-down inset), a
  depth rod that thins with distance, and the marble, and shows live
  pointer/grasp positions and depth. "Copy
  values" puts the tuned numbers on the clipboard to paste back into
  `tuning.ts`.
- [`Grade.tsx`](./Grade.tsx) — renders the scene to a half-float target, then
  ACES, luminance, an S-curve, light shafts, a vignette and film grain
  re-seeded at 24fps. While the cursor glows it also draws a half-res mask —
  the scene in flat green, then a soft red light behind the fist, sized by
  "Shaft source size", where the fingers don't hide it — and marches each pixel toward the light through it,
  so only light that escapes between the fingers streaks out, into the air
  rather than across the hand.
  Grain cells are CSS pixels so density matches across DPRs.

## Model

`public/models/hand/hand.glb` is the left hand from
[Godot XR Tools](https://github.com/GodotVR/godot-xr-tools/tree/master/addons/godot-xr-tools/hands)
(`hand_l.blend`, the `Hand_Nails_L` mesh), exported from Blender with one level
of subdivision applied, the 26-bone rig kept, and UVs and materials dropped.

The mesh was made with MakeHuman, whose exported models are released under
**CC0**; the Godot XR Tools repository is MIT. No attribution is required,
and the asset is safe for commercial use.
