"use client"

import { Canvas } from "@react-three/fiber"
import Image from "next/image"
import { Fragment, useEffect, useRef, useState } from "react"

import { IMAGE, IMAGE_AFTER, LEDE, PARAGRAPHS, TITLE } from "./content"
import { BOTTOM_PADDING, ReadingGlassScene, TOP_PADDING } from "./ReadingGlassScene"
import styles from "./page.module.css"

export default function Page() {
  const scrollRef = useRef(0)
  const [textHeight, setTextHeight] = useState(2000)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      scrollRef.current = window.scrollY
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Preload the figure before mounting WebGL so the first painted frame is
  // already complete — avoids a text-only flash and a second pop when the image arrives.
  useEffect(() => {
    const img = new window.Image()
    img.onload = () => setImage(img)
    img.src = IMAGE.src
  }, [])

  return (
    <main className={styles.main}>
      <div className={`${styles.canvasWrap}${canvasReady ? ` ${styles.ready}` : ""}`}>
        {image ? (
          <Canvas
            orthographic
            frameloop="demand"
            camera={{ zoom: 1, position: [0, 0, 500], near: 1, far: 2000 }}
            gl={{ antialias: false }}
            dpr={[1, 1.5]}
          >
            <ReadingGlassScene
              scrollRef={scrollRef}
              image={image}
              onHeight={setTextHeight}
              onReady={() => setCanvasReady(true)}
            />
          </Canvas>
        ) : null}
      </div>

      {/* The real, crawlable, accessible article. It is the document's scroll
          content and source of truth; the canvas above renders the glass effect
          from the same text/image. Sits behind the opaque canvas visually. */}
      <div
        className={styles.content}
        style={{ height: textHeight + TOP_PADDING + BOTTOM_PADDING }}
      >
        <article
          className={styles.article}
          style={{ paddingTop: TOP_PADDING, paddingBottom: BOTTOM_PADDING }}
        >
          <h1 className={styles.title}>{TITLE}</h1>
          <p className={styles.lede}>{LEDE}</p>
          {PARAGRAPHS.map((text, i) => (
            <Fragment key={i}>
              <p>{text}</p>
              {i === IMAGE_AFTER ? (
                <Image
                  className={styles.image}
                  src={IMAGE.src}
                  alt={IMAGE.alt}
                  width={IMAGE.width}
                  height={IMAGE.height}
                />
              ) : null}
            </Fragment>
          ))}
        </article>
      </div>
    </main>
  )
}
