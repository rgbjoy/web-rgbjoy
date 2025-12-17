'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import NextImage from 'next/image'
import { motion, useAnimation } from 'framer-motion'

import Media from '@/app/(frontend)/components/media'
import LightBox from '@/app/(frontend)/components/lightbox'
import DotsBackground from '@/app/(frontend)/components/DotsBackground'

import type { Art, Dev, Footer, Home, Info, Media as MediaType } from '@payload-types'

import styles from './page.module.scss'

type Props = {
  home: Home
  info: Info & { content_html?: string }
  dev: Dev & { content_html?: string }
  art: Art & { content_html?: string }
  footer: Footer
}

const safeText = (s?: string | null) => (s ?? '').trim()

export default function PageClient({ home, info, dev, art, footer }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState({
    home: true,
    info: true,
    dev: true,
    art: true,
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Sequential reveal (fast + deterministic)
    const sections = Array.from(root.querySelectorAll('[data-reveal]')) as HTMLElement[]
    if (!reduceMotion) {
      gsap.set(sections, { autoAlpha: 0, y: 10 })
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })
      sections.forEach((el, i) => {
        tl.to(
          el,
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.35,
          },
          i === 0 ? 0 : '+=0.08',
        )
      })
    }

    return () => {}
  }, [])

  const infoResumeUrl =
    info.resume && typeof info.resume === 'object' ? ((info.resume as MediaType).url ?? '') : ''

  const Selfie = () => {
    const [loaded, setLoaded] = useState(false)
    const animationControls = useAnimation()
    const animationVariants = {
      visible: { opacity: 1 },
      hidden: { opacity: 0 },
    }

    useEffect(() => {
      if (loaded) {
        animationControls.start('visible')
      }
    }, [loaded, animationControls])

    const image =
      info?.profileImage && typeof info.profileImage === 'object'
        ? (info.profileImage as MediaType)
        : null

    if (!image) {
      return null
    }

    return (
      <div className={styles.selfieWrapper}>
        <motion.div
          initial={'hidden'}
          animate={animationControls}
          variants={animationVariants}
          transition={{ ease: 'easeOut', duration: 1, delay: 1 }}
        >
          <NextImage
            src={image.sizes?.card?.url ?? image.url ?? ''}
            alt={image.alt ?? ''}
            width={image.width ?? 0}
            height={image.height ?? 0}
            onLoad={() => setLoaded(true)}
            priority
            unoptimized
          />
        </motion.div>
      </div>
    )
  }

  const devProjects = dev.pastProjects || []
  const devPlayground = dev.playground || []
  const artGallery = art.gallery || []

  const toggleRefs = useRef<Record<string, HTMLElement | null>>({})

  const toggle = (key: keyof typeof open) => {
    setOpen((prev) => {
      const newState = { ...prev, [key]: !prev[key] }
      const toggleEl = toggleRefs.current[`toggle-${key}`]
      if (toggleEl) {
        gsap.to(toggleEl, {
          scale: 0.8,
          opacity: 0.5,
          duration: 0.1,
          ease: 'power2.out',
          onComplete: () => {
            gsap.to(toggleEl, {
              scale: 1,
              opacity: 1,
              duration: 0.15,
              ease: 'power2.out',
            })
          },
        })
      }
      return newState
    })
  }

  return (
    <div className={`${styles.home}`}>
      <DotsBackground />
      <div className={styles.previewImageContainer}>
        {devProjects.slice(0, 6).map((p, i) => {
          const image = p?.image && typeof p.image === 'object' ? (p.image as MediaType) : null
          if (image?.url) {
            return (
              <NextImage
                key={`preview-${i}`}
                src={image.url}
                alt={p?.title || ''}
                width={300}
                height={200}
                quality={75}
                className={`${styles.previewImage} preview-${i}`}
                unoptimized
              />
            )
          }
          return null
        })}
      </div>
      <div ref={rootRef} className={styles.frame}>
        <div className={styles.topbar} data-reveal>
          <div className={styles.title}>{safeText(home.header) || 'RGBJOY'}</div>
        </div>

        <div className={styles.section} data-reveal>
          <div className={styles.sectionHeader}>
            <button
              className={styles.toggle}
              type="button"
              onClick={() => toggle('home')}
              ref={(el) => {
                toggleRefs.current['toggle-home'] = el
              }}
            >
              {open.home ? '−' : '+'}
            </button>
          </div>

          {open.home && (
            <div className={styles.collapsible}>
              <div className={`${styles.content} ${styles.contentNarrow}`}>
                <div>{safeText(home.subhead)}</div>
                <div>{safeText(home.intro)}</div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.section} data-reveal>
          <div className={styles.sectionHeader}>
            <button
              className={styles.toggle}
              type="button"
              onClick={() => toggle('info')}
              ref={(el) => {
                toggleRefs.current['toggle-info'] = el
              }}
            >
              {open.info ? '−' : '+'}
            </button>
          </div>

          {open.info && (
            <div className={styles.collapsible}>
              <div className={styles.selfieSection}>
                <Selfie />
              </div>

              <div className={styles.twoCol}>
                <div className={styles.content}>
                  <div dangerouslySetInnerHTML={{ __html: info.content_html || '' }} />
                  <div className={styles.linksRow}>
                    {infoResumeUrl ? (
                      <a
                        className={styles.pill}
                        href={infoResumeUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Resume
                      </a>
                    ) : null}
                    {info.links?.map((v, i) => {
                      const title = v?.link?.title || ''
                      const url = v?.link?.url || ''
                      if (!title || !url) return null
                      return (
                        <a
                          key={`info-link-${i}`}
                          className={styles.pill}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {title}
                        </a>
                      )
                    })}
                  </div>
                </div>

                <div className={styles.content}>
                  {info.strengths?.map((s, i) => (
                    <div key={`strength-${i}`}>
                      <div>{s.title}</div>
                      <div>{s.strengthsList}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.section} data-reveal>
          <div className={styles.sectionHeader}>
            <button
              className={styles.toggle}
              type="button"
              onClick={() => toggle('dev')}
              ref={(el) => {
                toggleRefs.current['toggle-dev'] = el
              }}
            >
              {open.dev ? '−' : '+'}
            </button>
          </div>

          {open.dev && (
            <div className={styles.collapsible}>
              <div
                className={`${styles.content} ${styles.contentNarrow}`}
                dangerouslySetInnerHTML={{ __html: dev.content_html || '' }}
              />

              <div>
                <div className={`${styles.muted} ${styles.devSubSectionLabel}`}>Projects</div>
                <div className={styles.list}>
                  {devProjects.length === 0 ? (
                    <div className={styles.muted}>No projects yet.</div>
                  ) : null}
                  {devProjects.slice(0, 6).map((p, i) => {
                    const url = p?.link?.url || ''
                    const title = p?.title || ''
                    const desc = p?.description || ''
                    const image =
                      p?.image && typeof p.image === 'object' ? (p.image as MediaType) : null
                    if (!title) return null
                    return (
                      <a
                        key={`proj-${i}`}
                        className={styles.item}
                        href={url || '/dev'}
                        target="_blank"
                        rel="noreferrer"
                        onMouseMove={(e) => {
                          if (image) {
                            const preview = document.querySelector(`.preview-${i}`) as HTMLElement
                            if (preview) {
                              preview.style.left = `${e.clientX + 15}px`
                              preview.style.top = `${e.clientY + 15}px`
                              preview.style.display = 'block'
                            }
                          }
                        }}
                        onMouseLeave={() => {
                          const preview = document.querySelector(`.preview-${i}`) as HTMLElement
                          if (preview) {
                            preview.style.display = 'none'
                          }
                        }}
                      >
                        <div className={styles.itemInner}>
                          <div>{title}</div>
                          {desc ? <div className={styles.muted}>{desc}</div> : null}
                        </div>
                      </a>
                    )
                  })}
                </div>
              </div>

              <div className={styles.devSubSection}>
                <div className={`${styles.muted} ${styles.devSubSectionLabel}`}>Playground</div>
                <div className={styles.list}>
                  {devPlayground.length === 0 ? (
                    <div className={styles.muted}>No playground items yet.</div>
                  ) : null}
                  {devPlayground.slice(0, 6).map((p, i) => {
                    const url = p?.link?.url || ''
                    const title = p?.title || ''
                    const desc = p?.description || ''
                    if (!title) return null
                    return (
                      <a
                        key={`play-${i}`}
                        className={styles.item}
                        href={url || '/dev'}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className={styles.itemInner}>
                          <div>{title}</div>
                          {desc ? <div className={styles.muted}>{desc}</div> : null}
                        </div>
                      </a>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.section} data-reveal>
          <div className={styles.sectionHeader}>
            <button
              className={styles.toggle}
              type="button"
              onClick={() => toggle('art')}
              ref={(el) => {
                toggleRefs.current['toggle-art'] = el
              }}
            >
              {open.art ? '−' : '+'}
            </button>
          </div>

          {open.art && (
            <div className={styles.collapsible}>
              <div
                className={`${styles.content} ${styles.contentNarrow}`}
                dangerouslySetInnerHTML={{ __html: art.content_html || '' }}
              />
              {artGallery.length === 0 ? (
                <div className={styles.muted}>No gallery items yet.</div>
              ) : null}
              <div className={styles.galleryGrid}>
                {artGallery
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((g, i) => {
                    const media =
                      g.image && typeof g.image === 'object' ? (g.image as MediaType) : null
                    if (!media) return null
                    const title = g.title || media?.alt || 'Untitled'

                    return (
                      <div key={`art-thumb-${i}`} className={styles.thumb}>
                        <LightBox media={g}>
                          <div className={styles.thumbMedia}>
                            <Media media={media} thumbnail />
                          </div>
                          <div className={styles.thumbCaption}>{title}</div>
                        </LightBox>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>

        {footer?.links && footer.links.length > 0 && (
          <div className={`${styles.section} ${styles.footerSection}`} data-reveal>
            <div className={styles.linksRow}>
              {footer.links.map((v, i) => {
                const title = v?.title || ''
                const url = v?.link || ''
                if (!title || !url) return null
                return (
                  <a
                    key={`footer-link-${i}`}
                    className={styles.pill}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {title}
                  </a>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
