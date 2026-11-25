"use client"

import Link from "next/link"
import { useState } from "react"
import brandStyles from "../utilities/Brand.module.css"
import { SmileIcon } from "../utilities/SmileIcon"
import { SettingsMenu } from "../utilities/settings/SettingsMenu"
import { openPalette } from "../utilities/SearchPalette/paletteState"
import { AskAboutWork } from "../utilities/AskAboutWork/AskAboutWork"
import styles from "../page.module.css"

export function StudioNav({ onContact }: { onContact: () => void }) {
  const [promptOpen, setPromptOpen] = useState(false)
  return (
    <>
      <nav className={`${styles.lockup} ${styles.lockupStuck}`} aria-label="Studio">
        <Link href="/" className={brandStyles.brand} style={{ textDecoration: "none" }}>
          <span className={brandStyles.mark}><SmileIcon size={34} /></span>
          <span className={brandStyles.wordmark}>rgbjoy</span>
        </Link>
        <div className={styles.lockupActions}>
          <button type="button" className={styles.lockupSearch} onClick={openPalette}>
            Search<span className={styles.lockupHint} aria-hidden="true">⌘F</span>
          </button>
          <SettingsMenu onContact={onContact} onSearch={openPalette} onAiPrompt={() => setPromptOpen(true)} />
        </div>
      </nav>
      <AskAboutWork open={promptOpen} onOpenChange={setPromptOpen} />
    </>
  )
}
