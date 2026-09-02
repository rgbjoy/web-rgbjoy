import { X } from "lucide-react"

import styles from "./page.module.css"

type HelpDrawerProps = {
  open: boolean
  onClose: () => void
}

export function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  return (
    <>
      <div
        id="decal-pole-help"
        className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`}
        // Kept mounted so it can slide, but taken out of the tab order while
        // it is off screen.
        inert={!open}
      >
        <div className={styles.drawerContent}>
          <button className={styles.drawerClose} aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>

          <h1>Decal Pole</h1>
          <p>
            A telephone pole and an endless supply of staples. Drop an image anywhere on
            the pole and it sticks where it lands, tilted a few degrees off true like
            every flyer that ever went up in a hurry. Drag to walk around it, scroll to
            climb.
          </p>
          <p>
            After a{" "}
            <a
              href="https://x.com/pushmatrix/status/1983163509073691041"
              target="_blank"
              rel="noopener noreferrer"
            >
              post by the Shopify team
            </a>
            .
          </p>

          <h2>Built with</h2>
          <ul>
            <li>React Three Fiber — React renderer for Three.js</li>
            <li>@react-three/drei — Decal projection and environment lighting</li>
          </ul>
        </div>
      </div>

      {open ? <div className={styles.drawerBackdrop} onClick={onClose} /> : null}
    </>
  )
}
