"use client"

import { Volume2, VolumeX } from "lucide-react"
import { useEffect, useState } from "react"

import { ShaderAuroraCanvas } from "./AuroraBackground"
import { AuroraBeat } from "./beat"

import styles from "./page.module.css"

export default function Page() {
  const [beat] = useState(() => new AuroraBeat())
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const onVisibility = () => beat.setHidden(document.hidden)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      beat.dispose()
      setPlaying(false)
    }
  }, [beat])

  const toggleSound = () => {
    if (beat.playing) {
      beat.stop()
      setPlaying(false)
    } else {
      void beat.start()
      setPlaying(true)
    }
  }

  const Icon = playing ? Volume2 : VolumeX

  return (
    <main className={styles.main}>
      <ShaderAuroraCanvas beat={beat} />
      <button
        type="button"
        className={styles.sound}
        aria-pressed={playing}
        aria-label={playing ? "Mute beat" : "Play beat"}
        onClick={toggleSound}
      >
        <Icon size={14} strokeWidth={1.75} aria-hidden />
        {playing ? "sound on" : "sound off"}
      </button>
    </main>
  )
}
