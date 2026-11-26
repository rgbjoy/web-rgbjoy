"use client"

import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRef, useState } from "react"

import { setMotion, useMotion } from "./useSettings"
import styles from "./SettingsMenu.module.css"

export function SettingsMenu({
  onContact,
  onSearch,
  onAiPrompt,
}: {
  onContact: () => void
  onSearch: () => void
  onAiPrompt: () => void
}) {
  const motion = useMotion()
  const pathname = usePathname()
  const inStudio = pathname === "/studio"
  const [open, setOpen] = useState(false)
  // The menu lives in the shell and outlives the route. A history swipe or
  // ⌘[ changes the page without any event Radix would close on, so close it
  // here on every route change rather than letting it reopen on the way back.
  const [openPath, setOpenPath] = useState(pathname)
  if (openPath !== pathname) {
    setOpenPath(pathname)
    setOpen(false)
  }
  const openingPromptRef = useRef(false)

  return (
    /* Non-modal on purpose. The modal default locks scrolling by setting
       `overflow: hidden` on <body>, which makes body the scrollport — and the
       sticky lockup this trigger lives in then resolves against an unscrolled
       container and drops to its natural position far above the viewport,
       dragging the menu off-screen with it. */
    <DropdownMenu.Root
      modal={false}
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenu.Trigger id="site-menu-trigger" className={styles.trigger} aria-label="Menu">
        {/* Two bars rather than an icon font, so they can cross into an X on open. */}
        <span className={styles.bars} aria-hidden="true">
          <span className={styles.bar} />
          <span className={styles.bar} />
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.content}
          align="end"
          sideOffset={10}
          onCloseAutoFocus={(event) => {
            if (openingPromptRef.current) event.preventDefault()
            openingPromptRef.current = false
          }}
        >
          {/* The studio page's only way in: it isn't listed anywhere else. */}
          <DropdownMenu.Item className={styles.item} asChild>
            <Link
              href={inStudio ? "/" : "/studio"}
              onClickCapture={() => setOpen(false)}
            >
              <span className={styles.mark} aria-hidden="true" />
              {inStudio ? "home" : "studio"}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item className={styles.item} onSelect={onSearch}>
            <span className={styles.mark} aria-hidden="true" />
            search
            <span className={styles.hint} aria-hidden="true">
              ⌘F
            </span>
          </DropdownMenu.Item>

          <DropdownMenu.Item className={styles.item} onSelect={onContact}>
            <span className={styles.mark} aria-hidden="true" />
            contact
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={styles.item}
            onSelect={() => {
              openingPromptRef.current = true
              onAiPrompt()
            }}
          >
            <span className={styles.mark} aria-hidden="true" />
            AI prompt
          </DropdownMenu.Item>

          <DropdownMenu.Separator className={styles.separator} />

          <DropdownMenu.CheckboxItem
            className={styles.item}
            checked={motion === "reduced"}
            onCheckedChange={(checked) =>
              setMotion(checked ? "reduced" : "full")
            }
          >
            <span className={styles.mark} aria-hidden="true">
              <DropdownMenu.ItemIndicator>—</DropdownMenu.ItemIndicator>
            </span>
            reduced motion
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
