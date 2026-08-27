"use client"

import * as DropdownMenu from "@radix-ui/react-dropdown-menu"

import { setMotion, setTheme, useMotion, useTheme } from "./useSettings"
import styles from "./SettingsMenu.module.css"

export function SettingsMenu({
  onContact,
  onSearch,
}: {
  onContact: () => void
  onSearch: () => void
}) {
  const theme = useTheme()
  const motion = useMotion()

  return (
    /* Non-modal on purpose. The modal default locks scrolling by setting
       `overflow: hidden` on <body>, which makes body the scrollport — and the
       sticky lockup this trigger lives in then resolves against an unscrolled
       container and drops to its natural position far above the viewport,
       dragging the menu off-screen with it. */
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className={styles.trigger} aria-label="Settings">
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
        >
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

          <DropdownMenu.CheckboxItem
            className={styles.item}
            checked={theme === "light"}
            onCheckedChange={(checked) => setTheme(checked ? "light" : "dark")}
          >
            <span className={styles.mark} aria-hidden="true">
              <DropdownMenu.ItemIndicator>—</DropdownMenu.ItemIndicator>
            </span>
            light mode
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
