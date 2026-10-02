'use client'

import Lenis, { type VirtualScrollData } from 'lenis'
import { ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useReducedMotion } from '../../utilities/settings/useSettings'
import { ENTRIES } from './entries'
import styles from './page.module.css'
import { useTouchSelection } from './useTouchSelection'

// Returning through client navigation keeps the names visible. A fresh load
// plays the entrance again, so reloading remains an easy way to see it.
let namesIntroPlayed = false

export function EndlessScroll() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const selectButtonRef = useRef<HTMLButtonElement>(null)
  const selectedRef = useRef<number | null>(null)
  const [selected, setSelected] = useState(0)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [backgroundColor, setBackgroundColor] = useState('#d3c5ae')
  const reducedMotion = useReducedMotion()
  const touchSelection = useTouchSelection()

  const selectEntry = useCallback((index: number) => {
    if (selectedRef.current === index) return
    selectedRef.current = index
    setSelected(index)
    setBackgroundColor(ENTRIES[index].backgroundColor)
    setPreviewVisible(true)
  }, [])

  const hidePreview = useCallback(() => {
    if (selectedRef.current === null) return
    selectedRef.current = null
    setPreviewVisible(false)
  }, [])

  useLayoutEffect(() => {
    const wrapper = viewportRef.current
    const content = contentRef.current
    if (!wrapper || !content) return

    const finishIntro = () => {
      if (content.dataset.intro === 'done') return
      content.dataset.intro = 'done'
      namesIntroPlayed = true
    }
    const navigation = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    if (
      reducedMotion ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      namesIntroPlayed ||
      navigation?.type === 'back_forward'
    ) {
      finishIntro()
      return
    }

    content.dataset.intro = 'running'
    const onAnimationEnd = (event: AnimationEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest<HTMLElement>('[data-entry-index]')?.dataset.entryIndex ===
          String(ENTRIES.length - 1)
      ) {
        finishIntro()
      }
    }

    content.addEventListener('animationend', onAnimationEnd)
    wrapper.addEventListener('wheel', finishIntro, { passive: true })
    wrapper.addEventListener('pointerdown', finishIntro, { passive: true })
    wrapper.addEventListener('keydown', finishIntro)
    return () => {
      content.removeEventListener('animationend', onAnimationEnd)
      wrapper.removeEventListener('wheel', finishIntro)
      wrapper.removeEventListener('pointerdown', finishIntro)
      wrapper.removeEventListener('keydown', finishIntro)
    }
  }, [reducedMotion])

  useEffect(() => {
    const wrapper = viewportRef.current
    const content = contentRef.current
    if (!wrapper || !content) return

    const lenis = new Lenis({
      wrapper,
      content,
      infinite: true,
      smoothWheel: true,
      syncTouch: true,
      // Trackpads supply their own momentum; keep the added wheel easing brief.
      duration: reducedMotion ? 0 : 0.06,
      easing: (progress) => 1 - Math.pow(1 - progress, 3),
      lerp: reducedMotion ? 1 : 0.4,
      syncTouchLerp: reducedMotion ? 1 : 0.4,
      touchInertiaExponent: reducedMotion ? 1 : 1.25,
      // The site's setting includes both OS preferences and the manual override.
      respectReducedMotion: false,
      autoRaf: true,
      overscroll: false,
    })

    const names = Array.from(content.querySelectorAll<HTMLElement>('[data-entry-index]'))
    const firstName = names[0]
    const firstLabel = firstName.querySelector<HTMLElement>('[data-name-label]')!
    const setArrowSettled = (settled: boolean) => {
      const button = selectButtonRef.current
      if (button) button.dataset.settled = String(settled)
    }
    setArrowSettled(false)

    const getCenteredName = () => {
      const viewport = wrapper.getBoundingClientRect()
      const first = firstLabel.getBoundingClientRect()
      const rowHeight = firstName.getBoundingClientRect().height
      const center = viewport.top + viewport.height / 2
      // Every row has the same height. Count from the first visible label's
      // center, including the repeated tail, without measuring every name.
      const slot = Math.round((center - (first.top + first.height / 2)) / rowHeight)
      const name = names[Math.max(0, Math.min(names.length - 1, slot))]
      return { name, viewport, center }
    }

    const selectCenteredName = () => {
      const { name, viewport } = getCenteredName()
      selectEntry(Number(name.dataset.entryIndex))

      const button = selectButtonRef.current
      if (!button) return
      const label = name.querySelector<HTMLElement>('[data-name-label]')!.getBoundingClientRect()
      const buttonWidth = button.offsetWidth
      const buttonHeight = button.offsetHeight
      const x = Math.min(label.right + 12, viewport.right - buttonWidth - 18)
      const y = label.top + label.height / 2 - buttonHeight / 2
      button.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }

    let snapTimer: ReturnType<typeof setTimeout> | undefined
    let snapping = false
    const scheduleSnap = (delay = 140) => {
      clearTimeout(snapTimer)
      if (!touchSelection || snapping) return
      snapTimer = setTimeout(() => {
        // Wait for a brief quiet window, then recheck the gesture and momentum.
        if (lenis.isTouching || lenis.isScrolling || content.dataset.intro !== 'done') return

        const { name, center } = getCenteredName()
        const label = name.querySelector<HTMLElement>('[data-name-label]')!.getBoundingClientRect()
        const offset = label.top + label.height / 2 - center
        if (Math.abs(offset) < 1) {
          selectCenteredName()
          setArrowSettled(true)
          return
        }

        setArrowSettled(false)
        snapping = true
        // lenis.scroll is wrapped to one cycle, so the correction stays short
        // even when the centered name belongs to the repeated tail.
        lenis.scrollTo(lenis.scroll + offset, {
          immediate: reducedMotion,
          duration: 0.18,
          easing: (progress) => 1 - Math.pow(1 - progress, 3),
          onComplete: () => {
            snapping = false
            selectCenteredName()
            scheduleSnap(16)
          },
        })
      }, delay)
    }
    const cancelSnap = () => {
      clearTimeout(snapTimer)
      snapping = false
      setArrowSettled(false)
    }
    const onInput = ({ event }: VirtualScrollData) => {
      cancelSnap()
      if (event.type === 'touchend') scheduleSnap()
    }
    const onIntroEnd = () => {
      if (content.dataset.intro === 'done') scheduleSnap(16)
    }
    const onNameClick = (event: MouseEvent) => {
      if (!touchSelection || !(event.target instanceof HTMLElement)) return
      const name = event.target.closest<HTMLElement>('[data-entry-index]')
      if (!name) return

      cancelSnap()
      snapping = true
      const viewport = wrapper.getBoundingClientRect()
      const label = name.querySelector<HTMLElement>('[data-name-label]')!.getBoundingClientRect()
      const offset = label.top + label.height / 2 - (viewport.top + viewport.height / 2)
      lenis.scrollTo(lenis.scroll + offset, {
        immediate: reducedMotion,
        duration: 0.18,
        easing: (progress) => 1 - Math.pow(1 - progress, 3),
        onComplete: () => {
          snapping = false
          selectCenteredName()
          scheduleSnap(16)
        },
      })
    }

    let pointer: { x: number; y: number } | null = null
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') pointer = { x: event.clientX, y: event.clientY }
    }
    const onPointerLeave = () => {
      pointer = null
      if (!touchSelection) hidePreview()
    }
    const onScroll = () => {
      if (touchSelection) {
        selectCenteredName()
        if (!lenis.isScrolling && !lenis.isTouching) scheduleSnap()
        else {
          clearTimeout(snapTimer)
          setArrowSettled(false)
        }
        return
      }
      // Keep the preview in sync when names move beneath a stationary cursor.
      if (!pointer) return
      const row = document
        .elementFromPoint(pointer.x, pointer.y)
        ?.closest<HTMLElement>('[data-entry-index]')
      if (row) selectEntry(Number(row.dataset.entryIndex))
      else hidePreview()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      // Space activates a focused name; on the scroll region it pages the list.
      if (event.key === ' ' && (event.target as HTMLElement).closest('button')) return

      const page = wrapper.clientHeight * 0.8
      let target: number
      switch (event.key) {
        case 'ArrowDown':
          target = lenis.targetScroll + 100
          break
        case 'ArrowUp':
          target = lenis.targetScroll - 100
          break
        case 'PageDown':
          target = lenis.targetScroll + page
          break
        case 'PageUp':
          target = lenis.targetScroll - page
          break
        case ' ':
          target = lenis.targetScroll + (event.shiftKey ? -page : page)
          break
        case 'Home':
          target = 0
          break
        case 'End':
          target = lenis.limit - page
          break
        default:
          return
      }
      event.preventDefault()
      cancelSnap()
      lenis.scrollTo(target, { immediate: reducedMotion, programmatic: false })
    }

    lenis.on('scroll', onScroll)
    // Lenis interrupts a programmatic animation on new touch/wheel input.
    // Clear our pending correction at the same time so the gesture takes over.
    if (touchSelection) lenis.on('virtual-scroll', onInput)
    const onResize = () => {
      setArrowSettled(false)
      lenis.resize()
      // Align the landing position while the names are still flying in, so
      // the mobile intro finishes at the center without a second movement.
      if (content.dataset.intro !== 'done' && !lenis.isTouching && !lenis.isScrolling) {
        const { name, center } = getCenteredName()
        const label = name.querySelector<HTMLElement>('[data-name-label]')!.getBoundingClientRect()
        const offset = label.top + label.height / 2 - center
        if (Math.abs(offset) >= 1) {
          lenis.scrollTo(lenis.scroll + offset, { immediate: true })
        }
      }
      scheduleSnap(16)
    }
    let resizeFrame = requestAnimationFrame(touchSelection ? onResize : hidePreview)
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(onResize)
    })
    if (touchSelection) {
      resizeObserver.observe(wrapper)
      content.addEventListener('animationend', onIntroEnd)
    }
    wrapper.addEventListener('pointermove', onPointerMove)
    wrapper.addEventListener('pointerleave', onPointerLeave)
    wrapper.addEventListener('keydown', onKeyDown)
    wrapper.addEventListener('click', onNameClick)

    return () => {
      clearTimeout(snapTimer)
      cancelAnimationFrame(resizeFrame)
      resizeObserver.disconnect()
      content.removeEventListener('animationend', onIntroEnd)
      wrapper.removeEventListener('pointermove', onPointerMove)
      wrapper.removeEventListener('pointerleave', onPointerLeave)
      wrapper.removeEventListener('keydown', onKeyDown)
      wrapper.removeEventListener('click', onNameClick)
      lenis.destroy()
    }
  }, [reducedMotion, selectEntry, hidePreview, touchSelection])

  return (
    <main
      className={styles.main}
      style={{ backgroundColor }}
      data-touch={touchSelection}
      aria-label="Endless Scroll"
    >
      <div
        className={styles.preview}
        style={{ backgroundColor: ENTRIES[selected].previewColor }}
        data-visible={previewVisible}
        aria-hidden="true"
      />
      <p className={styles.description} id="endless-description">
        {ENTRIES[selected].description}
      </p>
      <div
        ref={viewportRef}
        className={styles.viewport}
        tabIndex={0}
        role="region"
        aria-label={
          touchSelection
            ? 'Endless names. Scroll to preview the name nearest the center.'
            : 'Endless names. Scroll or use the arrow keys to explore.'
        }
      >
        <div ref={contentRef} data-intro="pending">
          <ul className={styles.list}>
            {ENTRIES.map((entry, index) => (
              <li key={entry.name} className={styles.row}>
                <button
                  type="button"
                  className={styles.name}
                  data-entry-index={index}
                  data-active={previewVisible && selected === index}
                  aria-label={entry.name}
                  aria-describedby={`endless-description-${index}`}
                  onPointerEnter={() => {
                    if (!touchSelection) selectEntry(index)
                  }}
                  onPointerLeave={() => {
                    if (!touchSelection) hidePreview()
                  }}
                  onFocus={() => {
                    if (!touchSelection) selectEntry(index)
                  }}
                  onBlur={() => {
                    if (!touchSelection) hidePreview()
                  }}
                  onClick={() => {
                    if (!touchSelection) selectEntry(index)
                  }}
                >
                  <span className={styles.label}>
                    <span className={styles.title} data-name-label>
                      <span
                        className={styles.introText}
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        {entry.name}
                      </span>
                    </span>
                    <span
                      className={styles.rowDescription}
                      id={`endless-description-${index}`}
                    >
                      {entry.description}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* Exactly one viewport of duplicate content makes Lenis's scroll
              limit equal one list height, so both ends meet without a seam.
              Only the original list participates in keyboard navigation. */}
          <div className={styles.loopTail} aria-hidden="true">
            <div className={styles.list}>
              {ENTRIES.map((entry, index) => (
                <div key={entry.name} className={styles.row}>
                  <div
                    className={styles.name}
                    data-entry-index={index}
                    data-active={previewVisible && selected === index}
                    onPointerEnter={() => {
                      if (!touchSelection) selectEntry(index)
                    }}
                    onPointerLeave={() => {
                      if (!touchSelection) hidePreview()
                    }}
                    onPointerDown={() => {
                      if (!touchSelection) selectEntry(index)
                    }}
                  >
                    <span className={styles.label}>
                      <span className={styles.title} data-name-label>
                        <span
                          className={styles.introText}
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          {entry.name}
                        </span>
                      </span>
                      <span className={styles.rowDescription}>
                        {entry.description}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {touchSelection ? (
        <button
          ref={selectButtonRef}
          className={styles.selectButton}
          type="button"
          disabled
          data-visible={previewVisible}
          data-settled="false"
          aria-label={`Select ${ENTRIES[selected].name}`}
        >
          <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      ) : null}
      <p className={styles.hint}>Scroll endlessly ↕</p>
    </main>
  )
}
