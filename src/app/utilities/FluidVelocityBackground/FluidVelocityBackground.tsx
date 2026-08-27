"use client";

import {
  GPUComposer,
  GPUProgram,
  GPULayer,
  FLOAT,
  INT,
  REPEAT,
  NEAREST,
  LINEAR,
} from "gpu-io";
import React, { useEffect, useRef, useCallback } from "react";

import type { Theme } from "../settings/constants";
import styles from "./FluidVelocityBackground.module.css";

const TOUCH_FORCE_SCALE = 2;
const NUM_JACOBI_STEPS = 3;
const PRESSURE_CALC_ALPHA = -1;
const PRESSURE_CALC_BETA = 0.25;
const VELOCITY_SCALE_FACTOR = 8;
const MAX_VELOCITY = 30;
const VELOCITY_DAMPING = 0.985;
const VELOCITY_SLEEP = 0.015;
const TICK_COLOR = 0.35;
/** On paper the ticks have to sit darker than the ground, not brighter, and the
 *  hues have to come down or they glare. Same contrast either way. */
const TICK_COLOR_LIGHT = 0.68;
/** Velocity magnitude that reaches full chroma saturation. */
const CHROMA_FULL_VELOCITY = 6;
/** How much of the hue wheel the flow heading sweeps through. */
const CHROMA_HEADING_SPREAD = 1;
/** Hue cycles per second, so a still field still shimmers. */
const CHROMA_DRIFT_RATE = 0.06;
/** Extra hue offset applied by fast-moving ticks. */
const CHROMA_ENERGY_SHIFT = 0.25;
/** Brightness multiplier on the saturated end of the ramp. */
const CHROMA_GAIN = 1.25;
const CHROMA_GAIN_LIGHT = 0.72;
const PULSE_MIN_MS = 1680;
const PULSE_MAX_MS = 3920;
const ARC_LENGTH_MIN = 56;
const ARC_LENGTH_MAX = 148;
const ARC_SWEEP_MIN = 0.55;
const ARC_SWEEP_MAX = 1.65;
const ARC_SEGMENTS_MIN = 4;
const ARC_SEGMENTS_MAX = 7;
const ARC_THICKNESS_MIN = 26;
const ARC_THICKNESS_MAX = 38;
/** One-shot bloom fired when the field first comes up, so the page never opens on
 *  a dead grid. Sized in fractions of the viewport's short edge. */
const LOAD_PULSE_DELAY_MS = 120;
const LOAD_PULSE_ARMS = 5;
const LOAD_PULSE_RADIUS = 0.05;
const LOAD_PULSE_LENGTH = 0.24;
/** Radians off pure radial. Straight-out flow is pure divergence, which the
 *  pressure projection deletes — angling the arms keeps the curl the solver holds. */
const LOAD_PULSE_SPIRAL = 0.9;
const LOAD_PULSE_SWEEP = 0.9;
const LOAD_PULSE_SEGMENTS = 8;
const LOAD_PULSE_THICKNESS = 34;
const LOAD_PULSE_STRENGTH = 1.4;

type SimulationPrograms = {
  advection: GPUProgram;
  divergence2D: GPUProgram;
  jacobi: GPUProgram;
  gradientSubtraction: GPUProgram;
  damping: GPUProgram;
  touch: GPUProgram;
  chroma: GPUProgram;
};

type Arc = {
  x: number;
  y: number;
  heading: number;
  length: number;
  sweep: number;
  segments: number;
  thickness: number;
  /** Multiplier on the injected velocity, before TOUCH_FORCE_SCALE and the clamp. */
  strength: number;
};

/** Walks a curved stroke through the velocity field, injecting flow as it goes. */
function emitArc(
  composer: GPUComposer,
  programs: SimulationPrograms,
  velocityState: GPULayer,
  height: number,
  arc: Arc,
) {
  const stepLength = arc.length / arc.segments;
  let { x, y, heading } = arc;

  for (let i = 0; i < arc.segments; i += 1) {
    heading += arc.sweep / arc.segments + (Math.random() - 0.5) * 0.18;
    const nextX = x + Math.cos(heading) * stepLength;
    const nextY = y + Math.sin(heading) * stepLength;

    programs.touch.setUniform("u_vector", [
      (nextX - x) * arc.strength,
      -(nextY - y) * arc.strength,
    ]);

    composer.stepSegment({
      program: programs.touch,
      input: velocityState,
      output: velocityState,
      position1: [nextX, height - nextY],
      position2: [x, height - y],
      thickness: arc.thickness,
      endCaps: true,
    });

    x = nextX;
    y = nextY;
  }
}

/** Ground colour and tick levels are the only things the theme touches. */
function applyTheme(composer: GPUComposer, chroma: GPUProgram, theme: Theme) {
  const light = theme === "light";
  composer.clearValue = light ? [1, 1, 1, 1] : [0, 0, 0, 1];
  chroma.setUniform("u_rest", light ? TICK_COLOR_LIGHT : TICK_COLOR);
  chroma.setUniform("u_gain", light ? CHROMA_GAIN_LIGHT : CHROMA_GAIN);
}

function stepSimulation(
  composer: GPUComposer,
  velocityState: GPULayer,
  divergenceState: GPULayer,
  pressureState: GPULayer,
  programs: SimulationPrograms,
) {
  composer.clear();

  composer.step({
    program: programs.advection,
    input: [velocityState, velocityState],
    output: velocityState,
  });

  composer.step({
    program: programs.divergence2D,
    input: velocityState,
    output: divergenceState,
  });

  for (let i = 0; i < NUM_JACOBI_STEPS; i++) {
    composer.step({
      program: programs.jacobi,
      input: [pressureState, divergenceState],
      output: pressureState,
    });
  }

  composer.step({
    program: programs.gradientSubtraction,
    input: [pressureState, velocityState],
    output: velocityState,
  });

  composer.step({
    program: programs.damping,
    input: velocityState,
    output: velocityState,
  });

  programs.chroma.setUniform("u_time", performance.now() / 1000);

  composer.drawLayerAsVectorField({
    layer: velocityState,
    vectorSpacing: 10,
    vectorScale: 2.5,
    program: programs.chroma,
  });
}

export function FluidVelocityBackground({ theme }: { theme: Theme }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<GPUComposer | null>(null);
  const velocityStateRef = useRef<GPULayer | null>(null);
  const divergenceStateRef = useRef<GPULayer | null>(null);
  const pressureStateRef = useRef<GPULayer | null>(null);
  const programsRef = useRef<SimulationPrograms | null>(null);
  const animationRef = useRef<number>(0);
  const activeTouchesRef = useRef<
    Record<number, { current: number[]; last?: number[] }>
  >({});
  // Only ever read at init, to pick the starting ground colour. Later changes
  // arrive through the theme effect below, which avoids re-running init and
  // wiping the field.
  const themeRef = useRef(theme);

  const initSimulation = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = width;
    canvas.height = height;

    const velocityDimensions: [number, number] = [
      Math.ceil(width / VELOCITY_SCALE_FACTOR),
      Math.ceil(height / VELOCITY_SCALE_FACTOR),
    ];
    const velocityPxSize: [number, number] = [
      1 / velocityDimensions[0],
      1 / velocityDimensions[1],
    ];

    const composer = new GPUComposer({ canvas });
    // GPUComposer sizes from canvas.clientWidth/Height, which can still be 0 right after
    // appendChild — that yields a 0×0 backbuffer and a blank page. Force the measured size.
    composer.resize([width, height]);
    composerRef.current = composer;

    const velocityState = new GPULayer(composer, {
      name: "velocity",
      dimensions: velocityDimensions,
      type: FLOAT,
      filter: LINEAR,
      numComponents: 2,
      wrapX: REPEAT,
      wrapY: REPEAT,
      numBuffers: 2,
    });
    velocityStateRef.current = velocityState;

    const divergenceState = new GPULayer(composer, {
      name: "divergence",
      dimensions: velocityDimensions,
      type: FLOAT,
      filter: NEAREST,
      numComponents: 1,
      wrapX: REPEAT,
      wrapY: REPEAT,
    });
    divergenceStateRef.current = divergenceState;

    const pressureState = new GPULayer(composer, {
      name: "pressure",
      dimensions: velocityDimensions,
      type: FLOAT,
      filter: NEAREST,
      numComponents: 1,
      wrapX: REPEAT,
      wrapY: REPEAT,
      numBuffers: 2,
    });
    pressureStateRef.current = pressureState;

    const advection = new GPUProgram(composer, {
      name: "advection",
      fragmentShader: `
        in vec2 v_uv;

        uniform sampler2D u_state;
        uniform sampler2D u_velocity;
        uniform vec2 u_dimensions;

        out vec2 out_state;

        void main() {
          out_state = texture(u_state, v_uv - texture(u_velocity, v_uv).xy / u_dimensions).xy;
        }`,
      uniforms: [
        { name: "u_state", value: 0, type: INT },
        { name: "u_velocity", value: 1, type: INT },
        { name: "u_dimensions", value: [width, height], type: FLOAT },
      ],
    });

    const divergence2D = new GPUProgram(composer, {
      name: "divergence2D",
      fragmentShader: `
        in vec2 v_uv;

        uniform sampler2D u_vectorField;
        uniform vec2 u_pxSize;

        out float out_divergence;

        void main() {
          float n = texture(u_vectorField, v_uv + vec2(0, u_pxSize.y)).y;
          float s = texture(u_vectorField, v_uv - vec2(0, u_pxSize.y)).y;
          float e = texture(u_vectorField, v_uv + vec2(u_pxSize.x, 0)).x;
          float w = texture(u_vectorField, v_uv - vec2(u_pxSize.x, 0)).x;
          out_divergence = 0.5 * (e - w + n - s);
        }`,
      uniforms: [
        { name: "u_vectorField", value: 0, type: INT },
        { name: "u_pxSize", value: velocityPxSize, type: FLOAT },
      ],
    });

    const jacobi = new GPUProgram(composer, {
      name: "jacobi",
      fragmentShader: `
        in vec2 v_uv;

        uniform float u_alpha;
        uniform float u_beta;
        uniform vec2 u_pxSize;
        uniform sampler2D u_previousState;
        uniform sampler2D u_divergence;

        out float out_result;

        void main() {
          float n = texture(u_previousState, v_uv + vec2(0, u_pxSize.y)).r;
          float s = texture(u_previousState, v_uv - vec2(0, u_pxSize.y)).r;
          float e = texture(u_previousState, v_uv + vec2(u_pxSize.x, 0)).r;
          float w = texture(u_previousState, v_uv - vec2(u_pxSize.x, 0)).r;
          float d = texture(u_divergence, v_uv).r;
          out_result = (n + s + e + w + u_alpha * d) * u_beta;
        }`,
      uniforms: [
        { name: "u_alpha", value: PRESSURE_CALC_ALPHA, type: FLOAT },
        { name: "u_beta", value: PRESSURE_CALC_BETA, type: FLOAT },
        { name: "u_pxSize", value: velocityPxSize, type: FLOAT },
        { name: "u_previousState", value: 0, type: INT },
        { name: "u_divergence", value: 1, type: INT },
      ],
    });

    const gradientSubtraction = new GPUProgram(composer, {
      name: "gradientSubtraction",
      fragmentShader: `
        in vec2 v_uv;

        uniform vec2 u_pxSize;
        uniform sampler2D u_scalarField;
        uniform sampler2D u_vectorField;

        out vec2 out_result;

        void main() {
          float n = texture(u_scalarField, v_uv + vec2(0, u_pxSize.y)).r;
          float s = texture(u_scalarField, v_uv - vec2(0, u_pxSize.y)).r;
          float e = texture(u_scalarField, v_uv + vec2(u_pxSize.x, 0)).r;
          float w = texture(u_scalarField, v_uv - vec2(u_pxSize.x, 0)).r;

          out_result = texture(u_vectorField, v_uv).xy - 0.5 * vec2(e - w, n - s);
        }`,
      uniforms: [
        { name: "u_pxSize", value: velocityPxSize, type: FLOAT },
        { name: "u_scalarField", value: 0, type: INT },
        { name: "u_vectorField", value: 1, type: INT },
      ],
    });

    const touch = new GPUProgram(composer, {
      name: "touch",
      fragmentShader: `
        in vec2 v_uv;
        in vec2 v_uv_local;

        uniform sampler2D u_velocity;
        uniform vec2 u_vector;

        out vec2 out_velocity;

        void main() {
          vec2 radialVec = (v_uv_local * 2.0 - 1.0);
          float radiusSq = dot(radialVec, radialVec);
          vec2 velocity = texture(u_velocity, v_uv).xy + (1.0 - radiusSq) * u_vector * ${TOUCH_FORCE_SCALE.toFixed(1)};
          float velocityMag = length(velocity);
          out_velocity = velocity / velocityMag * min(velocityMag, ${MAX_VELOCITY.toFixed(1)});
        }`,
      uniforms: [
        { name: "u_velocity", value: 0, type: INT },
        { name: "u_vector", value: [0, 0], type: FLOAT },
      ],
    });

    const damping = new GPUProgram(composer, {
      name: "damping",
      fragmentShader: `
        in vec2 v_uv;

        uniform sampler2D u_velocity;
        uniform float u_damping;
        uniform float u_sleep;

        out vec2 out_velocity;

        void main() {
          vec2 velocity = texture(u_velocity, v_uv).xy * u_damping;
          if (length(velocity) < u_sleep) {
            velocity = vec2(0.0);
          }
          out_velocity = velocity;
        }`,
      uniforms: [
        { name: "u_velocity", value: 0, type: INT },
        { name: "u_damping", value: VELOCITY_DAMPING, type: FLOAT },
        { name: "u_sleep", value: VELOCITY_SLEEP, type: FLOAT },
      ],
    });

    // Colors each velocity tick instead of drawing it flat grey: hue follows the
    // flow heading, saturation ramps with speed, so still areas stay neutral.
    const chroma = new GPUProgram(composer, {
      name: "chroma",
      fragmentShader: `
        in vec2 v_uv;

        uniform sampler2D u_velocity;
        uniform float u_time;
        uniform float u_rest;
        uniform float u_gain;

        out vec4 out_color;

        // Inigo Quilez cosine palette — https://iquilezles.org/articles/palettes/
        vec3 cosinePalette(float t) {
          return clamp(
            vec3(0.56) + vec3(0.44) * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))),
            0.0,
            1.0
          );
        }

        void main() {
          vec2 velocity = texture(u_velocity, v_uv).xy;
          float energy = clamp(length(velocity) / ${CHROMA_FULL_VELOCITY.toFixed(1)}, 0.0, 1.0);
          float heading = atan(velocity.y, velocity.x) / 6.28318;

          float t = heading * ${CHROMA_HEADING_SPREAD.toFixed(2)}
            + u_time * ${CHROMA_DRIFT_RATE.toFixed(2)}
            + energy * ${CHROMA_ENERGY_SHIFT.toFixed(2)};

          vec3 color = mix(
            vec3(u_rest),
            cosinePalette(t) * u_gain,
            smoothstep(0.0, 1.0, energy)
          );

          out_color = vec4(color, 1.0);
        }`,
      uniforms: [
        { name: "u_velocity", value: 0, type: INT },
        { name: "u_time", value: 0, type: FLOAT },
        { name: "u_rest", value: TICK_COLOR, type: FLOAT },
        { name: "u_gain", value: CHROMA_GAIN, type: FLOAT },
      ],
    });

    programsRef.current = {
      advection,
      divergence2D,
      jacobi,
      gradientSubtraction,
      damping,
      touch,
      chroma,
    };

    applyTheme(composer, chroma, themeRef.current);
    composer.clear();

    const loop = () => {
      const composer = composerRef.current;
      const velocityState = velocityStateRef.current;
      const divergenceState = divergenceStateRef.current;
      const pressureState = pressureStateRef.current;
      const programs = programsRef.current;

      if (
        !composer ||
        !velocityState ||
        !divergenceState ||
        !pressureState ||
        !programs
      )
        return;

      stepSimulation(
        composer,
        velocityState,
        divergenceState,
        pressureState,
        programs,
      );

      animationRef.current = requestAnimationFrame(loop);
    };

    loop();
  }, []);

  /** Pinwheel of arms thrown from the centre — one bloom that spreads and settles. */
  const emitLoadPulse = useCallback(() => {
    const programs = programsRef.current;
    const velocityState = velocityStateRef.current;
    const composer = composerRef.current;
    const container = containerRef.current;

    if (!programs || !velocityState || !composer || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const span = Math.min(width, height);
    const spin = Math.random() < 0.5 ? -1 : 1;

    for (let i = 0; i < LOAD_PULSE_ARMS; i += 1) {
      const angle = (i / LOAD_PULSE_ARMS) * Math.PI * 2;

      emitArc(composer, programs, velocityState, height, {
        x: width / 2 + Math.cos(angle) * span * LOAD_PULSE_RADIUS,
        y: height / 2 + Math.sin(angle) * span * LOAD_PULSE_RADIUS,
        heading: angle + LOAD_PULSE_SPIRAL * spin,
        length: span * LOAD_PULSE_LENGTH,
        sweep: LOAD_PULSE_SWEEP * spin,
        segments: LOAD_PULSE_SEGMENTS,
        thickness: LOAD_PULSE_THICKNESS,
        strength: LOAD_PULSE_STRENGTH,
      });
    }
  }, []);

  useEffect(() => {
    const applyPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;

      const programs = programsRef.current;
      const velocityState = velocityStateRef.current;
      const composer = composerRef.current;
      const container = containerRef.current;

      if (!programs || !velocityState || !composer || !container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const canvasY = container.clientHeight - y;

      const touches = activeTouchesRef.current;

      if (touches[e.pointerId] === undefined) {
        touches[e.pointerId] = { current: [x, y] };
        return;
      }

      touches[e.pointerId].last = touches[e.pointerId].current;
      touches[e.pointerId].current = [x, y];

      const { current, last } = touches[e.pointerId];
      if (!last || (current[0] === last[0] && current[1] === last[1])) return;

      const vector: [number, number] = [
        current[0] - last[0],
        -(current[1] - last[1]),
      ];
      programs.touch.setUniform("u_vector", vector);

      composer.stepSegment({
        program: programs.touch,
        input: velocityState,
        output: velocityState,
        position1: [current[0], canvasY],
        position2: [last[0], container.clientHeight - last[1]],
        thickness: 30,
        endCaps: true,
      });
    };

    window.addEventListener("pointermove", applyPointerMove);

    return () => {
      window.removeEventListener("pointermove", applyPointerMove);
    };
  }, []);

  useEffect(() => {
    const coarseQuery = window.matchMedia("(pointer: coarse), (hover: none)");
    let timeoutId = 0;

    const emitRandomArc = () => {
      const programs = programsRef.current;
      const velocityState = velocityStateRef.current;
      const composer = composerRef.current;
      const container = containerRef.current;

      if (!programs || !velocityState || !composer || !container) return;

      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;

      emitArc(composer, programs, velocityState, height, {
        x: Math.random() * width,
        y: Math.random() * height,
        heading: Math.random() * Math.PI * 2,
        length: ARC_LENGTH_MIN + Math.random() * (ARC_LENGTH_MAX - ARC_LENGTH_MIN),
        sweep:
          (Math.random() < 0.5 ? -1 : 1) *
          (ARC_SWEEP_MIN + Math.random() * (ARC_SWEEP_MAX - ARC_SWEEP_MIN)),
        segments:
          ARC_SEGMENTS_MIN +
          Math.floor(Math.random() * (ARC_SEGMENTS_MAX - ARC_SEGMENTS_MIN + 1)),
        thickness:
          ARC_THICKNESS_MIN +
          Math.random() * (ARC_THICKNESS_MAX - ARC_THICKNESS_MIN),
        strength: 1,
      });
    };

    const scheduleArc = () => {
      if (!coarseQuery.matches) return;
      emitRandomArc();
      timeoutId = window.setTimeout(
        scheduleArc,
        PULSE_MIN_MS + Math.random() * (PULSE_MAX_MS - PULSE_MIN_MS),
      );
    };

    const syncArcLoop = () => {
      window.clearTimeout(timeoutId);
      if (coarseQuery.matches) scheduleArc();
    };

    syncArcLoop();
    coarseQuery.addEventListener("change", syncArcLoop);

    return () => {
      window.clearTimeout(timeoutId);
      coarseQuery.removeEventListener("change", syncArcLoop);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    initSimulation();

    const pulseId = window.setTimeout(emitLoadPulse, LOAD_PULSE_DELAY_MS);

    const handleResize = () => {
      const container = containerRef.current;
      if (!container) return;

      const canvas = container.querySelector("canvas");
      if (!canvas) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      if (width === 0 || height === 0) return;

      cancelAnimationFrame(animationRef.current);

      const composer = composerRef.current;
      if (composer) {
        composer.resize([width, height]);

        const velocityDimensions: [number, number] = [
          Math.ceil(width / VELOCITY_SCALE_FACTOR),
          Math.ceil(height / VELOCITY_SCALE_FACTOR),
        ];
        const velocityPxSize: [number, number] = [
          1 / velocityDimensions[0],
          1 / velocityDimensions[1],
        ];

        velocityStateRef.current?.resize(velocityDimensions);
        divergenceStateRef.current?.resize(velocityDimensions);
        pressureStateRef.current?.resize(velocityDimensions);

        const programs = programsRef.current;
        if (programs) {
          programs.advection.setUniform("u_dimensions", [width, height]);
          programs.divergence2D.setUniform("u_pxSize", velocityPxSize);
          programs.jacobi.setUniform("u_pxSize", velocityPxSize);
          programs.gradientSubtraction.setUniform("u_pxSize", velocityPxSize);
        }
      }

      canvas.width = width;
      canvas.height = height;

      const loop = () => {
        const composer = composerRef.current;
        const velocityState = velocityStateRef.current;
        const divergenceState = divergenceStateRef.current;
        const pressureState = pressureStateRef.current;
        const programs = programsRef.current;

        if (
          !composer ||
          !velocityState ||
          !divergenceState ||
          !pressureState ||
          !programs
        )
          return;

        stepSimulation(
          composer,
          velocityState,
          divergenceState,
          pressureState,
          programs,
        );

        animationRef.current = requestAnimationFrame(loop);
      };

      loop();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(pulseId);
      cancelAnimationFrame(animationRef.current);

      if (container) {
        const canvas = container.querySelector("canvas");
        if (canvas) container.removeChild(canvas);
      }

      velocityStateRef.current?.dispose();
      divergenceStateRef.current?.dispose();
      pressureStateRef.current?.dispose();
      programsRef.current?.advection.dispose();
      programsRef.current?.divergence2D.dispose();
      programsRef.current?.jacobi.dispose();
      programsRef.current?.gradientSubtraction.dispose();
      programsRef.current?.damping.dispose();
      programsRef.current?.touch.dispose();
      programsRef.current?.chroma.dispose();
      composerRef.current?.dispose();

      velocityStateRef.current = null;
      divergenceStateRef.current = null;
      pressureStateRef.current = null;
      programsRef.current = null;
      composerRef.current = null;
    };
  }, [initSimulation, emitLoadPulse]);

  // Declared after the mount effect, so init has already run on first paint.
  useEffect(() => {
    const composer = composerRef.current;
    const programs = programsRef.current;
    if (!composer || !programs) return;

    applyTheme(composer, programs.chroma, theme);
  }, [theme]);

  return (
    <div ref={containerRef} className={styles.container} aria-hidden="true" />
  );
}
