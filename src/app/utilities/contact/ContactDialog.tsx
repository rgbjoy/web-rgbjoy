"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { useEffect, useState } from "react"

import styles from "./ContactDialog.module.css"

type Status = "idle" | "sending" | "sent" | "error"

/** Controlled, because both the masthead invite and the menu open it. */
export function ContactDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState("")

  // Reset a moment after closing, so the form does not visibly rewind mid-fade.
  useEffect(() => {
    if (open) return
    const id = window.setTimeout(() => {
      setStatus("idle")
      setError("")
    }, 200)
    return () => window.clearTimeout(id)
  }, [open])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === "sending") return

    const data = new FormData(event.currentTarget)
    setStatus("sending")
    setError("")

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          message: data.get("message"),
          company: data.get("company"),
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(result.error ?? "Something went wrong.")
        setStatus("error")
        return
      }

      setStatus("sent")
    } catch {
      setError("Network trouble. Try again, or email directly.")
      setStatus("error")
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-describedby={undefined}
          data-lenis-prevent
        >
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>say hello to tom</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close">
              <X size={14} strokeWidth={1.75} aria-hidden />
            </Dialog.Close>
          </div>

          {status === "sent" ? (
            <div className={styles.done}>
              <p className={styles.doneLead}>thanks — that came through.</p>
              <p className={styles.doneNote}>I&rsquo;ll reply soon.</p>
            </div>
          ) : (
            <form className={styles.form} onSubmit={submit}>
              <label className={styles.field}>
                <span className={styles.label}>name</span>
                <input
                  className={styles.input}
                  name="name"
                  type="text"
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>email</span>
                <input
                  className={styles.input}
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>message</span>
                <textarea
                  className={styles.textarea}
                  name="message"
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={5}
                />
              </label>

              {/* Honeypot: hidden from people, irresistible to bots. */}
              <div className={styles.trap} aria-hidden="true">
                <label>
                  company
                  <input name="company" type="text" tabIndex={-1} />
                </label>
              </div>

              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}

              <div className={styles.actions}>
                <button
                  className={styles.submit}
                  type="submit"
                  disabled={status === "sending"}
                >
                  {status === "sending" ? "sending…" : "send"}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
