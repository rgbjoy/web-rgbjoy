"use client"

import { ArrowDown, ChevronUp } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { SITE } from "../data/site"
import { ContactDialog } from "../utilities/contact/ContactDialog"
import { useReducedMotion } from "../utilities/settings/useSettings"
import { useSiteShell } from "../utilities/SiteShell"
import {
  CARE_PLANS,
  confirmedOnly,
  DEFAULT_SELECTION,
  describe,
  DESIGNS,
  estimate,
  FEATURES,
  formatPrice,
  formatRange,
  formatWeeks,
  isIncluded,
  RUSH,
  SITE_TYPES,
  SIZES,
  stepsFor,
  type Range,
  type Selection,
  type Step,
} from "./pricing"
import styles from "./page.module.css"
import { DETAILS, PROCESS } from "./content"
import { useSectionReveal } from "./useSectionReveal"

/** Tom, cut out on a transparent ground, beside the part where he says who he is. Width and height are the file's own. */
const PORTRAIT = {
  src: "/portrait.webp",
  alt: "Tom Fletcher",
  width: 452,
  height: 365,
}

/** What the size question counts, since page count is the wrong measure. */
const SIZE_HINTS = {
  layouts:
    "Count the different kinds of page, not the pages. A home page, a services page and a contact page are three layouts. Fifty blog posts or a dozen team bios share one layout each.",
  screens: "Each different screen someone moves through, like sign in, a dashboard, a list, a detail view and settings.",
}

const pad2 = (n: number) => String(n).padStart(2, "0")

/** What an option adds; nothing to show for one that adds nothing. */
const plus = (price: Range) => (price[1] === 0 ? undefined : `+${formatRange(price)}`)

/** Same shape as the index's section headings: name, a rule, a number. */
function SectionHeading({ id, index, children }: { id: string; index: number; children: ReactNode }) {
  return (
    <h2 id={id} className={styles.heading}>
      <span className={styles.headingName}>{children}</span>
      <span className={styles.headingRule} aria-hidden="true" />
      <span className={styles.headingIndex}>{pad2(index)}</span>
    </h2>
  )
}

/** A native radio or checkbox, hidden behind a row that shows its state. */
function Choice({
  type,
  name,
  checked,
  disabled,
  onChange,
  label,
  description,
  aside,
}: {
  type: "radio" | "checkbox"
  name: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
  label: string
  description?: string
  aside?: string
}) {
  return (
    <label className={styles.choice}>
      <input
        className={styles.native}
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className={styles.mark} aria-hidden="true">
        {checked ? "—" : ""}
      </span>
      <span className={styles.choiceBody}>
        <span className={styles.choiceLabel}>{label}</span>
        {description && <span className={styles.choiceDescription}>{description}</span>}
      </span>
      {aside && <span className={styles.choiceAside}>{aside}</span>}
    </label>
  )
}

/** How long a step takes to fold; matches .questionBody's transition. */
const FOLD_MS = 280

/** One question: open while it's answered, then locked and folded to its answer once confirmed. */
function Question({
  id,
  index,
  title,
  hint,
  state,
  answer,
  canConfirm,
  onConfirm,
  onReopen,
  sectionRef,
  children,
}: {
  id: Step
  index: number
  title: string
  hint?: string
  state: "open" | "done" | "upcoming"
  answer: string
  canConfirm: boolean
  onConfirm: () => void
  onReopen: () => void
  sectionRef: (node: HTMLElement | null) => void
  children: ReactNode
}) {
  const open = state === "open"
  const titleId = `step-${id}`
  return (
    <section
      ref={sectionRef}
      className={`${styles.question} ${open ? styles.questionOpen : ""} ${state === "upcoming" ? styles.questionUpcoming : ""}`}
      aria-labelledby={titleId}
    >
      <div className={styles.questionHeader}>
        <span className={styles.questionIndex}>{pad2(index)}</span>
        <h3 id={titleId} className={styles.questionTitle}>
          {title}
        </h3>
        {state === "done" && (
          <>
            <span className={styles.questionAnswer}>{answer}</span>
            <button
              type="button"
              className={styles.change}
              onClick={onReopen}
              aria-label={`Change your answer to “${title}”`}
            >
              change
            </button>
          </>
        )}
      </div>
      {/* Folded rather than unmounted, so it can animate; inert keeps a folded answer locked. */}
      <div className={styles.questionBody} inert={!open ? true : undefined}>
        <div className={styles.questionInner}>
          <fieldset className={styles.fieldset} aria-labelledby={titleId}>
            {hint && <p className={styles.hint}>{hint}</p>}
            {children}
          </fieldset>
          <div className={styles.questionActions}>
            <button type="button" className={styles.confirm} disabled={!canConfirm} onClick={onConfirm}>
              confirm
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export function Estimator() {
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION)
  const [confirmed, setConfirmed] = useState<ReadonlySet<Step>>(() => new Set())
  const [editing, setEditing] = useState<Step | null>(null)
  const [contactOpen, setContactOpen] = useState(false)
  const { registerHandlers } = useSiteShell()

  useEffect(
    () => registerHandlers({ onContact: () => setContactOpen(true) }),
    [registerHandlers],
  )
  /** Whether the summary is on screen or scrolled past, so the pinned total pointing down at it can step aside. */
  const [summaryReached, setSummaryReached] = useState(false)
  /** Narrow screens only: the pinned total enlarged in place, so the breakdown can be read without leaving the question in hand. */
  const [peekOpen, setPeekOpen] = useState(false)
  const peekToggle = useRef<HTMLButtonElement>(null)
  const reducedMotion = useReducedMotion()
  const pageRef = useRef<HTMLDivElement>(null)
  useSectionReveal(pageRef, reducedMotion)
  const sections = useRef(new Map<Step, HTMLElement>())
  const summaryRef = useRef<HTMLElement>(null)
  const estimateRef = useRef<HTMLElement>(null)
  /** The estimate sits at the bottom now, so the pinned total waits until it's on screen. */
  const [estimateInView, setEstimateInView] = useState(false)
  /** Set by confirming or reopening, so what opens next takes focus — but not on first load. */
  const moved = useRef(false)

  const type = SITE_TYPES.find((item) => item.id === selection.type)
  const steps = stepsFor(selection.type)
  // One step open at a time: the one being changed, else the first still unanswered.
  const active = editing ?? steps.find((step) => !confirmed.has(step)) ?? null
  const complete = active === null
  // The total previews the open step as it stands, on top of what's confirmed;
  // whatever that adds shows as pending until it's confirmed.
  const counted = active ? new Set(confirmed).add(active) : confirmed
  const priced = type !== undefined && counted.has("type")
  const result = estimate(confirmedOnly(selection, counted))
  const settledLines = new Set(
    confirmed.has("type") ? estimate(confirmedOnly(selection, confirmed)).lines.map((line) => line.label) : [],
  )
  const included = priced ? FEATURES.filter((feature) => isIncluded(feature, type.id)) : []
  const settled = steps.filter((step) => confirmed.has(step) && step !== active).length
  const plan = CARE_PLANS.find((item) => item.id === selection.care) ?? CARE_PLANS[0]

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    // Once the step above has folded, or the scroll aims where things were.
    const id = window.setTimeout(() => {
      const behavior = reducedMotion ? "auto" : "smooth"
      if (active) {
        const section = sections.current.get(active)
        section?.scrollIntoView({ block: "nearest", behavior })
        // The current answer when there is one, as a radio group expects.
        const input =
          section?.querySelector<HTMLInputElement>("input:checked:not(:disabled)") ??
          section?.querySelector<HTMLInputElement>("input:not(:disabled)")
        input?.focus({ preventScroll: true })
      } else {
        summaryRef.current?.scrollIntoView({ block: "nearest", behavior })
        summaryRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true })
      }
    }, FOLD_MS)
    return () => window.clearTimeout(id)
  }, [active, reducedMotion])

  useEffect(() => {
    const summary = summaryRef.current
    if (!summary) return
    const observer = new IntersectionObserver(([entry]) => {
      const reached = entry.isIntersecting || entry.boundingClientRect.top < 0
      setSummaryReached(reached)
      // The full summary is in view now; come back up as a pill, not still enlarged over the questions.
      if (reached) setPeekOpen(false)
    })
    observer.observe(summary)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const section = estimateRef.current
    if (!section) return
    const observer = new IntersectionObserver(([entry]) => setEstimateInView(entry.isIntersecting))
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const peekAway = summaryReached || !estimateInView

  const set = (changes: Partial<Selection>) => setSelection((current) => ({ ...current, ...changes }))
  const toggleFeature = (id: string) =>
    setSelection((current) => ({
      ...current,
      features: current.features.includes(id)
        ? current.features.filter((feature) => feature !== id)
        : [...current.features, id],
    }))
  const confirm = (step: Step) => {
    moved.current = true
    // The next question takes the screen (and focus); fold the breakdown away with this one.
    setPeekOpen(false)
    setConfirmed((current) => new Set(current).add(step))
    setEditing(null)
  }
  const closePeek = () => {
    setPeekOpen(false)
    peekToggle.current?.focus({ preventScroll: true })
  }
  const reopen = (step: Step) => {
    moved.current = true
    setEditing(step)
  }

  const chosenFeatures = FEATURES.filter(
    (feature) => selection.features.includes(feature.id) && !(type && isIncluded(feature, type.id)),
  )

  const question = (step: Step): { title: string; hint?: string; answer: string; canConfirm?: boolean; body: ReactNode } => {
    switch (step) {
      case "type":
        return {
          title: "what are we building?",
          answer: type?.label ?? "",
          canConfirm: type !== undefined,
          body: SITE_TYPES.map((item) => (
            <Choice
              key={item.id}
              type="radio"
              name="type"
              checked={selection.type === item.id}
              onChange={() => set({ type: item.id })}
              label={item.label}
              description={item.description}
              aside={`from ${formatPrice(item.price[0])}`}
            />
          )),
        }
      case "size":
        return {
          title: `how many ${type?.unit ?? "layouts"}?`,
          hint: SIZE_HINTS[type?.unit ?? "layouts"],
          answer: `${SIZES.find((size) => size.id === selection.size)?.label ?? ""} ${type?.unit ?? ""}`,
          body: (
            <div className={styles.chips}>
              {SIZES.map((size) => (
                <label key={size.id} className={styles.chip}>
                  <input
                    className={styles.native}
                    type="radio"
                    name="size"
                    checked={selection.size === size.id}
                    onChange={() => set({ size: size.id })}
                  />
                  {size.label}
                </label>
              ))}
            </div>
          ),
        }
      case "design":
        return {
          title: "design",
          answer: DESIGNS.find((design) => design.id === selection.design)?.label ?? "",
          body: DESIGNS.map((design) => (
            <Choice
              key={design.id}
              type="radio"
              name="design"
              checked={selection.design === design.id}
              onChange={() => set({ design: design.id })}
              label={design.label}
              description={design.description}
              aside={plus(design.price)}
            />
          )),
        }
      case "features":
        return {
          title: "anything else?",
          hint: "Pick as many as you like, or none.",
          answer: chosenFeatures.length ? chosenFeatures.map((feature) => feature.label).join(", ") : "nothing extra",
          body: FEATURES.map((feature) => {
            const builtIn = type !== undefined && isIncluded(feature, type.id)
            return (
              <Choice
                key={feature.id}
                type="checkbox"
                name="features"
                checked={builtIn || selection.features.includes(feature.id)}
                disabled={builtIn}
                onChange={() => toggleFeature(feature.id)}
                label={feature.label}
                aside={builtIn ? "included" : plus(feature.price)}
              />
            )
          }),
        }
      case "timing":
        return {
          title: "timing",
          answer: selection.rush ? "Need it soon" : "No rush",
          body: (
            <>
              <Choice
                type="radio"
                name="timing"
                checked={!selection.rush}
                onChange={() => set({ rush: false })}
                label="No rush"
                description="Booked in at a steady pace, with room for feedback between steps."
              />
              <Choice
                type="radio"
                name="timing"
                checked={selection.rush}
                onChange={() => set({ rush: true })}
                label="Need it soon"
                description="A compressed schedule, with your project moved to the front of the line."
                aside={`+${Math.round((RUSH.price - 1) * 100)}%`}
              />
            </>
          ),
        }
      case "care":
        return {
          title: "hosting & care",
          hint: "After launch, I host it and keep it running. Domain, DNS, SSL and email records are set up in every build.",
          answer: plan.monthly ? `${plan.label}, ${formatPrice(plan.monthly)}/mo` : plan.label,
          body: CARE_PLANS.map((item) => (
            <Choice
              key={item.id}
              type="radio"
              name="care"
              checked={selection.care === item.id}
              onChange={() => set({ care: item.id })}
              label={item.label}
              description={item.description}
              aside={item.monthly ? `${formatPrice(item.monthly)}/mo` : "—"}
            />
          )),
        }
    }
  }

  // One breakdown, shown twice: in the summary itself, and enlarged from the pinned total on narrow screens.
  const detailLines = priced && (
    <>
      <ul className={styles.lines}>
        {result.lines.map((line) => (
          <li
            key={line.label}
            className={`${styles.line} ${settledLines.has(line.label) ? "" : styles.linePending}`}
          >
            <span>{line.label}</span>
            <span className={styles.lineValue}>{formatRange(line.price)}</span>
          </li>
        ))}
        {included.map((feature) => (
          <li
            key={feature.id}
            className={`${styles.line} ${confirmed.has("type") ? "" : styles.linePending}`}
          >
            <span>{feature.label}</span>
            <span className={styles.lineValue}>included</span>
          </li>
        ))}
        <li className={styles.line}>
          <span>Domain, hosting setup, SSL, email records, redirects</span>
          <span className={styles.lineValue}>included</span>
        </li>
      </ul>
      {counted.has("care") && (
        <p className={`${styles.line} ${confirmed.has("care") ? "" : styles.linePending}`}>
          <span>hosting &amp; care · {plan.label}</span>
          <span className={styles.lineValue}>{plan.monthly ? `${formatPrice(plan.monthly)}/mo` : "—"}</span>
        </p>
      )}
    </>
  )

  return (
    <div ref={pageRef} className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>A studio for the new AI era ahead.</h1>
        <p className={styles.lead}>
          RGBJOY is me, Tom Fletcher, a designer and engineer who builds with AI, without the slop. I build what
          you actually need, ready for how people are starting to use the web.{" "}
          <a href="#estimate">Price yours at the bottom</a>.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="without-the-slop">
        <SectionHeading id="without-the-slop" index={1}>
          ai, without the slop
        </SectionHeading>
        <div className={styles.about}>
          <div className={styles.prose}>
            <p>
              Anyone can prompt a website into existence now. It looks fine in the demo, then the details start to
              fall apart, the art is AI that nobody asked for, and the whole thing feels generic.
            </p>
            <p>
              I use AI tools every day, and they let one person do what used to take a team. But they&rsquo;re tools,
              not the author. I decide what gets built, read every line before it ships, and test it the way your
              customers will use it.
            </p>
            <p>
              More people now ask an assistant about a business instead of clicking through its menu. I build sites
              that read well to both.
            </p>
            <p className={styles.proseClose}>
              <mark>The speed comes from the tools. The judgment and the care come from me.</mark>
            </p>
          </div>
          <figure className={styles.portrait}>
            <Image
              className={styles.portraitImage}
              src={PORTRAIT.src}
              alt={PORTRAIT.alt}
              width={PORTRAIT.width}
              height={PORTRAIT.height}
              sizes="(max-width: 860px) 200px, 280px"
            />
            <figcaption className={styles.portraitCaption}>{SITE.author}</figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="the-details">
        <SectionHeading id="the-details" index={2}>
          the details
        </SectionHeading>
        <p className={styles.intro}>Every build includes the things that only get noticed when they&rsquo;re missing.</p>
        <ul className={styles.details}>
          {DETAILS.map((detail) => (
            <li key={detail.title} className={styles.detail}>
              <h3 className={styles.detailTitle}>{detail.title}</h3>
              <p className={styles.detailText}>{detail.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="every-step">
        <SectionHeading id="every-step" index={3}>
          every step of the way
        </SectionHeading>
        <p className={styles.intro}>
          From the first call to years after launch, you deal with one person who knows your site inside out.
        </p>
        <ol className={styles.process}>
          {PROCESS.map((step, index) => (
            <li key={step.title} className={styles.processStep}>
              <span className={styles.processIndex}>{pad2(index + 1)}</span>
              <h3 className={styles.processTitle}>{step.title}</h3>
              <p className={styles.processText}>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section ref={estimateRef} className={styles.section} aria-labelledby="estimate">
        {/* Not a numbered section like the three above: the page's ask, in the display face. */}
        <h2 id="estimate" className={styles.estimateTitle}>
          Get an estimate
        </h2>
        <p className={styles.intro}>
          Pick what you need and you&rsquo;ll have an honest range in a minute, then send it over with a note. Or
          just email <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>

        <div className={styles.columns}>
          <form className={styles.questions} onSubmit={(event) => event.preventDefault()}>
            {steps.map((step, index) => {
              const { title, hint, answer, canConfirm = true, body } = question(step)
              return (
                <Question
                  key={step}
                  id={step}
                  index={index + 1}
                  title={title}
                  hint={hint}
                  state={step === active ? "open" : confirmed.has(step) ? "done" : "upcoming"}
                  answer={answer}
                  canConfirm={canConfirm}
                  onConfirm={() => confirm(step)}
                  onReopen={() => reopen(step)}
                  sectionRef={(node) => {
                    if (node) sections.current.set(step, node)
                    else sections.current.delete(step)
                  }}
                >
                  {body}
                </Question>
              )
            })}
          </form>

          <aside id="summary" ref={summaryRef} className={styles.summary} aria-label="Your estimate">
            <p className={styles.summaryLabel}>
              {complete ? "estimated build" : `${settled} of ${steps.length} confirmed`}
            </p>
            <p className={styles.total} aria-live="polite">
              {priced ? formatRange(result.price) : "—"}
            </p>
            <p className={styles.weeks}>
              {priced ? `about ${formatWeeks(result.weeks)}` : "Pick what we're building to start."}
            </p>

            {detailLines}

            <p className={styles.note}>
              A starting range, not a quote. After a short call, you get a fixed price in writing.
            </p>

            <button
              type="button"
              className={`${styles.cta} ${complete ? styles.ctaReady : ""}`}
              disabled={!complete}
              onClick={() => setContactOpen(true)}
            >
              send this to tom
            </button>
            {!complete && <p className={styles.ctaHint}>Confirm every step to send it.</p>}
          </aside>
        </div>
      </section>


      {/* Narrow screens put the summary below every question; this keeps the total in view on the way down,
          and enlarges in place so the breakdown can be checked without losing the question in hand. */}
      <div
        className={`${styles.peek} ${peekOpen ? styles.peekOpen : ""} ${peekAway ? styles.peekHidden : ""}`}
        aria-hidden={peekAway || undefined}
        onKeyDown={(event) => {
          if (event.key === "Escape" && peekOpen) closePeek()
        }}
      >
        <button
          ref={peekToggle}
          type="button"
          className={styles.peekBar}
          aria-expanded={peekOpen}
          aria-controls="peek-details"
          aria-label={peekOpen ? "Close estimate details" : "Show estimate details"}
          tabIndex={peekAway ? -1 : undefined}
          onClick={() => setPeekOpen((open) => !open)}
        >
          <span className={styles.peekLabel}>estimate</span>
          <span aria-live="polite">{priced ? formatRange(result.price) : "—"}</span>
          {priced && <span className={styles.peekWeeks}>· {formatWeeks(result.weeks)}</span>}
          <ChevronUp className={styles.peekChevron} size={14} strokeWidth={1.75} aria-hidden />
        </button>
        {/* Folded rather than unmounted, so it can animate; inert keeps a folded breakdown out of reach. */}
        <div id="peek-details" className={styles.peekBody} inert={!peekOpen ? true : undefined}>
          <div className={styles.peekInner}>
            <div className={styles.peekScroll}>
              <p className={styles.summaryLabel}>
                {complete ? "estimated build" : `${settled} of ${steps.length} confirmed`}
              </p>
              {priced ? detailLines : <p className={styles.weeks}>Pick what we&rsquo;re building to start.</p>}
              <div className={styles.peekActions}>
                <a href="#summary" className={styles.peekJump} onClick={() => setPeekOpen(false)}>
                  full estimate
                  <ArrowDown size={14} strokeWidth={1.75} aria-hidden />
                </a>
                {complete && (
                  <button
                    type="button"
                    className={styles.peekSend}
                    onClick={() => {
                      setPeekOpen(false)
                      setContactOpen(true)
                    }}
                  >
                    send this to tom
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        attachment={
          complete
            ? {
                title: "website estimate",
                summary: `${formatRange(result.price)} · about ${formatWeeks(result.weeks)}`,
                details: [
                  ...result.lines.map((line) => line.label),
                  ...(selection.rush ? ["needed soon"] : []),
                  plan.monthly ? `${plan.label} plan, ${formatPrice(plan.monthly)}/mo` : plan.label,
                ].join(" · "),
                body: describe(selection, result),
              }
            : undefined
        }
      />
    </div>
  )
}
