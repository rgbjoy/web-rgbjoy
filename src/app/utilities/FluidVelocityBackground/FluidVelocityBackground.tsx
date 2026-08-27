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

type SimulationPrograms = {
  advection: GPUProgram;
  divergence2D: GPUProgram;
  jacobi: GPUProgram;
  gradientSubtraction: GPUProgram;
  damping: GPUProgram;
  touch: GPUProgram;
};

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

  composer.drawLayerAsVectorField({
    layer: velocityState,
    vectorSpacing: 10,
    vectorScale: 2.5,
    color: [TICK_COLOR, TICK_COLOR, TICK_COLOR],
  });
}

export function FluidVelocityBackground() {
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

    programsRef.current = {
      advection,
      divergence2D,
      jacobi,
      gradientSubtraction,
      damping,
      touch,
    };

    composer.clearValue = [0, 0, 0, 1];
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

      const segments =
        ARC_SEGMENTS_MIN +
        Math.floor(Math.random() * (ARC_SEGMENTS_MAX - ARC_SEGMENTS_MIN + 1));
      const arcLength =
        ARC_LENGTH_MIN + Math.random() * (ARC_LENGTH_MAX - ARC_LENGTH_MIN);
      const sweep =
        (Math.random() < 0.5 ? -1 : 1) *
        (ARC_SWEEP_MIN + Math.random() * (ARC_SWEEP_MAX - ARC_SWEEP_MIN));
      const stepLength = arcLength / segments;

      let x = Math.random() * width;
      let y = Math.random() * height;
      let heading = Math.random() * Math.PI * 2;

      for (let i = 0; i < segments; i += 1) {
        heading += sweep / segments + (Math.random() - 0.5) * 0.18;
        const nextX = x + Math.cos(heading) * stepLength;
        const nextY = y + Math.sin(heading) * stepLength;

        programs.touch.setUniform("u_vector", [nextX - x, -(nextY - y)]);

        composer.stepSegment({
          program: programs.touch,
          input: velocityState,
          output: velocityState,
          position1: [nextX, height - nextY],
          position2: [x, height - y],
          thickness:
            ARC_THICKNESS_MIN +
            Math.random() * (ARC_THICKNESS_MAX - ARC_THICKNESS_MIN),
          endCaps: true,
        });

        x = nextX;
        y = nextY;
      }
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
      composerRef.current?.dispose();

      velocityStateRef.current = null;
      divergenceStateRef.current = null;
      pressureStateRef.current = null;
      programsRef.current = null;
      composerRef.current = null;
    };
  }, [initSimulation]);

  return (
    <div ref={containerRef} className={styles.container} aria-hidden="true" />
  );
}
