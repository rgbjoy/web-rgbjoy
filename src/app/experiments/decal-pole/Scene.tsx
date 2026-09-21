"use client"

import { Canvas } from "@react-three/fiber"
import { Info, Plus } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { DecalPoleScene, type FlyerRequest } from "./DecalPole"
import { HelpDrawer } from "./HelpDrawer"
import styles from "./page.module.css"

export default function Page() {
  const [flyer, setFlyer] = useState<FlyerRequest | null>(null)
  const [hasAddedFlyer, setHasAddedFlyer] = useState(false)
  const [ready, setReady] = useState(false)
  const [hoveringPole, setHoveringPole] = useState(false)
  const [draggingImage, setDraggingImage] = useState(false)
  const [coarsePointer, setCoarsePointer] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Monotonic, so dropping the same file twice still reads as two flyers.
  const flyerKey = useRef(0)
  const pendingUrl = useRef<string | null>(null)

  const onReady = useCallback(() => setReady(true), [])

  // Only used to decide whether to promise a drag-and-drop that a touch device
  // cannot offer.
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)")
    const sync = () => setCoarsePointer(query.matches)

    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  // A flyer whose texture never finished decoding still holds an object URL.
  useEffect(
    () => () => {
      if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current)
    },
    [],
  )

  const addFlyer = useCallback((file: File, drop: { x: number; y: number } | null) => {
    if (!file.type.startsWith("image/")) return

    const url = URL.createObjectURL(file)
    pendingUrl.current = url
    flyerKey.current += 1

    setFlyer({ key: flyerKey.current, url, drop, revokeAfterLoad: true })
    setHasAddedFlyer(true)
  }, [])

  const onDragEnter = (event: React.DragEvent) => {
    event.preventDefault()
    if (!event.dataTransfer.types.includes("Files")) return
    // `items` only exposes types (not names) during a drag, which is all the
    // check needs.
    const hasImage = Array.from(event.dataTransfer.items).some((item) =>
      item.type.startsWith("image/"),
    )
    if (hasImage) setDraggingImage(true)
  }

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    if (draggingImage) event.dataTransfer.dropEffect = "copy"
  }

  const onDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    // Crossing into a child fires dragleave on the parent; ignore those.
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setDraggingImage(false)
  }

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDraggingImage(false)

    const file = event.dataTransfer.files?.[0]
    if (file) addFlyer(file, { x: event.clientX, y: event.clientY })
  }

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Picked flyers have no drop point, so the scene staples them to whichever
    // face of the pole is being looked at.
    if (file) addFlyer(file, null)
    event.target.value = ""
  }

  return (
    <main
      className={styles.main}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className={`${styles.stage} ${draggingImage ? styles.dropping : ""} ${
          hoveringPole ? styles.grabbable : ""
        }`}
        style={{ opacity: ready ? 1 : 0 }}
      >
        <Canvas shadows>
          <DecalPoleScene
            flyer={flyer}
            onReady={onReady}
            onHoverChange={setHoveringPole}
          />
        </Canvas>
      </div>

      {!hasAddedFlyer && !coarsePointer ? (
        <p className={styles.hint}>Drag and drop an image</p>
      ) : null}

      <button
        className={styles.addButton}
        aria-label="Add a flyer"
        onClick={() => fileInputRef.current?.click()}
      >
        <Plus size={24} aria-hidden="true" />
      </button>
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept="image/*"
        onChange={onFileSelect}
        aria-label="Add a flyer"
      />

      <button
        className={styles.helpButton}
        aria-expanded={helpOpen}
        aria-controls="decal-pole-help"
        aria-label="About this experiment"
        onClick={() => setHelpOpen((open) => !open)}
      >
        <Info size={24} aria-hidden="true" />
      </button>

      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  )
}
