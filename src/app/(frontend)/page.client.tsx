'use client'

import { useEffect, useRef, useState, memo } from 'react'
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

const getMedia = (item: unknown): MediaType | null => {
  return item && typeof item === 'object' ? (item as MediaType) : null
}

const SplitTextTitle = memo(function SplitTextTitle({ text }: { text: string }) {
  const titleRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    if (!titleRef.current) return

    const chars = titleRef.current.querySelectorAll('.char')
    if (chars.length === 0) return

    // Set initial state (characters are already hidden via CSS)
    gsap.set(chars, {
      opacity: 0,
      color: '#b00000',
    })

    // Animate characters with random stagger
    gsap.to(chars, {
      opacity: 0.9,
      color: 'currentColor',
      duration: 1,
      ease: 'expo.inOut',
      delay: 0.2,
      stagger: () => Math.random() * 0.3,
    })
  }, [text])

  // Split text into characters, preserving spaces
  const splitText = (str: string) => {
    return str.split('').map((char, i) => (
      <span
        key={i}
        className={`char ${['r', 'g', 'b'].includes(char.toLowerCase()) ? `rgb-letter rgb-${char.toLowerCase()}` : ''}`}
        style={{ display: 'inline-block' }}
      >
        {char === ' ' ? '\u00A0' : char}
      </span>
    ))
  }

  return (
    <h1 ref={titleRef} className={styles.title}>
      {splitText(text)}
    </h1>
  )
})

type CollapsibleSectionProps = {
  isOpen: boolean
  onToggle: () => void
  onToggleRef: (el: HTMLElement | null) => void
  children: React.ReactNode
}

const CollapsibleSection = memo(function CollapsibleSection({
  isOpen,
  onToggle,
  onToggleRef,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className={styles.section} data-reveal>
      <div className={styles.sectionHeader}>
        <button className={styles.toggle} type="button" onClick={onToggle} ref={onToggleRef}>
          {isOpen ? '−' : '+'}
        </button>
      </div>
      <div className={`${styles.collapsible} ${!isOpen ? styles.collapsed : ''}`}>{children}</div>
    </div>
  )
})

const Selfie = memo(function Selfie({ image }: { image: MediaType | null }) {
  const [loaded, setLoaded] = useState(false)
  const animationControls = useAnimation()
  const animationVariants = {
    visible: { opacity: 1, filter: 'none' },
    hidden: { opacity: 0, filter: 'sepia(1) saturate(6) hue-rotate(-20deg)' },
  }

  useEffect(() => {
    if (loaded) {
      animationControls.start('visible')
    }
  }, [loaded, animationControls])

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
          key={`selfie-${image.id || image.url}`}
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
})

const ProjectItem = memo(function ProjectItem({
  title,
  description,
  url,
  image,
}: {
  title: string
  description?: string | null
  url?: string | null
  image?: MediaType | null
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (!title) return null

  return (
    <>
      <div className={styles.projectHeader} onClick={() => setIsOpen(!isOpen)}>
        <span className={styles.projectPlus}>{isOpen ? '−' : '+'}</span>
        <span className={styles.projectTitle}>{title}</span>
        {!isOpen && image?.url && (
          <div className={styles.projectHoverImage}>
            <NextImage
              key={`project-hover-${image.id || image.url}`}
              src={image.url}
              alt=""
              width={140}
              height={100}
              unoptimized
            />
          </div>
        )}
      </div>
      {isOpen && (
        <div className={styles.projectContent}>
          {image?.url && (
            <div className={styles.projectImageWrapper}>
              <NextImage
                key={`project-image-${image.id || image.url}`}
                src={image.url}
                alt={title}
                width={image.width || 600}
                height={image.height || 400}
                className={styles.projectImage}
                unoptimized
              />
            </div>
          )}
          {description && <div className={styles.projectDescription}>{description}</div>}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className={styles.pill}>
              View Project
            </a>
          )}
        </div>
      )}
    </>
  )
})

export default function PageClient({ home, info, dev, art, footer }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const GALLERY_INITIAL = 5
  const GALLERY_LOAD_MORE = 5
  const [galleryVisibleCount, setGalleryVisibleCount] = useState(GALLERY_INITIAL)
  const [open, setOpen] = useState({
    home: true,
    info: true,
    dev: true,
    art: true,
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Sequential reveal (fast + deterministic)
    const sections = Array.from(root.querySelectorAll('[data-reveal]')) as HTMLElement[]
    const tl = gsap.timeline({ defaults: { ease: 'expo.inOut' } })
    sections.forEach((el, i) => {
      tl.fromTo(
        el,
        {
          autoAlpha: 0,
          color: '#b00000',
        },
        {
          autoAlpha: 1,
          duration: 0.5,
          color: 'currentColor',
        },
        i === 0 ? 0 : '+=0.08',
      )
    })

    return () => { }
  }, [])

  const infoResumeUrl = getMedia(info.resume)?.url ?? ''
  const selfieImage = getMedia(info?.profileImage)

  const devProjects = dev.pastProjects || []
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
      <div className={styles.grainOverlay} aria-hidden="true" />
      <DotsBackground />
      <div ref={rootRef} className={styles.frame}>
        <div className={styles.topbar}>
          <div className={styles.titleWrapper}>
            <SplitTextTitle text={safeText(home.header) || 'RGBJOY'} />
          </div>
        </div>

        <CollapsibleSection
          isOpen={open.home}
          onToggle={() => toggle('home')}
          onToggleRef={(el) => {
            toggleRefs.current['toggle-home'] = el
          }}
        >
          <div className={`${styles.content} ${styles.contentNarrow}`}>
            <div>{safeText(home.subhead)}</div>
            <div>{safeText(home.intro)}</div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          isOpen={open.info}
          onToggle={() => toggle('info')}
          onToggleRef={(el) => {
            toggleRefs.current['toggle-info'] = el
          }}
        >
          <div className={styles.selfieSection}>
            <Selfie key={`selfie-${selfieImage?.id || 'none'}`} image={selfieImage} />
          </div>

          <div className={styles.twoCol}>
            <div className={styles.content}>
              <div dangerouslySetInnerHTML={{ __html: info.content_html || '' }} />
              <div className={styles.linksRow}>
                {infoResumeUrl ? (
                  <a className={styles.pill} href={infoResumeUrl} target="_blank" rel="noreferrer">
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
                <div key={`strength-${i}`} className={styles.strengthItem}>
                  <div className={styles.strengthTitle}>{s.title}</div>
                  <div className={styles.strengthList}>{s.strengthsList}</div>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          isOpen={open.dev}
          onToggle={() => toggle('dev')}
          onToggleRef={(el) => {
            toggleRefs.current['toggle-dev'] = el
          }}
        >
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
              {devProjects.map((p, i) => {
                const image = getMedia(p?.image)
                return (
                  <ProjectItem
                    key={`proj-${p?.id || i}-${image?.id || 'no-image'}`}
                    title={p?.title || ''}
                    description={p?.description}
                    url={p?.link?.url}
                    image={image}
                  />
                )
              })}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          isOpen={open.art}
          onToggle={() => toggle('art')}
          onToggleRef={(el) => {
            toggleRefs.current['toggle-art'] = el
          }}
        >
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
              .slice(0, galleryVisibleCount)
              .map((g, i) => {
                const media = getMedia(g.image)
                if (!media) return null
                const title = g.title || media?.alt || 'Untitled'

                return (
                  <div
                    key={`art-thumb-${g.id || i}-${media.id || 'no-media'}`}
                    className={styles.thumb}
                  >
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
          {artGallery.length > galleryVisibleCount ? (
            <button
              type="button"
              className={styles.loadMoreButton}
              onClick={() =>
                setGalleryVisibleCount((prev) =>
                  Math.min(prev + GALLERY_LOAD_MORE, artGallery.length),
                )
              }
            >
              Load more
            </button>
          ) : null}
        </CollapsibleSection>

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
