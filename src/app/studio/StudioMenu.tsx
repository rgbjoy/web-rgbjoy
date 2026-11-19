"use client"

import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import Link from "next/link"

import menu from "../utilities/settings/SettingsMenu.module.css"
import { setMotion, useMotion } from "../utilities/settings/useSettings"
import styles from "./StudioNav.module.css"

/** The site menu's hamburger and rows, in the studio menu's glass. */
export function StudioMenu({ links, active }: { links: { label: string; id: string }[]; active: string | null }) {
  const motion = useMotion()

  return (
    // Non-modal, like the site menu, so opening it doesn't lock the page's scroll.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className={`${menu.trigger} ${styles.menu}`} aria-label="Menu">
        <span className={menu.bars} aria-hidden="true">
          <span className={menu.bar} />
          <span className={menu.bar} />
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={`${menu.content} ${styles.dropdown}`} align="end" sideOffset={14}>
          {links.map((link) => (
            <DropdownMenu.Item key={link.id} className={menu.item} asChild>
              <a href={`#${link.id}`} aria-current={active === link.id ? "location" : undefined}>
                {/* The same dash the toggles use, on the section being read. */}
                <span className={menu.mark} aria-hidden="true">
                  {active === link.id && "—"}
                </span>
                {link.label}
              </a>
            </DropdownMenu.Item>
          ))}

          <DropdownMenu.Separator className={menu.separator} />

          <DropdownMenu.Item className={menu.item} asChild>
            <Link href="/">
              <span className={menu.mark} aria-hidden="true" />
              home
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className={menu.separator} />

          <DropdownMenu.CheckboxItem
            className={menu.item}
            checked={motion === "reduced"}
            onCheckedChange={(checked) => setMotion(checked ? "reduced" : "full")}
          >
            <span className={menu.mark} aria-hidden="true">
              <DropdownMenu.ItemIndicator>—</DropdownMenu.ItemIndicator>
            </span>
            reduced motion
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
