"use client"

import { Canvas } from "@react-three/fiber/webgpu"
import {
  ChevronDown,
  Dices,
  Download,
  Lock,
  LockOpen,
  Minus,
  Plus,
  RefreshCw,
} from "lucide-react"
import * as Accordion from "@radix-ui/react-accordion"
import { useCallback, useState, useSyncExternalStore } from "react"

import { exportIslandGlb } from "./exportIsland"
import { IslandScene } from "./IslandScene"
import styles from "./page.module.css"
import {
  DEFAULT_ISLAND_SETTINGS,
  MAX_ELEVATION,
  MAX_ISLAND_SIZE,
  MAX_LACUNARITY,
  MAX_NOISE_SCALE,
  MAX_PERSISTENCE,
  MAX_RESOLUTION,
  MAX_WATER_LEVEL,
  MIN_ELEVATION,
  MIN_ISLAND_SIZE,
  MIN_LACUNARITY,
  MIN_NOISE_SCALE,
  MIN_PERSISTENCE,
  MIN_RESOLUTION,
  MIN_WATER_LEVEL,
  RESOLUTION_STEP,
  type IslandSettings,
} from "./terrain"

type NumericSetting = Exclude<keyof IslandSettings, "seed">
/** Seed included: locking it is the whole point of pinning a shape. */
type LockableSetting = keyof IslandSettings

type RangeControlProps = {
  label: string
  setting: NumericSetting
  value: number
  min: number
  max: number
  step: number
  display?: (value: number) => string
  onChange: (setting: NumericSetting, value: number) => void
  locked: boolean
  onToggleLock: (setting: LockableSetting) => void
}

function RangeControl({
  label,
  setting,
  value,
  min,
  max,
  step,
  display = (current) => current.toFixed(2),
  onChange,
  locked,
  onToggleLock,
}: RangeControlProps) {
  const id = `island-${setting}`

  // A <div>, not a <label>: a button inside a label has its clicks forwarded to
  // the labelled control, so toggling the lock would also drag the slider.
  return (
    <div className={styles.rangeControl} data-locked={locked}>
      <span>
        <label htmlFor={id}>{label}</label>
        <span className={styles.rangeMeta}>
          <output htmlFor={id}>{display(value)}</output>
          <LockToggle
            label={label}
            setting={setting}
            locked={locked}
            onToggleLock={onToggleLock}
          />
        </span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(setting, event.currentTarget.valueAsNumber)
        }
      />
    </div>
  )
}

function LockToggle({
  label,
  setting,
  locked,
  onToggleLock,
}: {
  label: string
  setting: LockableSetting
  locked: boolean
  onToggleLock: (setting: LockableSetting) => void
}) {
  return (
    <button
      className={styles.lockButton}
      type="button"
      aria-pressed={locked}
      aria-label={`${locked ? "Unlock" : "Lock"} ${label}`}
      title={locked ? `${label} is held through Randomize` : `Hold ${label} through Randomize`}
      onClick={() => onToggleLock(setting)}
    >
      {locked ? (
        <Lock size={11} strokeWidth={2.4} aria-hidden="true" />
      ) : (
        <LockOpen size={11} strokeWidth={2.4} aria-hidden="true" />
      )}
    </button>
  )
}

function randomUnit() {
  if (typeof crypto !== "undefined") {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
  }
  return Math.random()
}

function randomSeed() {
  return Math.floor(randomUnit() * 0x80000000)
}

function randomRange(minimum: number, maximum: number, precision: number) {
  const factor = 10 ** precision
  return (
    Math.round((minimum + randomUnit() * (maximum - minimum)) * factor) /
    factor
  )
}

const subscribeWebGpu = () => () => {}
const getWebGpuSnapshot = () => Boolean(navigator.gpu)
const getWebGpuServerSnapshot = () => false

export default function Page() {
  const [settings, setSettings] = useState<IslandSettings>(
    DEFAULT_ISLAND_SETTINGS,
  )
  const [isExporting, setIsExporting] = useState(false)
  const [showWater, setShowWater] = useState(true)
  const [showBiomes, setShowBiomes] = useState(true)
  const [showTrees, setShowTrees] = useState(true)
  const [controlsOpen, setControlsOpen] = useState(true)
  // Locks only hold fields through Randomize; the sliders stay editable.
  const [locked, setLocked] = useState<ReadonlySet<LockableSetting>>(
    () => new Set(),
  )
  const webgpu = useSyncExternalStore(
    subscribeWebGpu,
    getWebGpuSnapshot,
    getWebGpuServerSnapshot,
  )

  const updateSetting = useCallback(
    (setting: NumericSetting, value: number) => {
      setSettings((current) => ({ ...current, [setting]: value }))
    },
    [],
  )

  const updateSeed = useCallback((seed: number) => {
    setSettings((current) => ({
      ...current,
      seed: Math.max(0, Math.min(0x7fffffff, Math.trunc(seed) || 0)),
    }))
  }, [])

  const toggleLock = useCallback((setting: LockableSetting) => {
    setLocked((current) => {
      const next = new Set(current)
      if (!next.delete(setting)) next.add(setting)
      return next
    })
  }, [])

  const newIsland = useCallback(() => {
    setSettings((current) => ({ ...current, seed: randomSeed() }))
  }, [])

  const randomizeIsland = useCallback(() => {
    setSettings((current) => {
      const next: IslandSettings = {
        ...current,
        seed: randomSeed(),
        persistence: randomRange(MIN_PERSISTENCE, MAX_PERSISTENCE, 2),
        lacunarity: randomRange(MIN_LACUNARITY, MAX_LACUNARITY, 2),
        noiseScale: randomRange(MIN_NOISE_SCALE, MAX_NOISE_SCALE, 3),
        ridginess: randomRange(0, 20, 0) / 20,
        elevation: randomRange(MIN_ELEVATION, MAX_ELEVATION, 1),
        islandSize: randomRange(MIN_ISLAND_SIZE, MAX_ISLAND_SIZE, 2),
        shoreSoftness: randomRange(0, 20, 0) / 20,
      }
      // Roll everything, then put the held fields back, so adding a new random
      // field later cannot quietly escape the locks.
      for (const setting of locked) next[setting] = current[setting]
      return next
    })
  }, [locked])

  const exportIsland = useCallback(async () => {
    setIsExporting(true)
    try {
      await exportIslandGlb(settings, {
        includeWater: showWater,
        includeBiomes: showBiomes,
      })
    } finally {
      setIsExporting(false)
    }
  }, [settings, showBiomes, showWater])

  return (
    <main className={styles.main}>
      {webgpu ? (
        <Canvas
          className={styles.canvas}
          dpr={[1, 1.5]}
          shadows
          camera={{
            position: [30.5, 25, 37.5],
            fov: 43,
            near: 0.1,
            far: 240,
          }}
          renderer={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          }}
        >
          <IslandScene
            settings={settings}
            showWater={showWater}
            showBiomes={showBiomes}
            showTrees={showTrees}
          />
        </Canvas>
      ) : (
        <p className={styles.fallback}>
          This island needs WebGPU. Try Chrome or Edge, or enable WebGPU in
          Safari.
        </p>
      )}

      <header className={styles.titleBlock}>
        <h1>Island Generator</h1>
        <p>Drag to orbit · scroll to zoom</p>
      </header>

      <section
        className={`${styles.panel} ${controlsOpen ? "" : styles.panelMinimized}`}
        aria-label="Island controls"
      >
        <div className={styles.panelHeading}>
          <button
            type="button"
            className={styles.panelToggle}
            aria-expanded={controlsOpen}
            aria-controls="island-controls-body"
            aria-label={controlsOpen ? "Minimize controls" : "Show controls"}
            onClick={() => setControlsOpen((open) => !open)}
          >
            {controlsOpen ? (
              <Minus size={14} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            )}
            {controlsOpen ? null : "Controls"}
          </button>
          {/* Randomize stays reachable while minimized: rerolling is the one
              thing worth doing without opening the panel. */}
          <div className={styles.panelActions}>
            <button
              type="button"
              title="Randomize"
              aria-label="Randomize"
              onClick={randomizeIsland}
            >
              <Dices size={14} strokeWidth={2.2} aria-hidden="true" />
              {controlsOpen ? "Randomize" : null}
            </button>
          </div>
        </div>

        <div id="island-controls-body" hidden={!controlsOpen}>
          {/* Grouped by what each knob decides, not by model-versus-view: the
              mesh and scene knobs are baked into the export too. */}
          <Accordion.Root
            type="multiple"
            defaultValue={["shape", "mesh", "scene"]}
            className={styles.sections}
          >
            <Accordion.Item value="shape" className={styles.section}>
              <Accordion.Header>
                <Accordion.Trigger className={styles.sectionTrigger}>
                  <span>Shape</span>
                  <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className={styles.sectionContent}>
                <div className={styles.sectionBody}>
                  <div
                    className={styles.seedControl}
                    data-locked={locked.has("seed")}
                  >
                    <label htmlFor="island-seed">Seed</label>
                    <input
                      id="island-seed"
                      type="number"
                      min={0}
                      max={0x7fffffff}
                      step={1}
                      value={settings.seed}
                      onChange={(event) => updateSeed(event.currentTarget.valueAsNumber)}
                    />
                    <button
                      className={styles.seedReroll}
                      type="button"
                      title={
                        locked.has("seed") ? "Seed is locked" : "New seed"
                      }
                      aria-label="New seed"
                      disabled={locked.has("seed")}
                      onClick={newIsland}
                    >
                      <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                    <LockToggle
                      label="Seed"
                      setting="seed"
                      locked={locked.has("seed")}
                      onToggleLock={toggleLock}
                    />
                  </div>
                  <div className={styles.ranges}>
                    <RangeControl
                      label="Persistence"
                      setting="persistence"
                      value={settings.persistence}
                      min={MIN_PERSISTENCE}
                      max={MAX_PERSISTENCE}
                      step={0.01}
                      onChange={updateSetting}
                      locked={locked.has("persistence")}
                      onToggleLock={toggleLock}
                    />
                    <RangeControl
                      label="Lacunarity"
                      setting="lacunarity"
                      value={settings.lacunarity}
                      min={MIN_LACUNARITY}
                      max={MAX_LACUNARITY}
                      step={0.01}
                      onChange={updateSetting}
                      locked={locked.has("lacunarity")}
                      onToggleLock={toggleLock}
                    />
                    <RangeControl
                      label="Noise scale"
                      setting="noiseScale"
                      value={settings.noiseScale}
                      min={MIN_NOISE_SCALE}
                      max={MAX_NOISE_SCALE}
                      step={0.001}
                      display={(value) => value.toFixed(3)}
                      onChange={updateSetting}
                      locked={locked.has("noiseScale")}
                      onToggleLock={toggleLock}
                    />
                    <RangeControl
                      label="Ridginess"
                      setting="ridginess"
                      value={settings.ridginess ?? 0}
                      min={0}
                      max={1}
                      step={0.05}
                      display={(value) =>
                        value === 0 ? "Rolling" : `${Math.round(value * 100)}%`
                      }
                      onChange={updateSetting}
                      locked={locked.has("ridginess")}
                      onToggleLock={toggleLock}
                    />
                    <RangeControl
                      label="Elevation"
                      setting="elevation"
                      value={settings.elevation}
                      min={MIN_ELEVATION}
                      max={MAX_ELEVATION}
                      step={0.1}
                      display={(value) => value.toFixed(1)}
                      onChange={updateSetting}
                      locked={locked.has("elevation")}
                      onToggleLock={toggleLock}
                    />
                    <RangeControl
                      label="Island size"
                      setting="islandSize"
                      value={settings.islandSize}
                      min={MIN_ISLAND_SIZE}
                      max={MAX_ISLAND_SIZE}
                      step={0.01}
                      display={(value) => `${Math.round(value * 100)}%`}
                      onChange={updateSetting}
                      locked={locked.has("islandSize")}
                      onToggleLock={toggleLock}
                    />
                    <RangeControl
                      label="Shore softness"
                      setting="shoreSoftness"
                      value={settings.shoreSoftness ?? 0}
                      min={0}
                      max={1}
                      step={0.05}
                      display={(value) => `${Math.round(value * 100)}%`}
                      onChange={updateSetting}
                      locked={locked.has("shoreSoftness")}
                      onToggleLock={toggleLock}
                    />
                    <div className={styles.rangeDivider} role="separator" />
                    <RangeControl
                      label="X offset"
                      setting="offsetX"
                      value={settings.offsetX}
                      min={-100}
                      max={100}
                      step={0.1}
                      display={(value) => value.toFixed(1)}
                      onChange={updateSetting}
                      locked={locked.has("offsetX")}
                      onToggleLock={toggleLock}
                    />
                    <RangeControl
                      label="Y offset"
                      setting="offsetY"
                      value={settings.offsetY}
                      min={-100}
                      max={100}
                      step={0.1}
                      display={(value) => value.toFixed(1)}
                      onChange={updateSetting}
                      locked={locked.has("offsetY")}
                      onToggleLock={toggleLock}
                    />
                  </div>
                </div>
              </Accordion.Content>
            </Accordion.Item>

            <Accordion.Item value="mesh" className={styles.section}>
              <Accordion.Header>
                <Accordion.Trigger className={styles.sectionTrigger}>
                  <span>Mesh</span>
                  <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className={styles.sectionContent}>
                <div className={styles.sectionBody}>
                  <div className={styles.ranges}>
                    <RangeControl
                      label="Resolution"
                      setting="resolution"
                      value={settings.resolution}
                      min={MIN_RESOLUTION}
                      max={MAX_RESOLUTION}
                      step={RESOLUTION_STEP}
                      display={(value) =>
                        `${Math.round(value)} × ${Math.round(value)}`
                      }
                      onChange={updateSetting}
                      locked={locked.has("resolution")}
                      onToggleLock={toggleLock}
                    />
                    <RangeControl
                      label="Smoothing"
                      setting="smoothing"
                      value={settings.smoothing ?? 0}
                      min={0}
                      max={1}
                      step={0.05}
                      display={(value) => value === 0 ? "Off" : `${Math.round(value * 100)}%`}
                      onChange={updateSetting}
                      locked={locked.has("smoothing")}
                      onToggleLock={toggleLock}
                    />
                  </div>
                </div>
              </Accordion.Content>
            </Accordion.Item>

            <Accordion.Item value="scene" className={styles.section}>
              <Accordion.Header>
                <Accordion.Trigger className={styles.sectionTrigger}>
                  <span>Scene</span>
                  <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className={styles.sectionContent}>
                <div className={styles.sectionBody}>
                  <div className={styles.ranges}>
                    <RangeControl
                      label="Water level"
                      setting="waterLevel"
                      value={settings.waterLevel}
                      min={MIN_WATER_LEVEL}
                      max={MAX_WATER_LEVEL}
                      step={0.01}
                      onChange={updateSetting}
                      locked={locked.has("waterLevel")}
                      onToggleLock={toggleLock}
                    />
                  </div>
                  <div className={styles.displayControls} aria-label="Display options">
                    <button
                      className={styles.toggleButton}
                      type="button"
                      role="switch"
                      aria-checked={showWater}
                      onClick={() => setShowWater((visible) => !visible)}
                    >
                      <span>Water</span>
                      <i aria-hidden="true" />
                    </button>
                    <button
                      className={styles.toggleButton}
                      type="button"
                      role="switch"
                      aria-checked={showBiomes}
                      onClick={() => setShowBiomes((visible) => !visible)}
                    >
                      <span>Biomes</span>
                      <i aria-hidden="true" />
                    </button>
                    <button
                      className={styles.toggleButton}
                      type="button"
                      role="switch"
                      aria-checked={showTrees}
                      onClick={() => setShowTrees((visible) => !visible)}
                    >
                      <span>Trees</span>
                      <i aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>

          <button
            className={styles.exportButton}
            type="button"
            disabled={isExporting}
            onClick={() => void exportIsland()}
          >
            <Download size={14} strokeWidth={2.2} aria-hidden="true" />
            {isExporting ? "Exporting island…" : "Export island GLB"}
          </button>
        </div>
      </section>
    </main>
  )
}
