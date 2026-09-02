"use client"

import { Canvas } from "@react-three/fiber/webgpu"
import { Dices, Download, Minus, Plus, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { exportIslandGlb } from "./exportIsland"
import { IslandScene } from "./IslandScene"
import styles from "./page.module.css"
import {
  DEFAULT_ISLAND_SETTINGS,
  MAX_ELEVATION,
  MAX_ISLAND_SIZE,
  MAX_RESOLUTION,
  MAX_WATER_LEVEL,
  MIN_ELEVATION,
  MIN_ISLAND_SIZE,
  MIN_RESOLUTION,
  MIN_WATER_LEVEL,
  RESOLUTION_STEP,
  type IslandSettings,
} from "./terrain"

type NumericSetting = Exclude<keyof IslandSettings, "seed">

type RangeControlProps = {
  label: string
  setting: NumericSetting
  value: number
  min: number
  max: number
  step: number
  display?: (value: number) => string
  onChange: (setting: NumericSetting, value: number) => void
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
}: RangeControlProps) {
  const id = `island-${setting}`

  return (
    <label className={styles.rangeControl} htmlFor={id}>
      <span>
        {label}
        <output htmlFor={id}>{display(value)}</output>
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
    </label>
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

export default function Page() {
  const [settings, setSettings] = useState<IslandSettings>(
    DEFAULT_ISLAND_SETTINGS,
  )
  const [isExporting, setIsExporting] = useState(false)
  const [showWater, setShowWater] = useState(true)
  const [showBiomes, setShowBiomes] = useState(true)
  const [controlsOpen, setControlsOpen] = useState(true)
  const [webgpu, setWebgpu] = useState<boolean | null>(null)

  useEffect(() => {
    setWebgpu(Boolean(navigator.gpu))
  }, [])

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

  const newIsland = useCallback(() => {
    setSettings((current) => ({ ...current, seed: randomSeed() }))
  }, [])

  const randomizeIsland = useCallback(() => {
    setSettings((current) => ({
      ...current,
      seed: randomSeed(),
      persistence: randomRange(0.1, 1.7, 2),
      lacunarity: randomRange(1.2, 2.32, 2),
      noiseScale: randomRange(0.02, 0.152, 3),
      elevation: randomRange(MIN_ELEVATION, MAX_ELEVATION, 1),
      islandSize: randomRange(MIN_ISLAND_SIZE, MAX_ISLAND_SIZE, 2),
    }))
  }, [])

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
      {webgpu === false ? (
        <p className={styles.fallback}>
          This island needs WebGPU. Try Chrome or Edge, or enable WebGPU in
          Safari.
        </p>
      ) : webgpu ? (
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
          />
        </Canvas>
      ) : null}

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
          {controlsOpen ? (
            <div className={styles.panelActions}>
              <button type="button" onClick={newIsland}>
                <RefreshCw size={14} strokeWidth={2.2} aria-hidden="true" />
                New island
              </button>
              <button type="button" onClick={randomizeIsland}>
                <Dices size={14} strokeWidth={2.2} aria-hidden="true" />
                Randomize
              </button>
            </div>
          ) : null}
        </div>

        <div id="island-controls-body" hidden={!controlsOpen}>
        <label className={styles.seedControl} htmlFor="island-seed">
          <span>Seed</span>
          <input
            id="island-seed"
            type="number"
            min={0}
            max={0x7fffffff}
            step={1}
            value={settings.seed}
            onChange={(event) => updateSeed(event.currentTarget.valueAsNumber)}
          />
        </label>

        <div className={styles.ranges}>
          <RangeControl
            label="Persistence"
            setting="persistence"
            value={settings.persistence}
            min={0.1}
            max={1.7}
            step={0.01}
            onChange={updateSetting}
          />
          <RangeControl
            label="Lacunarity"
            setting="lacunarity"
            value={settings.lacunarity}
            min={1.2}
            max={2.32}
            step={0.01}
            onChange={updateSetting}
          />
          <RangeControl
            label="Noise scale"
            setting="noiseScale"
            value={settings.noiseScale}
            min={0.02}
            max={0.152}
            step={0.001}
            display={(value) => value.toFixed(3)}
            onChange={updateSetting}
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
          />
          <RangeControl
            label="Water level"
            setting="waterLevel"
            value={settings.waterLevel}
            min={MIN_WATER_LEVEL}
            max={MAX_WATER_LEVEL}
            step={0.01}
            onChange={updateSetting}
          />
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
        </div>

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
