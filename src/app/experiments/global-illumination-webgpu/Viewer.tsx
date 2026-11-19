"use client"

import { Check, Move3d, Rotate3d } from "lucide-react"
import { type FC, useCallback, useEffect, useState } from "react"

import type { EditMode } from "./Controls"
import { allPoses, type Pose, rotatable, type SceneObject } from "./room"
import styles from "./Viewer.module.css"

/** What the page hands whichever renderer draws the room. */
export type CanvasProps = {
  onReady: () => void
  selected: SceneObject | null
  mode: EditMode
  onSelect: (name: SceneObject | null) => void
  /** An object moved or turned, or they were all put back. */
  onMove: () => void
}

const LABELS: Record<SceneObject, string> = {
  glow: "Orange sphere",
  pebble: "Green sphere",
  block: "Blue block",
  torus: "Chrome torus",
}

/** Metres to the centimetre, padded so the readout doesn't jump as values change sign. */
const metres = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2).padStart(5)
const degrees = (n: number) => `${Math.round(n) || 0}°`.padStart(5)

/** Where the selected object is, and for a turnable one how it's turned. */
function Readout({ pose: { position, rotation } }: { pose: Pose }) {
  const axes = ["x", "y", "z"] as const
  return (
    <p className={styles.readout}>
      <span className={styles.readoutGroup}>
        {axes.map((axis, i) => (
          <span key={axis}>
            {i > 0 && "  "}
            <span className={styles.axis}>{axis}</span> {metres(position[i])}
          </span>
        ))}
      </span>
      {rotation && (
        <span className={styles.readoutGroup}>
          {axes.map((axis, i) => (
            <span key={axis}>
              {i > 0 && "  "}
              <span className={styles.axis}>r{axis}</span> {degrees(rotation[i])}
            </span>
          ))}
        </span>
      )}
    </p>
  )
}

/**
 * The room, drawn by the canvas passed in, with the toolbar that moves what's
 * selected.
 */
export function GlobalIlluminationViewer({ Canvas }: { Canvas: FC<CanvasProps> }) {
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const [selected, setSelected] = useState<SceneObject | null>(null)
  const [mode, setMode] = useState<EditMode>("translate")
  // The gizmo moves the objects outside React; every move takes a fresh copy
  // of where they all are, for the readout.
  const [poses, setPoses] = useState(allPoses)
  const onMove = useCallback(() => setPoses(allPoses()), [])
  const canRotate = selected !== null && rotatable(selected)
  const editing: EditMode = canRotate ? mode : "translate"

  // W to move, E to rotate, Esc to let go — the usual editor keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return
      const key = event.key.toLowerCase()
      if (key === "w") setMode("translate")
      else if (key === "e") setMode("rotate")
      else if (key === "escape") setSelected(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <main
      className={styles.main}
      aria-label="A room inside a concrete box floating in the sky, with an orange glowing sphere, a small green sphere, a blue block and a chrome torus that mirrors the room. Sun streams through a single window in a visible shaft and bounces off the floor and walls, filling the shadows with soft, tinted light. Drag to orbit, scroll to move in and out of the building, click an object to move it."
    >
      <div className={styles.stage} style={{ opacity: ready ? 1 : 0 }}>
        <Canvas
          onReady={onReady}
          selected={selected}
          mode={editing}
          onSelect={setSelected}
          onMove={onMove}
        />
      </div>
      {selected && (
        <div className={styles.editor}>
          <Readout pose={poses[selected]} />
          <div className={styles.toolbar} role="toolbar" aria-label={`Editing the ${LABELS[selected].toLowerCase()}`}>
            <span className={styles.toolbarLabel}>{LABELS[selected]}</span>
            <button
              type="button"
              className={styles.tool}
              aria-pressed={editing === "translate"}
              aria-keyshortcuts="W"
              onClick={() => setMode("translate")}
            >
              <Move3d size={14} strokeWidth={1.75} aria-hidden />
              Move
            </button>
            <button
              type="button"
              className={styles.tool}
              aria-pressed={editing === "rotate"}
              aria-keyshortcuts="E"
              disabled={!canRotate}
              title={canRotate ? undefined : "A sphere looks the same however it's turned"}
              onClick={() => setMode("rotate")}
            >
              <Rotate3d size={14} strokeWidth={1.75} aria-hidden />
              Rotate
            </button>
            <button
              type="button"
              className={styles.tool}
              aria-keyshortcuts="Escape"
              onClick={() => setSelected(null)}
            >
              <Check size={14} strokeWidth={1.75} aria-hidden />
              Done
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
