"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { Check, Copy, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ASSISTANT_PROMPT } from "../../data/assistant-prompt"
// The contact form's frame — overlay, glass panel, header, send button — so the
// two popups the menu opens read as one family.
import frame from "../contact/ContactDialog.module.css"
import styles from "./AiPromptDialog.module.css"

type CopyState = "idle" | "copying" | "copied" | "manual"

/**
 * The AI prompt as a popup, for when someone asks for it from the menu. The
 * homepage's corner pill (AskAboutWork) is the unasked-for greeting; this is
 * the same prompt, given room.
 */
export function AiPromptDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle")
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const copyRef = useRef<HTMLButtonElement>(null)

  // Reset a moment after closing, so the button does not visibly rewind mid-fade.
  useEffect(() => {
    if (open) return
    const id = window.setTimeout(() => setCopyState("idle"), 200)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (copyState === "manual") {
      promptRef.current?.focus()
      promptRef.current?.select()
    }
    if (copyState !== "copied") return
    const id = window.setTimeout(() => setCopyState("idle"), 3000)
    return () => window.clearTimeout(id)
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={frame.overlay} />
        <Dialog.Content
          className={frame.content}
          data-lenis-prevent
          onOpenAutoFocus={(event) => {
            // Straight to the one action, rather than the close button first in order.
            event.preventDefault()
            copyRef.current?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(event) => {
            // The menu item that opened it is gone by now; go back to the menu.
            event.preventDefault()
            document.getElementById("site-menu-trigger")?.focus({ preventScroll: true })
          }}
        >
          <div className={frame.header}>
            <Dialog.Title className={frame.title}>explore rgbjoy with AI</Dialog.Title>
            <Dialog.Close className={frame.close} aria-label="Close">
              <X size={14} strokeWidth={1.75} aria-hidden />
            </Dialog.Close>
          </div>

          <div className={styles.body}>
            <Dialog.Description className={styles.lead}>
              {copyState === "manual"
                ? "Select and copy this prompt, then paste it into ChatGPT or Claude."
                : "Paste this into ChatGPT or Claude for a guided tour of the work."}
            </Dialog.Description>

            <textarea
              ref={promptRef}
              className={styles.prompt}
              aria-label="Prompt"
              value={ASSISTANT_PROMPT}
              readOnly
              rows={4}
            />

            <div className={frame.actions}>
              <button
                ref={copyRef}
                className={frame.submit}
                type="button"
                onClick={copyPrompt}
                disabled={copyState === "copying"}
              >
                <span className={styles.copyLabel}>
                  {copyState === "copied" ? "copied" : "copy prompt"}
                  {copyState === "copied" ? (
                    <Check size={14} strokeWidth={1.75} aria-hidden />
                  ) : (
                    <Copy size={14} strokeWidth={1.75} aria-hidden />
                  )}
                </span>
              </button>
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
