"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  Suspense,
  createContext,
  forwardRef,
  memo,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CubicBezierCurve3,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line as ThreeLine,
  LatheGeometry,
  LineBasicMaterial,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";

import {
  DOCK_BOUNDS,
  DOCK_START_POSITION,
  DOCK_SURFACE_Y,
  FLOWER_BASE_RADIUS,
  FLOWER_SATELLITE_GAP,
  FROG_FOOT_CLEARANCE,
  WATER_SURFACE_Y,
  advanceCourse,
  createCourse,
  LILY_SURFACE_Y,
  POND_FOG_COLOR,
  POND_FOG_FAR,
  POND_FOG_NEAR,
  POND_FLOOR_Y,
  isOnDock,
  padSurfaceY,
  restHeightAt,
  type Course,
  type LogDefinition,
  type PadDefinition,
} from "./course";
import {
  DRAG_DEAD_ZONE,
  findLandingPad,
  jumpDistance,
  pointOnShot,
  powerColor,
  powerFromDrag,
  climbRateOnShot,
  solveLaunchDistance,
  velocityOnShot,
  WIND_MIN_SPEED,
  WIND_SPEED_SPREAD,
  windForPad,
  windOffset,
  type GamePhase,
  type HudState,
  type Shot,
} from "./game";
import { FrogModel } from "./FrogModel";
import { SimpleWater, sampleWaterDisplacement } from "./SimpleWater";

const CAMERA_DISTANCE = 7.2;
const CAMERA_HEIGHT = 5.8;
const CAMERA_LOOK_AHEAD = 2.1;
const TURN_DAMPING = 4.2;
/**
 * Roll, per radian of heading drift. **Negative on purpose.** A frog in flight
 * is a flat body, so a crosswind gets under the windward flank and rolls it
 * belly-into-the-wind — it does not bank into the turn the way a steering
 * animal would, which is what a positive value here would give you.
 *
 * With forward at -Z, a positive `rotation.z` turns the belly toward +X. Wind
 * pushing the frog toward -X yields a negative drift, so negating it lands the
 * belly on +X — facing the wind it's being shoved by.
 */
const BANK_PER_RADIAN = -0.95;
const MAX_BANK = 0.42;
/** Fade roll through the descent so the frog meets the pad level. */
const BANK_LEVEL_START = 0.5;
const BANK_LEVEL_END = 0.86;
const PITCH_AMOUNT = 0.26;
const BODY_DAMPING = 9;
/**
 * How far the pointer must push *past* the drag origin to abort the shot. This
 * has to stay well clear of ordinary drag jitter — at a few pixels the aim kept
 * dropping back to idle mid-pull.
 */
const FORWARD_CANCEL_DISTANCE = 44;
const CAMERA_LOOK_OFFSET = new Vector3(0, 0.45, 0);
const UNIT_Y = new Vector3(0, 1, 0);
const WORLD_UP = new Vector3(0, 1, 0);
const WIND_FORWARD = new Vector3(0, 0, 1);
/** Keeps the lowest wind streak visibly clear of raised lily-pad rims. */
const WIND_STREAK_HEIGHT = 1.18;
/** Shared world-space clearance for every gameplay/helper ground ring. */
const GROUND_RING_SURFACE_OFFSET = 0.14;
/** Heading from the dock start toward the first tutorial mark. */
const INITIAL_HEADING = new Vector3(0.15, 0, 9.85)
  .sub(new Vector3(...DOCK_START_POSITION))
  .setY(0)
  .normalize();

function ringHeightForPad(pad: PadDefinition) {
  const surface =
    pad.surface === "lily" ? LILY_SURFACE_Y : DOCK_SURFACE_Y;
  return surface + GROUND_RING_SURFACE_OFFSET;
}

type FrogHopSceneProps = {
  /** Seeds the endless pond. Supplied by the page so render stays pure. */
  seed: number;
  onHudChange: (next: HudState) => void;
  windArrowRef: React.RefObject<HTMLElement | null>;
};

type AimGuideHandle = {
  hide: () => void;
  update: (shot: Shot) => void;
};

type LandingPreviewHandle = {
  hide: () => void;
  update: (shot: Shot, targetId?: string) => void;
};

type TrajectoryDotsHandle = {
  hide: () => void;
  update: (shot: Shot) => void;
};

type PointerCaptureTarget = {
  setPointerCapture: (pointerId: number) => void;
  hasPointerCapture: (pointerId: number) => boolean;
  releasePointerCapture: (pointerId: number) => void;
};

type FrogProps = {
  phaseRef: React.RefObject<GamePhase>;
  progressRef: React.RefObject<number>;
  frogRef: React.MutableRefObject<Group | null>;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  onPointerCancel: (event: ThreeEvent<PointerEvent>) => void;
};

const tempDirection = new Vector3();
const tempFocus = new Vector3();
const tempCameraPosition = new Vector3();
const tempLookAt = new Vector3();
const tempScale = new Vector3();
const tempWindOffset = new Vector3();
const tempBurst = new Vector3();
const tempDot = new Vector3();
const tempVelocity = new Vector3();

export function FrogHopScene({
  seed,
  onHudChange,
  windArrowRef,
}: FrogHopSceneProps) {
  const { camera } = useThree();
  const frogRef = useRef<Group>(null);
  const guideRef = useRef<AimGuideHandle>(null);
  const previewRef = useRef<LandingPreviewHandle>(null);
  const dotsRef = useRef<TrajectoryDotsHandle>(null);
  const burstRef = useRef<LandingBurstHandle>(null);
  const splashRef = useRef<Group>(null);
  const floatingPadsRef = useRef(new Map<string, Mesh>());
  const phaseRef = useRef<GamePhase>("idle");
  const phaseStartedAtRef = useRef(0);
  // The course grows and is culled as you go. It lives in state so React can
  // render the pads, and is mirrored into a ref for the frame loop — which
  // needs the *new* course within the same landing, before the effect runs.
  const [course, setCourse] = useState(() => createCourse(seed));
  const courseRef = useRef(course);
  useEffect(() => {
    courseRef.current = course;
  }, [course]);
  const safePositionRef = useRef(new Vector3(...DOCK_START_POSITION));
  const safePadIdRef = useRef<string | null>(null);
  const shotRef = useRef<Shot | null>(null);
  const preparedLandingRef = useRef<{
    course: Course;
    padId: string;
  } | null>(null);
  // 0→1 through the current hop. FrogModel scrubs the jump clip against this
  // so the pose tracks the arc, whose duration varies with power.
  const hopProgressRef = useRef(0);
  // Cosmetic body attitude during flight, damped so it eases in and out.
  const bankRef = useRef(0);
  const pitchRef = useRef(0);
  const resetFromRef = useRef(new Vector3());
  const dragStartRef = useRef(new Vector2());
  // Camera basis frozen at pointer-down. It must NOT be re-read from the live
  // camera while dragging: the camera is busy turning toward the aim, so a
  // moving basis turns a fixed lateral drag into a constant rotation and the
  // aim spins away instead of holding still.
  const aimForwardRef = useRef(new Vector3());
  const aimRightRef = useRef(new Vector3());
  const pointerIdRef = useRef<number | null>(null);
  const pointerCaptureTargetRef = useRef<PointerCaptureTarget | null>(null);
  const viewDirectionRef = useRef(INITIAL_HEADING.clone());
  const settledDirectionRef = useRef(INITIAL_HEADING.clone());
  const smoothedDirectionRef = useRef(INITIAL_HEADING.clone());
  const smoothedYawRef = useRef(
    Math.atan2(INITIAL_HEADING.x, INITIAL_HEADING.z),
  );
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const targetIdRef = useRef<string | undefined>("mark-a");
  // The first tutorial mark is always dead calm, so the run starts becalmed.
  const windAngleRef = useRef(0);
  const windSpeedRef = useRef(0);
  const windStrengthRef = useRef(0);
  const windDirectionRef = useRef(INITIAL_HEADING.clone());
  const [targetId, setTargetId] = useState<string | undefined>("mark-a");
  const logs = useMemo(() => [...course.logs.values()], [course]);

  const publishHud = useCallback(
    (phase = phaseRef.current) => {
      onHudChange({
        phase,
        streak: streakRef.current,
        bestStreak: bestStreakRef.current,
        level: Math.max(0, courseRef.current.cursor + 1),
        targetId: targetIdRef.current,
        windAngle: windAngleRef.current,
        windSpeed: windSpeedRef.current,
        hint: targetIdRef.current
          ? courseRef.current.byId.get(targetIdRef.current)?.hint
          : undefined,
      });
    },
    [onHudChange],
  );

  const setPhase = useCallback(
    (phase: GamePhase, elapsed = 0) => {
      phaseRef.current = phase;
      phaseStartedAtRef.current = elapsed;
      publishHud(phase);
    },
    [publishHud],
  );

  useEffect(() => {
    publishHud("idle");
  }, [publishHud]);

  const applyWindForTarget = useCallback(
    (nextTargetId: string | undefined, heading: Vector3) => {
      const wind = windForPad(
        nextTargetId ? courseRef.current.byId.get(nextTargetId) : undefined,
      );
      windAngleRef.current = wind.angle;
      windSpeedRef.current = wind.speed;
      windStrengthRef.current = wind.strength;
      windDirectionRef.current
        .copy(heading)
        // CSS rotates the HUD arrow clockwise; Three.js +Y is opposite
        // from this chase-camera view, so invert the world-space angle.
        .applyAxisAngle(WORLD_UP, MathUtils.degToRad(-wind.angle))
        .normalize();
    },
    [],
  );

  const makeShotFromPointer = useCallback(
    (clientX: number, clientY: number): Shot | null => {
      const dx = clientX - dragStartRef.current.x;
      const dy = clientY - dragStartRef.current.y;
      const dragDistance = Math.hypot(dx, dy);

      if (dragDistance <= DRAG_DEAD_ZONE || !frogRef.current) return null;

      tempDirection
        .copy(aimRightRef.current)
        .multiplyScalar(-dx)
        .addScaledVector(aimForwardRef.current, dy)
        .normalize();

      const power = powerFromDrag(dragDistance);
      const start = frogRef.current.position.clone();
      const desiredRange = jumpDistance(power);
      windOffset(
        windDirectionRef.current,
        windStrengthRef.current,
        power,
        desiredRange,
        tempWindOffset,
      );
      const launchDistance = solveLaunchDistance(
        tempDirection,
        tempWindOffset,
        desiredRange,
      );
      const launchEnd = start
        .clone()
        .addScaledVector(tempDirection, launchDistance);
      const end = launchEnd.clone().add(tempWindOffset);

      // The dock stands above the water, so a hop out to the lilies has to come
      // down. Landing height goes on launchEnd (which pointOnShot lerps toward)
      // so the descent is spread across the whole arc instead of snapping on
      // touchdown. Wind carries no Y, so t=1 still resolves to exactly this.
      const landingPad = findLandingPad(end, courseRef.current.pads);
      const landingFloatY = landingPad
        ? (floatingPadsRef.current.get(landingPad.id)?.position.y ?? 0)
        : 0;
      const landingY =
        restHeightAt(courseRef.current.pads, end.x, end.z) + landingFloatY;
      launchEnd.y = landingY;
      end.y = landingY;

      return {
        direction: tempDirection.clone(),
        power,
        start,
        launchEnd,
        wind: tempWindOffset.clone(),
        end,
        duration: MathUtils.lerp(0.62, 0.92, power),
        arcHeight: MathUtils.lerp(0.85, 1.9, power),
        elapsed: 0,
      };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (phaseRef.current !== "idle" && phaseRef.current !== "landed") return;

      event.stopPropagation();
      const pointerTarget = event.target as unknown as PointerCaptureTarget;
      pointerTarget.setPointerCapture(event.pointerId);
      pointerCaptureTargetRef.current = pointerTarget;
      pointerIdRef.current = event.pointerId;
      dragStartRef.current.set(event.clientX, event.clientY);

      // Snapshot the camera basis for the whole drag.
      camera.getWorldDirection(aimForwardRef.current);
      aimForwardRef.current.y = 0;
      aimForwardRef.current.normalize();
      aimRightRef.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
      aimRightRef.current.y = 0;
      aimRightRef.current.normalize();

      setPhase("aiming");
    },
    [camera, setPhase],
  );

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (
        phaseRef.current !== "aiming" ||
        pointerIdRef.current !== event.pointerId
      ) {
        return;
      }

      event.stopPropagation();
      if (event.clientY < dragStartRef.current.y - FORWARD_CANCEL_DISTANCE) {
        const pointerTarget = pointerCaptureTargetRef.current;
        if (pointerTarget?.hasPointerCapture(event.pointerId)) {
          pointerTarget.releasePointerCapture(event.pointerId);
        }
        pointerCaptureTargetRef.current = null;
        pointerIdRef.current = null;
        guideRef.current?.hide();
        dotsRef.current?.hide();
        previewRef.current?.hide();
        viewDirectionRef.current.copy(settledDirectionRef.current);
        setPhase("idle");
        return;
      }

      const shot = makeShotFromPointer(event.clientX, event.clientY);

      if (!shot) {
        guideRef.current?.hide();
        dotsRef.current?.hide();
        previewRef.current?.hide();
        return;
      }

      viewDirectionRef.current.copy(shot.direction);
      guideRef.current?.update(shot);

      // Training wheels — both the dotted flight path and the landing ring are
      // only offered while the frog is still on the dock. They give away where
      // the wind puts you, which is the whole skill out on the pond. Step onto
      // a lily and you read the wind yourself. The aim stick always stays.
      if (isOnDock(shot.start)) {
        dotsRef.current?.update(shot);
        previewRef.current?.update(shot, targetIdRef.current);
      } else {
        dotsRef.current?.hide();
        previewRef.current?.hide();
      }
    },
    [makeShotFromPointer, setPhase],
  );

  const finishPointer = useCallback(
    (event: ThreeEvent<PointerEvent>, cancelled: boolean) => {
      if (
        phaseRef.current !== "aiming" ||
        pointerIdRef.current !== event.pointerId
      ) {
        return;
      }

      event.stopPropagation();
      const pointerTarget = pointerCaptureTargetRef.current;
      if (pointerTarget?.hasPointerCapture(event.pointerId)) {
        pointerTarget.releasePointerCapture(event.pointerId);
      }
      pointerCaptureTargetRef.current = null;
      pointerIdRef.current = null;
      const shot = cancelled
        ? null
        : makeShotFromPointer(event.clientX, event.clientY);
      guideRef.current?.hide();
      dotsRef.current?.hide();
      previewRef.current?.hide();

      if (!shot) {
        viewDirectionRef.current.copy(settledDirectionRef.current);
        setPhase("idle");
        return;
      }

      settledDirectionRef.current.copy(shot.direction);
      viewDirectionRef.current.copy(shot.direction);
      shotRef.current = shot;

      // Shots are deterministic, so the eventual pad is already known here.
      // Build and mount the next course window while the frog is airborne;
      // doing this for the first time on touchdown caused a visible frame jolt.
      const predictedPad = findLandingPad(shot.end, courseRef.current.pads);
      if (predictedPad?.surface === "lily") {
        const preparedCourse = advanceCourse(
          courseRef.current,
          predictedPad.id,
        );
        preparedLandingRef.current = {
          course: preparedCourse,
          padId: predictedPad.id,
        };
        courseRef.current = preparedCourse;
        startTransition(() => setCourse(preparedCourse));
      } else {
        preparedLandingRef.current = null;
      }

      setPhase("shooting");
    },
    [makeShotFromPointer, setPhase],
  );

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => finishPointer(event, false),
    [finishPointer],
  );

  const handlePointerCancel = useCallback(
    (event: ThreeEvent<PointerEvent>) => finishPointer(event, true),
    [finishPointer],
  );

  useFrame((state, delta) => {
    const frog = frogRef.current;
    if (!frog) return;

    const elapsed = state.clock.elapsedTime;
    const phase = phaseRef.current;

    if (phase === "shooting" && shotRef.current) {
      const shot = shotRef.current;
      shot.elapsed += delta;
      const progress = Math.min(1, shot.elapsed / shot.duration);
      hopProgressRef.current = progress;
      pointOnShot(shot, progress, frog.position);

      // Face where the frog is actually going, not where it was aimed — with a
      // crosswind those diverge by up to ~25° by touchdown. Feeding the view
      // direction (rather than writing rotation.y) reuses the existing damping
      // and lets the camera drift into the curve too.
      velocityOnShot(shot, progress, tempVelocity);
      if (tempVelocity.lengthSq() > 1e-6) {
        viewDirectionRef.current.copy(tempVelocity).normalize();
        const drift = Math.atan2(
          shot.direction.x * tempVelocity.z - shot.direction.z * tempVelocity.x,
          shot.direction.x * tempVelocity.x + shot.direction.z * tempVelocity.z,
        );
        const windBank = MathUtils.clamp(
          drift * BANK_PER_RADIAN,
          -MAX_BANK,
          MAX_BANK,
        );
        // Crosswind builds throughout the arc, but the frog should prepare for
        // contact instead of arriving at its strongest roll. Hold the bank
        // through the apex, then smoothly level it during the descent.
        const landingLevel =
          1 - MathUtils.smoothstep(progress, BANK_LEVEL_START, BANK_LEVEL_END);
        bankRef.current = windBank * landingLevel;
      }
      pitchRef.current = climbRateOnShot(progress) * PITCH_AMOUNT;

      if (progress >= 1) {
        const landedPad = findLandingPad(shot.end, courseRef.current.pads);
        shotRef.current = null;

        if (landedPad) {
          // Preserve where the shot actually touched down. The pad decides
          // whether the landing is safe and supplies the surface height, but it
          // should not magnetise the frog to its centre.
          safePositionRef.current.set(
            shot.end.x,
            restHeightAt(courseRef.current.pads, shot.end.x, shot.end.z) +
              (floatingPadsRef.current.get(landedPad.id)?.position.y ?? 0),
            shot.end.z,
          );
          safePadIdRef.current =
            landedPad.surface === "lily" ? landedPad.id : null;
          frog.position.copy(safePositionRef.current);
          tempBurst.set(
            shot.end.x,
            padSurfaceY(landedPad) +
              (floatingPadsRef.current.get(landedPad.id)?.position.y ?? 0),
            shot.end.z,
          );
          const hitTarget = landedPad.id === targetIdRef.current;
          burstRef.current?.fire(tempBurst, hitTarget);

          streakRef.current = hitTarget ? streakRef.current + 1 : 0;
          bestStreakRef.current = Math.max(
            bestStreakRef.current,
            streakRef.current,
          );
          const preparedLanding = preparedLandingRef.current;
          const usedPreparedCourse = preparedLanding?.padId === landedPad.id;
          // Lily shots normally arrive with their next course window already
          // mounted. Keep a fallback for dock pads and any future moving pads.
          const nextCourse = usedPreparedCourse
            ? preparedLanding.course
            : advanceCourse(courseRef.current, landedPad.id);
          preparedLandingRef.current = null;
          courseRef.current = nextCourse;
          targetIdRef.current = landedPad.nextTargetId;
          startTransition(() => {
            if (!usedPreparedCourse) setCourse(nextCourse);
            setTargetId(landedPad.nextTargetId);
          });
          const nextTarget = landedPad.nextTargetId
            ? nextCourse.byId.get(landedPad.nextTargetId)
            : undefined;
          if (nextTarget) {
            settledDirectionRef.current
              .set(
                nextTarget.position[0] - safePositionRef.current.x,
                0,
                nextTarget.position[2] - safePositionRef.current.z,
              )
              .normalize();
            viewDirectionRef.current.copy(settledDirectionRef.current);
            applyWindForTarget(
              landedPad.nextTargetId,
              settledDirectionRef.current,
            );
          }
          setPhase("landed", elapsed);
        } else if (isOnDock(shot.end)) {
          preparedLandingRef.current = null;
          // Over- or undershot onto bare sand. No splash, but you don't get to
          // keep the ground you gained either — glide back to the last pad and
          // take the hop again. Standing where you landed used to leave you
          // *past* the target, having to aim backwards to recover.
          frog.position.copy(shot.end);
          frog.position.y = restHeightAt(
            courseRef.current.pads,
            shot.end.x,
            shot.end.z,
          );
          resetFromRef.current.copy(frog.position);
          tempBurst.set(shot.end.x, DOCK_SURFACE_Y, shot.end.z);
          burstRef.current?.fire(tempBurst, false);
          streakRef.current = 0;

          const activeTarget = targetIdRef.current
            ? courseRef.current.byId.get(targetIdRef.current)
            : undefined;
          if (activeTarget) {
            settledDirectionRef.current
              .set(
                activeTarget.position[0] - safePositionRef.current.x,
                0,
                activeTarget.position[2] - safePositionRef.current.z,
              )
              .normalize();
            viewDirectionRef.current.copy(settledDirectionRef.current);
          }
          setPhase("resetting", elapsed);
        } else {
          preparedLandingRef.current = null;
          resetFromRef.current.copy(frog.position);
          if (splashRef.current) {
            splashRef.current.position.set(
              frog.position.x,
              0.04,
              frog.position.z,
            );
            splashRef.current.visible = true;
            splashRef.current.scale.setScalar(0.2);
          }
          streakRef.current = 0;
          setPhase("missed", elapsed);
        }
      }
    } else if (
      phase === "landed" &&
      elapsed - phaseStartedAtRef.current > 0.28
    ) {
      setPhase("idle", elapsed);
    } else if (phase === "missed") {
      frog.position.y -= delta * 0.8;
      if (splashRef.current) {
        const splashScale = Math.min(
          1.45,
          splashRef.current.scale.x + delta * 2.6,
        );
        splashRef.current.scale.setScalar(splashScale);
      }
      if (elapsed - phaseStartedAtRef.current > 0.55) {
        const activeTarget = targetIdRef.current
          ? courseRef.current.byId.get(targetIdRef.current)
          : undefined;
        if (activeTarget) {
          settledDirectionRef.current
            .set(
              activeTarget.position[0] - safePositionRef.current.x,
              0,
              activeTarget.position[2] - safePositionRef.current.z,
            )
            .normalize();
          viewDirectionRef.current.copy(settledDirectionRef.current);
        }
        resetFromRef.current.copy(frog.position);
        setPhase("resetting", elapsed);
      }
    } else if (phase === "resetting") {
      const progress = Math.min(
        1,
        (elapsed - phaseStartedAtRef.current) / 0.48,
      );
      frog.position.lerpVectors(
        resetFromRef.current,
        safePositionRef.current,
        1 - Math.pow(1 - progress, 3),
      );
      if (progress >= 1) {
        frog.position.copy(safePositionRef.current);
        if (splashRef.current) splashRef.current.visible = false;
        setPhase("idle", elapsed);
      }
    }

    if (
      (phase === "idle" || phase === "aiming" || phase === "landed") &&
      safePadIdRef.current
    ) {
      const floatingPad = floatingPadsRef.current.get(safePadIdRef.current);
      if (floatingPad) {
        safePositionRef.current.y =
          restHeightAt(
            courseRef.current.pads,
            safePositionRef.current.x,
            safePositionRef.current.z,
          ) + floatingPad.position.y;
        frog.position.y = safePositionRef.current.y;
      }
    }

    // The jump clip carries the crouch, stretch and landing now, so the old
    // per-phase squash is gone — scaling a skinned mesh on top of its own
    // animation just fights it. A breath at rest is all that's left, since the
    // model ships no idle clip.
    const poseTime = elapsed * 2.1;
    if (phase === "idle" || phase === "aiming") {
      frog.scale.lerp(tempScale.set(1, 1 + Math.sin(poseTime) * 0.02, 1), 0.1);
    } else {
      frog.scale.lerp(tempScale.set(1, 1, 1), 0.14);
    }

    const targetYaw = Math.atan2(
      viewDirectionRef.current.x,
      viewDirectionRef.current.z,
    );
    smoothedYawRef.current = dampAngle(
      smoothedYawRef.current,
      targetYaw,
      TURN_DAMPING,
      delta,
    );
    smoothedDirectionRef.current.set(
      Math.sin(smoothedYawRef.current),
      0,
      Math.cos(smoothedYawRef.current),
    );
    frog.rotation.y = Math.atan2(
      -smoothedDirectionRef.current.x,
      -smoothedDirectionRef.current.z,
    );

    // Bank and pitch only mean anything mid-flight; everywhere else they ease
    // back to level so the frog sits flat on the pad.
    if (phase !== "shooting") {
      bankRef.current = 0;
      pitchRef.current = 0;
    }
    const settle = 1 - Math.exp(-BODY_DAMPING * delta);
    frog.rotation.z += (bankRef.current - frog.rotation.z) * settle;
    frog.rotation.x += (pitchRef.current - frog.rotation.x) * settle;

    if (windArrowRef.current) {
      const playerYaw = Math.atan2(
        smoothedDirectionRef.current.x,
        smoothedDirectionRef.current.z,
      );
      const windYaw = Math.atan2(
        windDirectionRef.current.x,
        windDirectionRef.current.z,
      );
      const relativeWindAngle = MathUtils.radToDeg(
        MathUtils.euclideanModulo(playerYaw - windYaw + Math.PI, Math.PI * 2) -
          Math.PI,
      );
      windArrowRef.current.style.transform = `rotate(${relativeWindAngle}deg)`;
    }

    const desiredFocus = tempFocus
      .copy(frog.position)
      .addScaledVector(smoothedDirectionRef.current, CAMERA_LOOK_AHEAD);
    tempCameraPosition
      .copy(frog.position)
      .addScaledVector(smoothedDirectionRef.current, -CAMERA_DISTANCE);
    tempCameraPosition.y += CAMERA_HEIGHT;
    const damping = 1 - Math.exp(-delta * 4.2);
    camera.position.lerp(tempCameraPosition, damping);
    tempLookAt.copy(desiredFocus).add(CAMERA_LOOK_OFFSET);
    camera.lookAt(tempLookAt);
  });

  return (
    <>
      <color attach="background" args={[POND_FOG_COLOR]} />
      <fog
        attach="fog"
        args={[POND_FOG_COLOR, POND_FOG_NEAR, POND_FOG_FAR]}
      />
      <ambientLight intensity={1.35} />
      <SunLight frogRef={frogRef} />

      <SimpleWater frogRef={frogRef} />
      <Dock />
      <PondFloatProvider floatingPadsRef={floatingPadsRef}>
        <FloatingLogs logs={logs} />
        <Course pads={course.pads} targetId={targetId} />
      </PondFloatProvider>
      <WindLines
        frogRef={frogRef}
        windDirectionRef={windDirectionRef}
        windSpeedRef={windSpeedRef}
      />
      <TargetRing
        floatingPadsRef={floatingPadsRef}
        pads={course.pads}
        targetId={targetId}
      />
      <LandingPreview
        ref={previewRef}
        courseRef={courseRef}
        floatingPadsRef={floatingPadsRef}
      />
      <LandingBurst ref={burstRef} />
      <AimGuide ref={guideRef} />
      <TrajectoryDots ref={dotsRef} />
      <Splash ref={splashRef} />
      <Frog
        frogRef={frogRef}
        phaseRef={phaseRef}
        progressRef={hopProgressRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
    </>
  );
}

function dampAngle(
  current: number,
  target: number,
  damping: number,
  delta: number,
) {
  const shortestDelta =
    MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) -
    Math.PI;
  return current + shortestDelta * (1 - Math.exp(-damping * delta));
}

function WindLines({
  frogRef,
  windDirectionRef,
  windSpeedRef,
}: {
  frogRef: React.RefObject<Group | null>;
  windDirectionRef: React.RefObject<Vector3>;
  windSpeedRef: React.RefObject<number>;
}) {
  const groupRef = useRef<Group>(null);
  const timeRef = useRef(0);
  const windQuaternion = useMemo(() => new Quaternion(), []);
  const material = useMemo(
    () =>
      new LineBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.62,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  const curves = useMemo(
    () =>
      // Ordered from the centre outward so stronger winds add streaks evenly
      // across the field instead of filling it from one side.
      [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -1, 1].map(
        (lateral, index) => {
          const height = (index % 3) * 0.3;
          const curve = new CubicBezierCurve3(
            new Vector3(lateral - 0.22, height, -3.4),
            new Vector3(lateral + 0.52, height + 0.2, -1.15),
            new Vector3(lateral - 0.46, height - 0.08, 1.2),
            new Vector3(lateral + 0.18, height + 0.04, 3.4),
          );
          const geometry = new BufferGeometry().setFromPoints(
            curve.getPoints(48),
          );
          geometry.setDrawRange(0, 0);
          const line = new ThreeLine(geometry, material);
          line.frustumCulled = false;
          // Render after the transparent water overlay (order 2), otherwise
          // its blend pass can intermittently wash these lines away.
          line.renderOrder = 10;

          return {
            geometry,
            line,
            pointCount: 49,
          };
        },
      ),
    [material],
  );

  useEffect(
    () => () => {
      curves.forEach(({ geometry }) => geometry.dispose());
      material.dispose();
    },
    [curves, material],
  );

  useFrame((_, delta) => {
    const group = groupRef.current;
    const frog = frogRef.current;
    if (!group || !frog) return;

    timeRef.current += delta;

    const speed = windSpeedRef.current;
    // Calm hops (the first tutorial shot) must not show drifting streaks.
    group.visible = speed > 0;
    if (!group.visible) return;

    group.position.copy(frog.position);
    group.position.y += WIND_STREAK_HEIGHT;
    windQuaternion.setFromUnitVectors(WIND_FORWARD, windDirectionRef.current);
    group.quaternion.copy(windQuaternion);
    const speedRange = Math.max(1, WIND_SPEED_SPREAD - 1);
    const speedRatio = MathUtils.clamp(
      (speed - WIND_MIN_SPEED) / speedRange,
      0,
      1,
    );
    // Density changes in symmetric odd-numbered steps: 3, 5, 7, then 9.
    const activeStreaks = 3 + Math.round(speedRatio * 3) * 2;
    // A breeze hugs the frog; strong wind occupies much more of the view.
    group.scale.x = MathUtils.lerp(1.05, 2.65, speedRatio);
    const revealRate = 0.16 + speed * 0.055;
    curves.forEach(({ geometry, pointCount }, index) => {
      const line = group.children[index];
      const visible = index < activeStreaks;
      if (line) line.visible = visible;
      if (!visible) return;

      // Redistribute phases for the active count. Previously the low-wind
      // subset occupied only the first third of the nine-line cycle, allowing
      // every visible streak to become almost empty at the same time.
      const phase =
        (timeRef.current * revealRate + index / activeStreaks) % 1;
      const head = Math.max(2, Math.floor(phase * pointCount));
      const segmentLength = Math.max(
        12,
        Math.floor(pointCount * (0.28 + speed * 0.018)),
      );
      const start = Math.max(0, head - segmentLength);
      geometry.setDrawRange(start, Math.max(2, head - start));
    });
  });

  return (
    <group ref={groupRef}>
      {curves.map(({ line }, index) => (
        <primitive key={index} object={line} />
      ))}
    </group>
  );
}

/**
 * Sun rides along with the frog. The shadow camera is a tight box around the
 * target, so leaving it at the origin would drop all shadows once the endless
 * course carried the frog out of it.
 */
function SunLight({ frogRef }: { frogRef: React.RefObject<Group | null> }) {
  const lightRef = useRef<DirectionalLight>(null);

  useFrame(() => {
    const frog = frogRef.current;
    const light = lightRef.current;
    if (!frog || !light) return;

    light.position.set(frog.position.x + 6, 12, frog.position.z + 8);
    light.target.position.set(frog.position.x, 0, frog.position.z);
    light.target.updateMatrixWorld();
  });

  return (
    <directionalLight
      ref={lightRef}
      castShadow
      position={[6, 12, 8]}
      intensity={2.1}
      shadow-bias={-0.00015}
      shadow-normalBias={0.025}
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
      shadow-camera-near={0.5}
      shadow-camera-far={34}
      shadow-camera-left={-11}
      shadow-camera-right={11}
      shadow-camera-top={11}
      shadow-camera-bottom={-13}
    />
  );
}

const PLANK_THICKNESS = 0.09;
const PLANK_PITCH = 0.5;
const PLANK_GAP = 0.06;
const DOCK_WIDTH = DOCK_BOUNDS.maxX - DOCK_BOUNDS.minX;
const DOCK_DEPTH = DOCK_BOUNDS.maxZ - DOCK_BOUNDS.minZ;
const DOCK_CENTER_X = (DOCK_BOUNDS.minX + DOCK_BOUNDS.maxX) * 0.5;
const DOCK_CENTER_Z = (DOCK_BOUNDS.minZ + DOCK_BOUNDS.maxZ) * 0.5;
const PLANK_TOPS = DOCK_SURFACE_Y - PLANK_THICKNESS * 0.5;

/**
 * Decking laid crosswise, on a frame carried by pilings sunk into the water.
 * Planks are separate meshes rather than one textured slab so the gaps between
 * them catch the light and the far edge reads as boards, not a painted box.
 */
function Dock() {
  const planks = useMemo(() => {
    const rows: { z: number; shade: string }[] = [];
    const shades = ["#b58049", "#a97540", "#bd8850", "#a06e3c"];
    const count = Math.floor(DOCK_DEPTH / PLANK_PITCH);
    const inset = (DOCK_DEPTH - count * PLANK_PITCH) * 0.5;

    for (let index = 0; index < count; index += 1) {
      rows.push({
        z: DOCK_BOUNDS.minZ + inset + (index + 0.5) * PLANK_PITCH,
        // Deterministic shuffle so the boards look reclaimed, not striped.
        shade: shades[(index * 7 + (index % 3)) % shades.length],
      });
    }

    return rows;
  }, []);

  const pilings = useMemo(() => {
    const posts: [number, number][] = [];
    for (const x of [DOCK_BOUNDS.minX + 0.5, 0, DOCK_BOUNDS.maxX - 0.5]) {
      for (const z of [
        DOCK_BOUNDS.minZ + 0.5,
        DOCK_CENTER_Z,
        DOCK_BOUNDS.maxZ - 0.5,
      ]) {
        posts.push([x, z]);
      }
    }
    return posts;
  }, []);

  return (
    <group>
      {/* Backing panel just under the boards. Without it the plank gaps show
          bright water and the deck reads as stripes rather than timber. */}
      <mesh position={[DOCK_CENTER_X, PLANK_TOPS - 0.062, DOCK_CENTER_Z]}>
        <boxGeometry args={[DOCK_WIDTH, 0.03, DOCK_DEPTH]} />
        <meshBasicMaterial color="#3d2a1b" />
      </mesh>

      {planks.map((plank) => (
        <mesh
          key={plank.z}
          receiveShadow
          position={[DOCK_CENTER_X, PLANK_TOPS, plank.z]}
        >
          <boxGeometry
            args={[DOCK_WIDTH, PLANK_THICKNESS, PLANK_PITCH - PLANK_GAP]}
          />
          <meshStandardMaterial color={plank.shade} roughness={0.92} />
        </mesh>
      ))}

      {/* Frame beams tucked just under the boards, hiding the plank ends. */}
      {[DOCK_BOUNDS.minX + 0.28, DOCK_BOUNDS.maxX - 0.28].map((x) => (
        <mesh key={x} position={[x, PLANK_TOPS - 0.1, DOCK_CENTER_Z]}>
          <boxGeometry args={[0.34, 0.22, DOCK_DEPTH]} />
          <meshStandardMaterial color="#77502a" roughness={0.94} />
        </mesh>
      ))}
      {[DOCK_BOUNDS.minZ + 0.2, DOCK_BOUNDS.maxZ - 0.2].map((z) => (
        <mesh key={z} position={[DOCK_CENTER_X, PLANK_TOPS - 0.1, z]}>
          <boxGeometry args={[DOCK_WIDTH, 0.22, 0.3]} />
          <meshStandardMaterial color="#77502a" roughness={0.94} />
        </mesh>
      ))}

      {/* Tops must finish below the boards — at deck height they punch through
          the planks and leave stubs sitting inside the painted targets. */}
      {pilings.map(([x, z]) => (
        <mesh key={`${x}:${z}`} castShadow position={[x, -0.45, z]}>
          <cylinderGeometry args={[0.17, 0.19, 1.2, 8]} />
          <meshStandardMaterial color="#5f3f22" roughness={0.95} />
        </mesh>
      ))}

      {/* Mooring posts flanking the jump-off end. */}
      {[DOCK_BOUNDS.minX + 0.9, DOCK_BOUNDS.maxX - 0.9].map((x) => (
        <group key={x} position={[x, 0, DOCK_BOUNDS.minZ + 0.45]}>
          <mesh castShadow position={[0, DOCK_SURFACE_Y + 0.3, 0]}>
            <cylinderGeometry args={[0.15, 0.17, 0.85, 9]} />
            <meshStandardMaterial color="#6b4726" roughness={0.94} />
          </mesh>
          <mesh castShadow position={[0, DOCK_SURFACE_Y + 0.74, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.1, 9]} />
            <meshStandardMaterial color="#805634" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const STICK_MATERIALS = ["#60442f", "#755039", "#513b2c"].map(
  (color) => new MeshStandardMaterial({ color, roughness: 0.98 }),
);

type FloatingBody = {
  amplitude: number;
  objectRef: React.RefObject<Mesh | null>;
  phase: number;
  seed: string;
  tilt: number;
};

type RegisterFloatingBody = (body: FloatingBody) => () => void;

const PondFloatContext = createContext<RegisterFloatingBody | null>(null);

function PondFloatProvider({
  children,
  floatingPadsRef,
}: {
  children: React.ReactNode;
  floatingPadsRef: React.RefObject<Map<string, Mesh>>;
}) {
  const bodiesRef = useRef(new Set<FloatingBody>());
  const register = useCallback<RegisterFloatingBody>(
    (body) => {
      bodiesRef.current.add(body);
      return () => {
        bodiesRef.current.delete(body);
        floatingPadsRef.current.delete(body.seed);
      };
    },
    [floatingPadsRef],
  );
  const worldPosition = useMemo(() => new Vector3(), []);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;

    for (const body of bodiesRef.current) {
      const object = body.objectRef.current;
      if (!object) continue;
      object.getWorldPosition(worldPosition);
      const waterY = sampleWaterDisplacement(
        worldPosition.x,
        worldPosition.z,
        time,
      );
      const targetY =
        waterY + Math.sin(time * 0.9 + body.phase) * body.amplitude;
      const slopeX =
        sampleWaterDisplacement(worldPosition.x + 0.2, worldPosition.z, time) -
        sampleWaterDisplacement(worldPosition.x - 0.2, worldPosition.z, time);
      const slopeZ =
        sampleWaterDisplacement(worldPosition.x, worldPosition.z + 0.2, time) -
        sampleWaterDisplacement(worldPosition.x, worldPosition.z - 0.2, time);
      const targetPitch = MathUtils.clamp(slopeZ * 1.25, -body.tilt, body.tilt);
      const targetRoll = MathUtils.clamp(-slopeX * 1.25, -body.tilt, body.tilt);
      floatingPadsRef.current.set(body.seed, object);
      // R3F scene transforms are intentionally mutated inside useFrame. These
      // refs are not React render state; replacing them would allocate every
      // frame and prevent Water Pro from retaining stable object identities.
      // eslint-disable-next-line react-hooks/immutability
      object.position.y = MathUtils.damp(object.position.y, targetY, 5, delta);
      object.rotation.x = MathUtils.damp(
        object.rotation.x,
        targetPitch,
        4,
        delta,
      );
      object.rotation.z = MathUtils.damp(
        object.rotation.z,
        targetRoll,
        4,
        delta,
      );
    }
  });

  return (
    <PondFloatContext.Provider value={register}>
      {children}
    </PondFloatContext.Provider>
  );
}

function PondFloat({
  children,
  seed,
  amplitude = 0.014,
  position,
  tilt = 0.014,
}: {
  children: React.ReactNode;
  seed: string;
  amplitude?: number;
  position?: [number, number, number];
  tilt?: number;
}) {
  const objectRef = useRef<Mesh>(null);
  const phase = (padSalt(seed) / 997) * Math.PI * 2;
  const register = useContext(PondFloatContext);
  const body = useMemo(
    () => ({
      amplitude,
      objectRef,
      phase,
      seed,
      tilt,
    }),
    [amplitude, phase, seed, tilt],
  );

  useEffect(() => register?.(body), [body, register]);

  return (
    <mesh ref={objectRef} position={position}>
      {children}
    </mesh>
  );
}

function createStickGeometry(log: LogDefinition) {
  const salt = padSalt(log.id);
  const bendA = (padNoise(salt, 0) - 0.5) * 0.34;
  const bendB = (padNoise(salt, 1) - 0.5) * 0.34;
  const endDrift = (padNoise(salt, 2) - 0.5) * 0.22;
  const mainCurve = new CubicBezierCurve3(
    new Vector3(0, 0, -log.length * 0.5),
    new Vector3(bendA, 0.025, -log.length * 0.2),
    new Vector3(bendB, -0.018, log.length * 0.22),
    new Vector3(endDrift, 0.012, log.length * 0.5),
  );
  const branchStart = mainCurve.getPoint(0.56);
  const branchSide = padNoise(salt, 3) < 0.5 ? -1 : 1;
  const branchLength = 0.3 + padNoise(salt, 4) * 0.28;
  const branchCurve = new CubicBezierCurve3(
    branchStart,
    branchStart.clone().add(new Vector3(branchSide * 0.12, 0.035, 0.04)),
    branchStart
      .clone()
      .add(new Vector3(branchSide * branchLength * 0.7, 0.06, 0.1)),
    branchStart
      .clone()
      .add(new Vector3(branchSide * branchLength, 0.045, 0.16)),
  );
  const createCap = (
    curve: CubicBezierCurve3,
    radius: number,
    t: 0 | 1,
  ) => {
    const cap = new CircleGeometry(radius, 5);
    const outwardNormal = curve.getTangent(t);
    if (t === 0) outwardNormal.negate();
    cap.applyQuaternion(
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 0, 1),
        outwardNormal,
      ),
    );
    const endpoint = curve.getPoint(t);
    cap.translate(endpoint.x, endpoint.y, endpoint.z);
    return cap;
  };

  const parts = [
    new TubeGeometry(mainCurve, 9, 0.052, 5, false),
    new TubeGeometry(branchCurve, 5, 0.025, 5, false),
    createCap(mainCurve, 0.052, 0),
    createCap(mainCurve, 0.052, 1),
    createCap(branchCurve, 0.025, 1),
  ];
  const geometry = mergeGeometries(parts, false) ?? new BufferGeometry();
  parts.forEach((part) => part.dispose());
  return geometry;
}

/** Thin seeded pond debris: one crooked stick and a small side twig. */
const FloatingStick = memo(function FloatingStick({
  log,
}: {
  log: LogDefinition;
}) {
  const geometry = useMemo(() => createStickGeometry(log), [log]);
  const material = STICK_MATERIALS[padSalt(log.id) % STICK_MATERIALS.length];

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group
      position={log.position}
      rotation={[0, log.rotation, 0]}
      dispose={null}
    >
      <PondFloat seed={log.id} amplitude={0.035} tilt={0.045}>
        <mesh receiveShadow geometry={geometry} material={material} />
      </PondFloat>
    </group>
  );
});

/**
 * Logs are generated with the pads and collision-checked against them. They
 * used to be four fixed positions near the origin, which was fine for a fixed
 * course but meant randomly generated pads could spawn straight through one.
 */
const FloatingLogs = memo(function FloatingLogs({
  logs,
}: {
  logs: LogDefinition[];
}) {
  return (
    <group>
      {logs.map((log) => (
        <FloatingStick key={log.id} log={log} />
      ))}
    </group>
  );
});

/** Stable per-pad jitter. Array position can't be used — pads are culled. */
function padSalt(id: string) {
  let sum = 0;
  for (let index = 0; index < id.length; index += 1) {
    sum = (sum + id.charCodeAt(index) * (index + 1)) % 997;
  }
  return sum;
}

const Course = memo(function Course({
  pads,
  targetId,
}: {
  pads: PadDefinition[];
  targetId?: string;
}) {
  return (
    <group>
      {pads.map((pad) =>
        pad.surface === "dock" ? (
          <DockPad key={pad.id} pad={pad} isTarget={pad.id === targetId} />
        ) : (
          <LilyPad key={pad.id} pad={pad} isTarget={pad.id === targetId} />
        ),
      )}
      {pads
        .filter((pad) => pad.flower && pad.flowerOffset)
        .map((pad) => {
          const flowerOffset = pad.flowerOffset as [number, number];
          return (
            <WaterLily
              key={`${pad.id}-flower`}
              id={pad.id}
              variant={pad.flower as NonNullable<PadDefinition["flower"]>}
              position={[
                pad.position[0] + flowerOffset[0],
                0,
                pad.position[2] + flowerOffset[1],
              ]}
            />
          );
        })}
    </group>
  );
});

/**
 * Tutorial target painted onto the decking — concentric rings, like a deck
 * game. Flat overlays rather than geometry so the plank gaps still read
 * through the edges of the circle.
 */
const DockPad = memo(function DockPad({
  pad,
  isTarget,
}: {
  pad: PadDefinition;
  isTarget: boolean;
}) {
  // The starting pad is gameplay-only. Painting it left a large pale circle
  // around the frog that read as an artificial contact shadow.
  if (pad.id === "dock-start") return null;

  const paint = isTarget ? "#fdf6e2" : "#d9c49a";

  return (
    <group
      position={[pad.position[0], DOCK_SURFACE_Y + 0.004, pad.position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <mesh>
        <circleGeometry args={[pad.radius, 40]} />
        <meshBasicMaterial
          color={paint}
          transparent
          opacity={isTarget ? 0.5 : 0.2}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <ringGeometry args={[pad.radius * 0.88, pad.radius, 40]} />
        <meshBasicMaterial
          color={paint}
          transparent
          opacity={isTarget ? 0.95 : 0.62}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <ringGeometry args={[pad.radius * 0.3, pad.radius * 0.38, 32]} />
        <meshBasicMaterial
          color={paint}
          transparent
          opacity={isTarget ? 0.8 : 0.45}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});

/**
 * Half-section of a pad, revolved into the dish shape real lily pads have: a
 * flat floor that turns up into a raised wall at the rim. Heights hang off
 * `LILY_SURFACE_Y` so the *floor* — what the frog stands on and what
 * `surfaceHeightAt` reports — can't drift away from the rest of the game.
 *
 * Runs centre-underside → out → up the outer face → over the lip → down inside
 * the wall → across the floor → centre. Both ends sit on the axis, so the
 * revolve closes into a solid.
 */
const LILY_PROFILE = [
  [0.0, -0.05], // centre underside
  [0.5, -0.055],
  [0.86, -0.045],
  [0.95, -0.02],
  [1.0, 0.03], // outer face of the wall, turning up
  [1.0, 0.078],
  [0.985, 0.096], // rolled top lip
  [0.945, 0.09],
  [0.925, 0.05], // inner face coming back down
  // The floor is dead flat at exactly LILY_SURFACE_Y. Letting it dish or rise
  // even a few millimetres puts it within z-fighting range of the frog's drop
  // shadow and the landing markers, which all sit just above that height.
  [0.9, 0.0],
  [0.55, 0.0],
  [0.0, 0.0],
].map(([radius, rise]) => new Vector2(radius, LILY_SURFACE_Y + rise));

/**
 * One unit-radius geometry shared by every lily; pads scale it on X/Z only, so
 * thickness and wall height stay constant across pad sizes and the pond never
 * holds more than a single lily geometry.
 */
const LILY_GEOMETRY = new LatheGeometry(LILY_PROFILE, 40);
/** Decorative pads around flowers read as thin floating leaves, not bowls. */
const SATELLITE_LILY_HEIGHT_SCALE = 0.32;
/** Y compensation keeps their floor at the same waterline after flattening. */
const SATELLITE_LILY_Y_OFFSET =
  LILY_SURFACE_Y * (1 - SATELLITE_LILY_HEIGHT_SCALE);

/** Veins radiate from the centre, stopping short of the wall. */
const LILY_VEINS = Array.from({ length: 10 }, (_, index) => ({
  angle: (index / 10) * Math.PI * 2,
  reach: 1.0 + (index % 3) * 0.05,
}));
const LILY_VEIN_GEOMETRY = new BoxGeometry(0.66, 0.004, 0.022);

// Shared at module scope: pads re-render every hop, and inline JSX materials
// would mint ~130 of them each time (six veins on each of ~19 live pads).
// Extrude splits caps (index 0) from the bevelled rim (1), so the edge reads
// darker than the face without needing a second mesh.
const lilyMaterial = (color: string) =>
  new MeshStandardMaterial({ color, roughness: 0.78 });
const LILY_MATERIAL = lilyMaterial("#43904a");
const LILY_MATERIAL_TARGET = lilyMaterial("#7ede55");
const LILY_MATERIAL_SATELLITE = lilyMaterial("#397d43");
const LILY_ROOT_MATERIAL = new MeshStandardMaterial({
  color: "#4c6937",
  roughness: 0.96,
});
function createWaterLilyPetalGeometry() {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const lengthSegments = 10;
  const widthSegments = 6;
  const columns = widthSegments + 1;

  for (let row = 0; row <= lengthSegments; row += 1) {
    const along = row / lengthSegments;
    // Broad through the lower-middle and smoothly tapered to a pointed tip.
    const halfWidth =
      0.04 * (1 - along) +
      0.15 * Math.pow(Math.sin(Math.PI * along), 0.78) +
      0.006 * along;
    const length = along * 0.54;
    const lift = 0.14 * along * along + Math.sin(Math.PI * along) * 0.018;

    for (let column = 0; column <= widthSegments; column += 1) {
      const across = (column / widthSegments) * 2 - 1;
      // A shallow continuous bowl replaces the old single raised center row.
      // Shared vertices and computed normals now interpolate cleanly across it.
      const edgeCup =
        across * across * Math.sin(Math.PI * along) * 0.018;
      positions.push(across * halfWidth, lift + edgeCup, length);
    }
  }

  for (let row = 0; row < lengthSegments; row += 1) {
    for (let column = 0; column < widthSegments; column += 1) {
      const nearLeft = row * columns + column;
      const farLeft = nearLeft + columns;
      const nearRight = nearLeft + 1;
      const farRight = farLeft + 1;
      indices.push(
        nearLeft,
        farLeft,
        nearRight,
        nearRight,
        farLeft,
        farRight,
      );
    }
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const FLOWER_PETAL_GEOMETRY = createWaterLilyPetalGeometry();
const FLOWER_STAMEN_GEOMETRY = new CylinderGeometry(0.012, 0.019, 0.105, 5);
const FLOWER_CENTER_GEOMETRY = new SphereGeometry(0.11, 12, 8);
const FLOWER_SEPAL_MATERIAL = new MeshStandardMaterial({
  color: "#729547",
  roughness: 0.82,
  side: DoubleSide,
});
const FLOWER_PETAL_WHITE_MATERIAL = new MeshStandardMaterial({
  color: "#fffdf2",
  roughness: 0.6,
  side: DoubleSide,
});
const FLOWER_PETAL_PINK_MATERIAL = new MeshStandardMaterial({
  color: "#ffb4ce",
  roughness: 0.62,
  side: DoubleSide,
});
const FLOWER_CENTER_MATERIAL = new MeshStandardMaterial({
  color: "#e99a16",
  roughness: 0.66,
});
const FLOWER_STAMEN_MATERIAL = new MeshStandardMaterial({
  color: "#ffd83d",
  roughness: 0.58,
});

const lilyVeinMaterial = (color: string, opacity: number) =>
  new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
const LILY_VEIN_MATERIAL = lilyVeinMaterial("#5aa85e", 0.26);
const LILY_VEIN_MATERIAL_TARGET = lilyVeinMaterial("#c6ff92", 0.4);

type SatellitePadVisual = {
  x: number;
  z: number;
  radius: number;
  spin: number;
};

type LilyRootVisual = {
  geometry: BufferGeometry;
  satellites: SatellitePadVisual[];
};

// TubeGeometry ends with a flat cap. Burying that cap below the opaque sand
// lets the visible root disappear naturally into the pond floor.
const ROOT_BURY_Y = POND_FLOOR_Y - 0.12;

function padNoise(salt: number, channel: number) {
  const value = Math.sin((salt + 1) * 12.9898 + (channel + 1) * 78.233);
  return value * 43758.5453 - Math.floor(value * 43758.5453);
}

function createLilyRootGeometry(pad: PadDefinition) {
  const salt = padSalt(pad.id);
  const anchor = new Vector3(
    (padNoise(salt, 0) - 0.5) * 0.42,
    ROOT_BURY_Y,
    (padNoise(salt, 1) - 0.5) * 0.42,
  );
  const mainRoot = new CubicBezierCurve3(
      // Sink the attachment far enough into the pad that the tube cannot
      // break through its top as the pad rocks on the water.
      new Vector3(0, LILY_SURFACE_Y - 0.09, 0),
    new Vector3(
      (padNoise(salt, 2) - 0.5) * 0.62,
      -0.24,
      (padNoise(salt, 3) - 0.5) * 0.62,
    ),
    new Vector3(anchor.x * -0.45, POND_FLOOR_Y * 0.68, anchor.z * -0.45),
    anchor,
  );
  return new TubeGeometry(mainRoot, 10, 0.052, 5, false);
}

function createFlowerRootVisual(id: string): LilyRootVisual {
  const salt = padSalt(`${id}-flower`);
  const anchor = new Vector3(
    (padNoise(salt, 0) - 0.5) * 0.32,
    ROOT_BURY_Y,
    (padNoise(salt, 1) - 0.5) * 0.32,
  );
  const rootParts: TubeGeometry[] = [];
  const flowerRoot = new CubicBezierCurve3(
    new Vector3(0, -0.065, 0),
    new Vector3(
      (padNoise(salt, 2) - 0.5) * 0.38,
      -0.32,
      (padNoise(salt, 3) - 0.5) * 0.38,
    ),
    new Vector3(anchor.x * -0.35, POND_FLOOR_Y * 0.72, anchor.z * -0.35),
    anchor,
  );
  rootParts.push(new TubeGeometry(flowerRoot, 10, 0.043, 5, false));

  const satelliteCount = 3 + (salt % 2);
  const satellitePhase = padNoise(salt, 4) * Math.PI * 2;
  const satellites = Array.from({ length: satelliteCount }, (_, index) => {
    const angle =
      satellitePhase +
      (index / satelliteCount) * Math.PI * 2 +
      (padNoise(salt, index + 5) - 0.5) * 0.18;
    const radius = 0.17 + padNoise(salt, index + 8) * 0.09;
    // Radial placement uses the visible radii plus an explicit gap, so these
    // leaves cannot touch either the flower base or one another.
    const distance =
      FLOWER_BASE_RADIUS +
      radius +
      FLOWER_SATELLITE_GAP +
      padNoise(salt, index + 12) * 0.08;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const joinBias = 0.18 + padNoise(salt, index + 16) * 0.16;
    const root = new CubicBezierCurve3(
      // Keep the narrow satellite root hidden inside the pad underside.
      new Vector3(x, LILY_SURFACE_Y - 0.06, z),
      new Vector3(x * 0.82, -0.14 - joinBias, z * 0.82),
      new Vector3(
        anchor.x + Math.cos(angle + 0.9) * 0.24,
        POND_FLOOR_Y * 0.66,
        anchor.z + Math.sin(angle + 0.9) * 0.24,
      ),
      anchor,
    );
    rootParts.push(new TubeGeometry(root, 9, 0.028, 5, false));

    return {
      x,
      z,
      radius,
      spin: padNoise(salt, index + 20) * Math.PI * 2,
    };
  });

  const geometry = mergeGeometries(rootParts, false) ?? new BufferGeometry();
  rootParts.forEach((part) => part.dispose());
  return { geometry, satellites };
}

const LilyPad = memo(function LilyPad({
  pad,
  isTarget,
}: {
  pad: PadDefinition;
  isTarget: boolean;
}) {
  // Stable per-pad rib alignment — pads are culled, so array index can't be used.
  const spin = (padSalt(pad.id) / 997) * Math.PI * 2;
  const veinRef = useRef<InstancedMesh>(null);
  const rootGeometry = useMemo(() => createLilyRootGeometry(pad), [pad]);

  useEffect(() => {
    const mesh = veinRef.current;
    if (!mesh) return;

    const dummy = new Object3D();
    LILY_VEINS.forEach(({ angle, reach }, index) => {
      dummy.position.set(
        Math.cos(angle) * 0.45 * reach,
        LILY_SURFACE_Y + 0.004,
        Math.sin(angle) * 0.45 * reach,
      );
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(reach, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);

  useEffect(
    () => () => {
      rootGeometry.dispose();
    },
    [rootGeometry],
  );

  return (
    <group dispose={null}>
      <mesh
        geometry={rootGeometry}
        material={LILY_ROOT_MATERIAL}
        position={[pad.position[0], 0, pad.position[2]]}
      />

      <PondFloat
        seed={pad.id}
        position={[pad.position[0], 0, pad.position[2]]}
        amplitude={0.003}
        tilt={0.035}
      >
        <group rotation={[0, spin, 0]} scale={[pad.radius, 1, pad.radius]}>
          <mesh
            geometry={LILY_GEOMETRY}
            material={isTarget ? LILY_MATERIAL_TARGET : LILY_MATERIAL}
            receiveShadow
            castShadow
          />

          <instancedMesh
            ref={veinRef}
            args={[LILY_VEIN_GEOMETRY, LILY_VEIN_MATERIAL, LILY_VEINS.length]}
            material={isTarget ? LILY_VEIN_MATERIAL_TARGET : LILY_VEIN_MATERIAL}
          />
        </group>
      </PondFloat>
    </group>
  );
});

const WaterLily = memo(
  function WaterLily({
    id,
    variant,
    position,
  }: {
    id: string;
    variant: NonNullable<PadDefinition["flower"]>;
    position: [number, number, number];
  }) {
    const scale = 0.92;
    const satelliteRef = useRef<InstancedMesh>(null);
    const petalRef = useRef<InstancedMesh>(null);
    const sepalRef = useRef<InstancedMesh>(null);
    const stamenRef = useRef<InstancedMesh>(null);
    const rootVisual = useMemo(() => createFlowerRootVisual(id), [id]);

    useEffect(() => {
      const mesh = satelliteRef.current;
      if (!mesh) return;

      const dummy = new Object3D();
      rootVisual.satellites.forEach((satellite, index) => {
        dummy.position.set(
          satellite.x,
          SATELLITE_LILY_Y_OFFSET,
          satellite.z,
        );
        dummy.rotation.set(0, satellite.spin, 0);
        // Flatten around the geometry origin, then compensate above so the
        // floor remains at LILY_SURFACE_Y and roots stay below the top face.
        dummy.scale.set(
          satellite.radius,
          SATELLITE_LILY_HEIGHT_SCALE,
          satellite.radius,
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();

      const petals = petalRef.current;
      const sepals = sepalRef.current;
      const stamens = stamenRef.current;
      if (!petals || !sepals || !stamens) return;

      let petalIndex = 0;
      const petalRings = [
        { count: 12, radius: 0.055, scale: 1, lift: 0, cup: 0 },
        { count: 9, radius: 0.035, scale: 0.76, lift: 0.065, cup: -0.3 },
        { count: 7, radius: 0.018, scale: 0.54, lift: 0.115, cup: -0.58 },
      ];
      petalRings.forEach((ring, ringIndex) => {
        for (let index = 0; index < ring.count; index += 1) {
          const angle =
            (index / ring.count) * Math.PI * 2 +
            (ringIndex % 2) * (Math.PI / ring.count);
          dummy.position.set(
            Math.sin(angle) * ring.radius,
            ring.lift,
            Math.cos(angle) * ring.radius,
          );
          dummy.rotation.set(ring.cup, angle, 0, "YXZ");
          dummy.scale.setScalar(ring.scale);
          dummy.updateMatrix();
          petals.setMatrixAt(petalIndex, dummy.matrix);
          petalIndex += 1;
        }
      });
      petals.instanceMatrix.needsUpdate = true;
      petals.computeBoundingSphere();

      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
        dummy.position.set(Math.sin(angle) * 0.035, -0.018, Math.cos(angle) * 0.035);
        dummy.rotation.set(0.05, angle, 0, "YXZ");
        dummy.scale.setScalar(1.04);
        dummy.updateMatrix();
        sepals.setMatrixAt(index, dummy.matrix);
      }
      sepals.instanceMatrix.needsUpdate = true;
      sepals.computeBoundingSphere();

      for (let index = 0; index < 18; index += 1) {
        const ring = index < 7 ? 0 : 1;
        const ringIndex = ring === 0 ? index : index - 7;
        const count = ring === 0 ? 7 : 11;
        const angle = (ringIndex / count) * Math.PI * 2 + ring * 0.22;
        const radius = ring === 0 ? 0.055 : 0.105;
        dummy.position.set(
          Math.sin(angle) * radius,
          0.17 + (index % 3) * 0.012,
          Math.cos(angle) * radius,
        );
        dummy.rotation.set(0, angle, (ringIndex % 2 ? -1 : 1) * 0.12);
        dummy.scale.setScalar(ring === 0 ? 0.9 : 1);
        dummy.updateMatrix();
        stamens.setMatrixAt(index, dummy.matrix);
      }
      stamens.instanceMatrix.needsUpdate = true;
      stamens.computeBoundingSphere();
    }, [rootVisual]);

    useEffect(
      () => () => {
        rootVisual.geometry.dispose();
      },
      [rootVisual],
    );

    return (
      <group position={position} dispose={null}>
        <mesh geometry={rootVisual.geometry} material={LILY_ROOT_MATERIAL} />
        <PondFloat seed={`${id}-flower`} amplitude={0.012} tilt={0.012}>
          <instancedMesh
            ref={satelliteRef}
            args={[
              LILY_GEOMETRY,
              LILY_MATERIAL_SATELLITE,
              rootVisual.satellites.length,
            ]}
            receiveShadow
          />

          {/* Water-lily flowers sit directly on the surface; only their roots
              continue below the water. Layered pointed petals replace the old
              exposed stem and six oval placeholder petals. */}
          <group position={[0, LILY_SURFACE_Y + 0.025, 0]} scale={scale}>
            <instancedMesh
              ref={sepalRef}
              args={[FLOWER_PETAL_GEOMETRY, FLOWER_SEPAL_MATERIAL, 8]}
              castShadow
              receiveShadow
            />
            <instancedMesh
              ref={petalRef}
              args={[
                FLOWER_PETAL_GEOMETRY,
                variant === "white"
                  ? FLOWER_PETAL_WHITE_MATERIAL
                  : FLOWER_PETAL_PINK_MATERIAL,
                28,
              ]}
              castShadow
              receiveShadow
            />
            <group position={[0, 0.015, 0]}>
              <instancedMesh
                ref={stamenRef}
                args={[FLOWER_STAMEN_GEOMETRY, FLOWER_STAMEN_MATERIAL, 18]}
                castShadow
              />
              <mesh
                geometry={FLOWER_CENTER_GEOMETRY}
                material={FLOWER_CENTER_MATERIAL}
                position={[0, 0.12, 0]}
                scale={[1, 0.32, 1]}
              />
            </group>
          </group>
        </PondFloat>
      </group>
    );
  },
  (previous, next) =>
    previous.id === next.id && previous.variant === next.variant,
);

function TargetRing({
  floatingPadsRef,
  pads,
  targetId,
}: {
  floatingPadsRef: React.RefObject<Map<string, Mesh>>;
  pads: PadDefinition[];
  targetId?: string;
}) {
  const ringRef = useRef<Mesh>(null);
  const target = targetId ? pads.find((pad) => pad.id === targetId) : undefined;

  useFrame((state) => {
    if (!ringRef.current || !target) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.08;
    ringRef.current.scale.setScalar(pulse);
    ringRef.current.rotation.z += 0.004;
    ringRef.current.position.y =
      ringHeightForPad(target) +
      (floatingPadsRef.current.get(target.id)?.position.y ?? 0);
  });

  if (!target) return null;

  return (
    <mesh
      ref={ringRef}
      // All gameplay rings share the same clearance above their own surface.
      position={[
        target.position[0],
        ringHeightForPad(target),
        target.position[2],
      ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <torusGeometry args={[target.radius + 0.16, 0.055, 8, 48]} />
      <meshBasicMaterial color="#eaff74" />
    </mesh>
  );
}

const Frog = memo(function Frog({
  frogRef,
  phaseRef,
  progressRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: FrogProps) {
  const hoveredRef = useRef(false);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
    };
  }, []);

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (phaseRef.current !== "idle" && phaseRef.current !== "landed") return;
      event.stopPropagation();
      hoveredRef.current = true;
      document.body.style.cursor = "grab";
    },
    [phaseRef],
  );

  const handlePointerOut = useCallback(() => {
    hoveredRef.current = false;
    document.body.style.cursor =
      phaseRef.current === "aiming" ? "grabbing" : "";
  }, [phaseRef]);

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (phaseRef.current !== "idle" && phaseRef.current !== "landed") return;
      document.body.style.cursor = "grabbing";
      onPointerDown(event);
    },
    [onPointerDown, phaseRef],
  );

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      onPointerMove(event);
      // Pulling forward cancels aim in the parent handler. Reflect that
      // immediately so capture release cannot leave a stale grabbing cursor.
      if (phaseRef.current !== "aiming") {
        document.body.style.cursor = hoveredRef.current ? "grab" : "";
      }
    },
    [onPointerMove, phaseRef],
  );

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      onPointerUp(event);
      const canAimAgain =
        phaseRef.current === "idle" || phaseRef.current === "landed";
      document.body.style.cursor =
        canAimAgain && hoveredRef.current ? "grab" : "";
    },
    [onPointerUp, phaseRef],
  );

  const handlePointerCancel = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      hoveredRef.current = false;
      document.body.style.cursor = "";
      onPointerCancel(event);
    },
    [onPointerCancel],
  );

  return (
    // YXZ, not the default XYZ: yaw has to be the outermost rotation so pitch
    // and roll act on the frog's own axes. Under XYZ, rotation.x is applied
    // about *world* X, so as soon as the frog's heading turned away from -Z its
    // pitch bled into roll.
    <group ref={frogRef} position={DOCK_START_POSITION} rotation-order="YXZ">
      {/* Deliberately larger than the frog and kept outside <Suspense>: all the
          drag input hangs off it, so it must exist from the first frame and must
          not depend on the model having loaded. */}
      <mesh
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        position={[0, 0.45, 0]}
      >
        <sphereGeometry args={[0.92, 16, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <FrogInteractionRing phaseRef={phaseRef} hoveredRef={hoveredRef} />

      <Suspense fallback={null}>
        <FrogModel phaseRef={phaseRef} progressRef={progressRef} />
      </Suspense>
    </group>
  );
});

type FrogInteractionRingProps = {
  phaseRef: React.RefObject<GamePhase>;
  hoveredRef: React.RefObject<boolean>;
};

const FrogInteractionRing = memo(function FrogInteractionRing({
  phaseRef,
  hoveredRef,
}: FrogInteractionRingProps) {
  const groupRef = useRef<Group>(null);
  const hoverMaterialRef = useRef<MeshBasicMaterial>(null);
  const aimMaterialRef = useRef<MeshBasicMaterial>(null);
  const accentMaterialRefs = useRef<Array<MeshBasicMaterial | null>>([]);
  const aimRingRef = useRef<Mesh>(null);
  const accentsRef = useRef<Group>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
    const aiming = phaseRef.current === "aiming";
    const hovered =
      hoveredRef.current &&
      (phaseRef.current === "idle" || phaseRef.current === "landed");
    const visible = aiming || hovered;
    const fade = 1 - Math.exp(-delta * 16);

    if (groupRef.current) {
      const targetScale = visible ? 1 : 0.82;
      groupRef.current.visible =
        visible || (hoverMaterialRef.current?.opacity ?? 0) > 0.01;
      groupRef.current.scale.lerp(
        tempScale.set(targetScale, targetScale, targetScale),
        fade,
      );
    }
    if (hoverMaterialRef.current) {
      const targetOpacity = hovered && !aiming ? 0.72 : 0;
      hoverMaterialRef.current.opacity +=
        (targetOpacity - hoverMaterialRef.current.opacity) * fade;
    }
    if (aimMaterialRef.current) {
      const targetOpacity = aiming ? 0.92 : 0;
      aimMaterialRef.current.opacity +=
        (targetOpacity - aimMaterialRef.current.opacity) * fade;
    }
    const targetAccentOpacity = aiming ? 0.72 : 0;
    for (const material of accentMaterialRefs.current) {
      if (material) {
        material.opacity += (targetAccentOpacity - material.opacity) * fade;
      }
    }
    if (aimRingRef.current) {
      const pulse = aiming ? 1 + Math.sin(timeRef.current * 6) * 0.035 : 1;
      aimRingRef.current.scale.setScalar(pulse);
    }
    if (accentsRef.current && aiming) {
      accentsRef.current.rotation.z += delta * 0.8;
    }
  });

  return (
    <group
      ref={groupRef}
      visible={false}
      position={[
        0,
        GROUND_RING_SURFACE_OFFSET - FROG_FOOT_CLEARANCE,
        0,
      ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <mesh>
        <torusGeometry args={[0.76, 0.014, 6, 64]} />
        <meshBasicMaterial
          ref={hoverMaterialRef}
          color="#efffb2"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={aimRingRef}>
        <torusGeometry args={[0.79, 0.042, 8, 64]} />
        <meshBasicMaterial
          ref={aimMaterialRef}
          color="#dfff69"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <group ref={accentsRef}>
        {[0, 1, 2, 3].map((quarter) => (
          <mesh key={quarter} rotation={[0, 0, quarter * (Math.PI / 2)]}>
            <torusGeometry args={[0.98, 0.018, 6, 12, Math.PI * 0.28]} />
            <meshBasicMaterial
              ref={(material) => {
                accentMaterialRefs.current[quarter] = material;
              }}
              color="#f3ffae"
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
});

const AimGuide = forwardRef<AimGuideHandle>(function AimGuide(_, ref) {
  const groupRef = useRef<Group>(null);
  const barRef = useRef<Mesh>(null);
  const knobRef = useRef<Mesh>(null);
  const guideMaterial = useMemo(
    () => new MeshBasicMaterial({ color: "#69e36f" }),
    [],
  );
  const guideColor = useMemo(() => new Color(), []);
  const quaternion = useMemo(() => new Quaternion(), []);

  useEffect(
    () => () => {
      guideMaterial.dispose();
    },
    [guideMaterial],
  );

  useImperativeHandle(
    ref,
    () => ({
      hide() {
        if (groupRef.current) groupRef.current.visible = false;
      },
      update(shot) {
        const group = groupRef.current;
        const bar = barRef.current;
        const knob = knobRef.current;
        if (!group || !bar || !knob) return;

        group.visible = true;
        powerColor(shot.power, guideColor);
        guideMaterial.color.copy(guideColor);

        const barLength = 0.45 + shot.power * 1.65;
        const frogClearance = 0.52;
        tempDirection.copy(shot.direction).negate();
        bar.position
          .copy(shot.start)
          .addScaledVector(tempDirection, frogClearance + barLength * 0.5);
        bar.position.y += 0.09;
        quaternion.setFromUnitVectors(UNIT_Y, tempDirection);
        bar.quaternion.copy(quaternion);
        bar.scale.set(1, barLength, 1);
        knob.position
          .copy(shot.start)
          .addScaledVector(tempDirection, frogClearance + barLength);
        knob.position.y += 0.09;
        knob.scale.setScalar(0.75 + shot.power * 0.5);
      },
    }),
    [guideColor, guideMaterial, quaternion],
  );

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={barRef}>
        <cylinderGeometry args={[0.052, 0.052, 1, 10]} />
        <primitive object={guideMaterial} attach="material" />
      </mesh>
      <mesh ref={knobRef}>
        <sphereGeometry args={[0.105, 12, 8]} />
        <primitive object={guideMaterial} attach="material" />
      </mesh>
    </group>
  );
});

const BURST_ON_TARGET = new Color("#b6ff86");
const BURST_OFF_TARGET = new Color("#ffe08a");
const BURST_DURATION = 0.5;

type LandingBurstHandle = {
  fire: (position: Vector3, onTarget: boolean) => void;
};

/** Confirmation pop where the frog actually touched down. */
const LandingBurst = forwardRef<LandingBurstHandle>(
  function LandingBurst(_, ref) {
    const groupRef = useRef<Group>(null);
    const meshRef = useRef<Mesh>(null);
    const progressRef = useRef(1);

    useImperativeHandle(ref, () => ({
      fire(position, onTarget) {
        const group = groupRef.current;
        const mesh = meshRef.current;
        if (!group || !mesh) return;

        group.position.set(position.x, position.y + 0.02, position.z);
        group.visible = true;
        (mesh.material as MeshBasicMaterial).color.copy(
          onTarget ? BURST_ON_TARGET : BURST_OFF_TARGET,
        );
        progressRef.current = 0;
      },
    }));

    useFrame((_, delta) => {
      const group = groupRef.current;
      const mesh = meshRef.current;
      if (!group?.visible || !mesh) return;

      progressRef.current += delta / BURST_DURATION;
      if (progressRef.current >= 1) {
        group.visible = false;
        return;
      }

      const t = progressRef.current;
      group.scale.setScalar(0.45 + t * 1.5);
      (mesh.material as MeshBasicMaterial).opacity = (1 - t) * 0.85;
    });

    return (
      <group ref={groupRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh ref={meshRef}>
          <ringGeometry args={[0.5, 0.66, 32]} />
          <meshBasicMaterial
            color={BURST_ON_TARGET}
            transparent
            depthWrite={false}
          />
        </mesh>
      </group>
    );
  },
);

const TRAJECTORY_DOTS = 16;

/**
 * Dotted trail along the shot's real flight path, sampled straight from
 * `pointOnShot` — so it shows the wind bend and the arc height, not just the
 * aim line. One InstancedMesh, repositioned imperatively while dragging.
 */
const TrajectoryDots = forwardRef<TrajectoryDotsHandle>(
  function TrajectoryDots(_, ref) {
    const meshRef = useRef<InstancedMesh>(null);
    const dummy = useMemo(() => new Object3D(), []);
    const dotColor = useMemo(() => new Color(), []);

    useImperativeHandle(
      ref,
      () => ({
        hide() {
          if (meshRef.current) meshRef.current.visible = false;
        },
        update(shot) {
          const mesh = meshRef.current;
          if (!mesh) return;

          powerColor(shot.power, dotColor);
          (mesh.material as MeshBasicMaterial).color.copy(dotColor);

          for (let index = 0; index < TRAJECTORY_DOTS; index += 1) {
            // Skip t=0 (inside the frog) and t=1 (the landing marker's job).
            const t = (index + 1) / (TRAJECTORY_DOTS + 1);
            pointOnShot(shot, t, tempDot);
            dummy.position.copy(tempDot);
            // Grow along the path so the far end reads as the business end.
            dummy.scale.setScalar(0.038 + t * 0.042);
            dummy.updateMatrix();
            mesh.setMatrixAt(index, dummy.matrix);
          }

          mesh.instanceMatrix.needsUpdate = true;
          mesh.visible = true;
        },
      }),
      [dotColor, dummy],
    );

    return (
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, TRAJECTORY_DOTS]}
        visible={false}
        // Instance matrices are set by hand, so the bounding sphere is wrong.
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial transparent opacity={0.9} depthWrite={false} />
      </instancedMesh>
    );
  },
);

const PREVIEW_ON_TARGET = new Color("#8dff7a");
const PREVIEW_SAFE = new Color("#ffd66b");
const PREVIEW_WATER = new Color("#ff6b62");

/**
 * Tutorial helper: a ghost ring dropped where the current shot would land.
 * Green on the target, amber for a safe-but-wrong landing, red for water.
 * Only shown while the frog is standing on the beach.
 */
const LandingPreview = forwardRef<
  LandingPreviewHandle,
  {
    courseRef: React.RefObject<Course>;
    floatingPadsRef: React.RefObject<Map<string, Mesh>>;
  }
>(function LandingPreview({ courseRef, floatingPadsRef }, ref) {
  const groupRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: PREVIEW_SAFE,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    if (!groupRef.current?.visible || !ringRef.current) return;
    ringRef.current.scale.setScalar(
      1 + Math.sin(state.clock.elapsedTime * 6) * 0.07,
    );
  });

  useImperativeHandle(
    ref,
    () => ({
      hide() {
        if (groupRef.current) groupRef.current.visible = false;
      },
      update(shot, targetId) {
        const group = groupRef.current;
        if (!group) return;

        const pad = findLandingPad(shot.end, courseRef.current.pads);
        const onDock = isOnDock(shot.end);

        material.color.copy(
          pad && pad.id === targetId
            ? PREVIEW_ON_TARGET
            : pad || onDock
              ? PREVIEW_SAFE
              : PREVIEW_WATER,
        );
        group.position.set(
          shot.end.x,
          pad
            ? ringHeightForPad(pad) +
              (floatingPadsRef.current.get(pad.id)?.position.y ?? 0)
            : onDock
              ? DOCK_SURFACE_Y + GROUND_RING_SURFACE_OFFSET
              : WATER_SURFACE_Y + GROUND_RING_SURFACE_OFFSET,
          shot.end.z,
        );
        group.visible = true;
      },
    }),
    [courseRef, floatingPadsRef, material],
  );

  return (
    <group ref={groupRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.3, 0.4, 32]} />
        <primitive object={material} attach="material" />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <circleGeometry args={[0.075, 16]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
});

const Splash = forwardRef<Group>(function Splash(_, ref) {
  return (
    <group ref={ref} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.34, 0.055, 8, 32]} />
        <meshBasicMaterial color="#d5ffff" transparent opacity={0.75} />
      </mesh>
      {[-0.45, 0, 0.45].map((x, index) => (
        <mesh key={index} position={[x, 0.12 + index * 0.06, index * 0.12]}>
          <sphereGeometry args={[0.07, 8, 6]} />
          <meshBasicMaterial color="#d5ffff" />
        </mesh>
      ))}
    </group>
  );
});
