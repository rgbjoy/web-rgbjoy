"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { Check, Copy, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ASSISTANT_PROMPT } from "../../data/assistant-prompt"
import styles from "./AskAboutWork.module.css"

export function AskAboutWork({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "manual">("idle")
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const copyRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const firstOpenRef = useRef(true)
  const interactedOutsideRef = useRef(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (copyState === "manual") {
      promptRef.current?.focus()
      promptRef.current?.select()
    }
    if (copyState !== "copied") return
    const timer = window.setTimeout(() => setCopyState("idle"), 3000)
    return () => window.clearTimeout(timer)
  }, [copyState])

  async function copyPrompt() {
    setCopyState("copying")
    try {
      await navigator.clipboard.writeText(ASSISTANT_PROMPT)
      setCopyState("copied")
    } catch {
      setCopyState("manual")
    }
  }

  return (
    <Dialog.Root
      modal={false}
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setCopyState("idle")
        else {
          // Capture focus before Radix unmounts the content and clears its ref.
          returnFocusRef.current =
            !interactedOutsideRef.current && contentRef.current?.contains(document.activeElement)
              ? document.getElementById("site-menu-trigger")
              : null
        }
        onOpenChange(nextOpen)
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          ref={contentRef}
          className={styles.content}
          data-manual={copyState === "manual" ? "true" : undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            interactedOutsideRef.current = false
            returnFocusRef.current = null
            // The automatic greeting must not steal focus or expose the preview.
            // Reopening from the menu does move keyboard focus into the popup.
            if (!firstOpenRef.current) copyRef.current?.focus({ preventScroll: true })
            firstOpenRef.current = false
            setCopyState("idle")
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocusRef.current?.focus({ preventScroll: true })
            returnFocusRef.current = null
          }}
          onInteractOutside={() => {
            interactedOutsideRef.current = true
          }}
        >
          <Dialog.Title className={styles.srOnly}>Explore rgbjoy with AI</Dialog.Title>
          <Dialog.Description className={styles.srOnly}>
            Copy a prompt for ChatGPT or Claude. Hover or focus to preview it. Press Escape to close.
          </Dialog.Description>
          <div className={styles.bar}>
            <button
              ref={copyRef}
              className={styles.copy}
              type="button"
              onClick={copyPrompt}
              disabled={copyState === "copying"}
              aria-label="Copy prompt to explore rgbjoy with ChatGPT or Claude"
            >
              <span>{copyState === "copied" ? "prompt copied" : "explore rgbjoy with AI"}</span>
              {copyState === "copied" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            </button>
            <Dialog.Close className={styles.close} aria-label="Close prompt">
              <X size={14} strokeWidth={1.75} aria-hidden />
            </Dialog.Close>
          </div>
          <div className={styles.preview} data-lenis-prevent>
            <div className={styles.previewBody}>
              <p className={styles.caption}>
                {copyState === "manual" ? "Select and copy this prompt" : "Copy a prompt for ChatGPT or Claude"}
              </p>
              <textarea
                ref={promptRef}
                className={styles.promptText}
                aria-label="Prompt preview"
                value={ASSISTANT_PROMPT}
                readOnly
                rows={5}
              />
            </div>
          </div>
          <span className={styles.srOnly} role="status">
            {copyState === "copied" && "Prompt copied. Paste it into ChatGPT or Claude."}
            {copyState === "manual" && "Copy unavailable. The prompt is selected for manual copying."}
          </span>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
