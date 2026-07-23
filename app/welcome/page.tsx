// welcome/page.tsx — the PUBLIC marketing landing page.
//
// A faithful recreation of the v1.3 Curricula marketing design
// (Documents/Claude Design/6.3.26 …/ui_kits/marketing/index.html), in
// idiomatic React/TypeScript, adapted to OUR design tokens. This is the
// outward-facing "front door" — entirely separate from the teacher home
// page under app/(planner)/home. A Server Component: every CTA is a plain
// link, so no client interactivity is needed.
//
// Like app/login, this route lives OUTSIDE the (planner) route group, so it
// renders with only the root layout (ThemeProvider + fonts) — no top bar, no
// side rails. The page mounts inside <body class="cp-root">, so all CTAs use
// the <Button> primitive (already specificity-proof against the .cp-root
// button reset); nav/footer navigation is plain <a>/<Link>.
//
// Section order: sticky nav · hero (+ product peek) · trust strip · feature
// tiles · how-it-works · in-real-classrooms photo collage · teach-mode band ·
// teacher testimonial (real portrait) · pricing · dark CTA band · footer.
//
// CTA destinations (per the build brief):
//   Get started / Start planning free / Start planning / Sign in
//     / See teach mode → /login
//   See a sample plan → /weekly
//   Nav anchor links   → #features / #how / #teach / #pricing
//   The Plus (AI) pricing CTA is a disabled "Coming soon" button — no link.

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import styles from "./welcome.module.css";

// ── Inline glyphs ──────────────────────────────────────────────────────────
// Small SVGs reproduced from the design kit. Each inherits currentColor so
// the token-driven `color` on its wrapper does the theming.

// The brand book glyph (two facing pages) — the wordmark tile mark.
function BrandGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"
        fill="var(--logo-book-a)"
      />
      <path
        d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z"
        fill="var(--logo-book-b)"
        opacity=".5"
      />
    </svg>
  );
}

function ArrowIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ width: 16, height: 16 }}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// Lane / tile / step icons. Open-book = reading, calendar-grid = math,
// pencil-flag = catch-up, projector = teach, layers = "color is navigation".
function IconBook(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </svg>
  );
}
function IconMathGrid(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 7h14M9 4v3M7 12h2m3 0h2m3 0h.01M7 16h2m3 0h2m3 0h.01" />
    </svg>
  );
}
function IconPencil(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconLayers(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}
function IconCalendar(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}
function IconFlag(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}
function IconProjector(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 4h18M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4M12 16v4M9 21h6" />
    </svg>
  );
}

// ── Brand lockup — reused in the nav and the footer. ───────────────────────
function BrandLockup(): ReactNode {
  return (
    <Link href="/" className={styles.brand} aria-label="mycurricula.app home">
      <span className={styles.glyph}>
        <BrandGlyph />
      </span>
      <span className={styles.wordmark}>
        mycurricula<span className={styles.tld}>.app</span>
      </span>
    </Link>
  );
}

// ── Product-peek lane data ──────────────────────────────────────────────────
// Three subject lanes selling the color cascade. We use OUR locked subjects
// (the prototype's "science"/"social" aren't ours): reading, math, writing.
// Each lane sets the cascade vars (--c bright outline · --cs solid icon tile ·
// --ct light tint fill · --ck deep ink text) inline from the subject tokens.
interface Lane {
  name: string;
  icon: ReactNode;
  vars: CSSProperties;
  chips: { label: string; kind?: "done" | "cur" }[];
}

const LANES: Lane[] = [
  {
    name: "Reading",
    icon: <IconBook />,
    vars: {
      "--c": "var(--reading-bright)",
      "--cs": "var(--reading)",
      "--ct": "var(--reading-light)",
      "--ck": "var(--reading-deep)",
    } as CSSProperties,
    chips: [
      { label: "Unit 7 ✓", kind: "done" },
      { label: "Unit 8 · Inference", kind: "cur" },
      { label: "Unit 9" },
      { label: "Unit 10" },
    ],
  },
  {
    name: "Math",
    icon: <IconMathGrid />,
    vars: {
      "--c": "var(--math-bright)",
      "--cs": "var(--math)",
      "--ct": "var(--math-light)",
      "--ck": "var(--math-deep)",
    } as CSSProperties,
    chips: [
      { label: "Unit 6 ✓", kind: "done" },
      { label: "Unit 7 · 2-digit ×", kind: "cur" },
      { label: "Unit 8" },
      { label: "Unit 9" },
    ],
  },
  {
    name: "Writing",
    icon: <IconPencil />,
    vars: {
      "--c": "var(--writing-bright)",
      "--cs": "var(--writing)",
      "--ct": "var(--writing-light)",
      "--ck": "var(--writing-deep)",
    } as CSSProperties,
    chips: [
      { label: "Unit 3 ✓", kind: "done" },
      { label: "Unit 4 · Narrative", kind: "cur" },
      { label: "Unit 5" },
      { label: "Unit 6" },
    ],
  },
];

// ── Feature tile data ───────────────────────────────────────────────────────
interface Tile {
  icon: ReactNode;
  vars: CSSProperties;
  title: string;
  body: string;
}

const TILES: Tile[] = [
  {
    icon: <IconLayers />,
    vars: {
      "--tic": "var(--reading-bright)",
      "--tit": "var(--reading-light)",
    } as CSSProperties,
    title: "Color is the navigation",
    body: "Every subject owns a muted hue, and they coexist without clashing. Glance at the board and you know exactly where each subject stands.",
  },
  {
    icon: <IconCalendar />,
    vars: {
      "--tic": "var(--math-bright)",
      "--tit": "var(--math-light)",
    } as CSSProperties,
    title: "Plan the whole year",
    body: "Lay out subjects into units, weeks, and daily lessons. Drag to reschedule; open any lesson to see objectives, standards, and resources.",
  },
  {
    icon: <IconFlag />,
    vars: {
      "--tic": "var(--honey-400)",
      "--tit": "var(--honey-50)",
    } as CSSProperties,
    title: "Catch-up that's honest",
    body: "When a lesson slips, it doesn't disappear. Catch-up gathers what moved so you can reschedule, skip, or merge — without losing the thread.",
  },
  {
    icon: <IconProjector />,
    vars: {
      "--tic": "var(--writing-bright)",
      "--tit": "var(--writing-light)",
    } as CSSProperties,
    title: "Teach mode, on the board",
    body: "Project a calm teaching board — now & next, a timer, a noise meter, today's objective — built from the plan you already made.",
  },
];

// ── In-real-classrooms collage ───────────────────────────────────────────────
// Web-optimized candid photos (public/classroom/*.webp). A tall planning crop
// anchors a 2×2 of teaching moments — the "plan it, then teach it" story. alt
// text is meaningful (decorative-only images would use alt="").
interface Shot {
  src: string;
  alt: string;
  w: number;
  h: number;
  feature?: boolean;
}

const GALLERY: Shot[] = [
  {
    src: "/classroom/c13.webp",
    alt: "A teacher mapping out the week's lessons at her desk",
    w: 1150,
    h: 1437,
    feature: true,
  },
  {
    src: "/classroom/c00.webp",
    alt: "A teacher working through a problem with a small group",
    w: 1500,
    h: 1125,
  },
  {
    src: "/classroom/c02.webp",
    alt: "A class gathered on the carpet for a whole-group lesson",
    w: 1500,
    h: 1125,
  },
  {
    src: "/classroom/c06.webp",
    alt: "A teacher reading one-on-one with a student",
    w: 1150,
    h: 1437,
  },
  {
    src: "/classroom/c10.webp",
    alt: "A teacher reviewing the week's plan on screen",
    w: 1150,
    h: 1437,
  },
];

// ── How-it-works steps ──────────────────────────────────────────────────────
const STEPS = [
  {
    n: "1",
    title: "Add your subjects",
    body: "Pick subjects and grade. Each one gets a color you can recolor anytime.",
  },
  {
    n: "2",
    title: "Break it into units",
    body: "Drop in units and weeks. The subject color cascades down automatically.",
  },
  {
    n: "3",
    title: "Fill the lessons",
    body: "Add daily lessons with objectives, standards, and the materials you'll use.",
  },
  {
    n: "4",
    title: "Teach & adjust",
    body: "Mark progress, catch up what slipped, and project teach mode in class.",
  },
];

// ── Pricing tiers ───────────────────────────────────────────────────────────
// Honest to what's live TODAY. Full year/unit/lesson planning is built, so the
// Free and Basic tiers are real, purchasable planning plans. AI is NOT built
// yet, so the Plus (AI) tier is flagged "Coming soon" with no committed price.
// There is deliberately NO school / district tier: the customer is an
// individual teacher and school accounts are out of phase (CLAUDE.md §1). No
// specific unit / seat / AI quotas are encoded — the packaging is still open.
interface Plan {
  name: string;
  price: string;
  unit?: string;
  desc: string;
  features: string[];
  cta: string;
  ctaVariant: "secondary" | "honey";
  featured?: boolean;
  /** Not purchasable yet — renders a muted price + a disabled CTA. */
  soon?: boolean;
}

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    desc: "Everything you need to plan and teach one class.",
    features: [
      "Full year, unit & lesson planning",
      "Color cascade & catch-up",
      "Teach mode",
    ],
    cta: "Get started",
    ctaVariant: "secondary",
  },
  {
    name: "Basic",
    price: "$2.99",
    unit: "/mo",
    desc: "Premium planning, sharing, and collaboration across your plan.",
    features: [
      "Everything in Free",
      "Unlimited units & lessons",
      "Share & collaborate on plans",
      "Standards, print & export",
    ],
    cta: "Start planning",
    ctaVariant: "honey",
    featured: true,
  },
  {
    name: "Plus",
    price: "Coming soon",
    desc: "AI-assisted planning — draft a card, a lesson, or a whole unit.",
    features: [
      "Everything in Basic",
      "AI card & lesson drafts",
      "Generate a whole unit",
    ],
    cta: "Coming soon",
    ctaVariant: "secondary",
    soon: true,
  },
];

// ── Footer link columns ─────────────────────────────────────────────────────
const FOOT_COLS = [
  {
    head: "Product",
    links: ["Year Overview", "Teach mode", "Catch-up", "Standards"],
  },
  {
    head: "Company",
    links: ["About", "Teachers", "Blog", "Contact"],
  },
  {
    head: "Support",
    links: ["Help center", "Getting started", "Privacy", "Terms"],
  },
];

export default function WelcomePage(): ReactNode {
  return (
    <main className={`cp-root ${styles.page}`}>
      {/* ── Sticky nav ──────────────────────────────────────────────── */}
      <header className={styles.nav}>
        <BrandLockup />
        <nav className={styles.links} aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#teach">Teach mode</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className={styles.navcta}>
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="primary" size="sm">
              Get started
            </Button>
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroMesh} aria-hidden="true" />
        <div className={styles.heroIn}>
          <span className={styles.eyebrow}>Curriculum planning, made warm</span>
          <h1 className={styles.heroTitle}>
            Structured like a planner,
            <br />
            friendly like a fresh start.
          </h1>
          <p className={styles.lead}>
            Plan a whole year the way teachers actually think — by subject, into
            units, weeks, and lessons. Color carries the meaning, so your plan
            reads at a glance.
          </p>
          <div className={styles.heroCta}>
            <Link href="/login">
              <Button variant="honey" size="lg" trailingIcon={<ArrowIcon />}>
                Start planning free
              </Button>
            </Link>
            <Link href="/weekly">
              <Button variant="secondary" size="lg">
                See a sample plan
              </Button>
            </Link>
          </div>
          <div className={styles.heroNote}>
            For teachers, by teachers · No card required · Free for your first
            class
          </div>
        </div>

        {/* Product peek — a mini Year Overview with color-cascaded lanes. */}
        <div className={styles.peek}>
          <div className={styles.peekBar}>
            <span className={`${styles.dot} ${styles.dotR}`} />
            <span className={`${styles.dot} ${styles.dotA}`} />
            <span className={`${styles.dot} ${styles.dotG}`} />
            <span className={styles.peekTitle}>Year Overview · Grade 5</span>
          </div>
          <div className={styles.peekBody}>
            {LANES.map((lane) => (
              <div key={lane.name} className={styles.lane} style={lane.vars}>
                <div className={styles.laneHead}>
                  <span className={styles.laneIcon}>{lane.icon}</span>
                  {lane.name}
                </div>
                <div className={styles.chips}>
                  {lane.chips.map((chip) => (
                    <span
                      key={chip.label}
                      className={[
                        styles.chip,
                        chip.kind === "done" ? styles.chipDone : "",
                        chip.kind === "cur" ? styles.chipCur : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip ─────────────────────────────────────────────── */}
      <section className={styles.trust}>
        <span>Trusted by teachers in</span>
        <div className={styles.trustRow}>
          <b>Title&nbsp;I schools</b>
          <span className={styles.sep}>·</span>
          <b>Dual-language classrooms</b>
          <span className={styles.sep}>·</span>
          <b>Multi-grade teams</b>
          <span className={styles.sep}>·</span>
          <b>New teachers</b>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section className={styles.features} id="features">
        <div className={styles.secHead}>
          <span className={styles.eyebrow}>Why it feels different</span>
          <h2>A plan you can actually see.</h2>
          <p>
            Every subject owns a color, and that color flows from the subject
            down to its units, weeks, and lessons. Status is a separate layer —
            so progress always reads the same, on every subject.
          </p>
        </div>
        <div className={styles.tiles}>
          {TILES.map((tile) => (
            <article key={tile.title} className={styles.tile}>
              <span className={styles.tileIcon} style={tile.vars}>
                {tile.icon}
              </span>
              <h3>{tile.title}</h3>
              <p>{tile.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section className={styles.how} id="how">
        <div className={styles.secHead}>
          <span className={styles.eyebrow}>How it works</span>
          <h2>From a blank year to a living plan.</h2>
        </div>
        <div className={styles.steps}>
          {STEPS.map((step) => (
            <div key={step.n} className={styles.step}>
              <span className={styles.stepNum}>{step.n}</span>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── In real classrooms (photo collage) ──────────────────────── */}
      <section className={styles.gallery}>
        <div className={styles.secHead}>
          <span className={styles.eyebrow}>In real classrooms</span>
          <h2>Built for the work you already do.</h2>
          <p>
            From the quiet planning at your desk to the busiest moment on the
            carpet — mycurricula fits the real rhythm of teaching.
          </p>
        </div>
        <div className={styles.galleryGrid}>
          {GALLERY.map((shot) => (
            <figure
              key={shot.src}
              className={[styles.gItem, shot.feature ? styles.gFeature : ""]
                .filter(Boolean)
                .join(" ")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative
                  collage on a static marketing page; next/image's loader adds no
                  value over a pre-optimized webp and complicates the CSS crop. */}
              <img
                src={shot.src}
                alt={shot.alt}
                width={shot.w}
                height={shot.h}
                loading="lazy"
              />
            </figure>
          ))}
        </div>
      </section>

      {/* ── Teach mode band ─────────────────────────────────────────── */}
      <section className={styles.teachband} id="teach">
        <div className={styles.teachbandIn}>
          <div className={styles.tbCopy}>
            <span className={`${styles.eyebrow} ${styles.tbEyebrow}`}>
              Teach mode
            </span>
            <h2>Your plan, on the projector.</h2>
            <p>
              Switch any day into a teaching board your class can read from
              across the room — built from the lesson you already planned, so
              there&rsquo;s nothing extra to set up.
            </p>
            <Link href="/login">
              <Button variant="secondary" size="lg">
                See teach mode
              </Button>
            </Link>
          </div>
          <div className={styles.tbWidgets}>
            <div className={`${styles.wbox} ${styles.wboxWide}`}>
              <div className={styles.wboxHead}>Now &amp; next</div>
              <div className={styles.wnow}>
                <span
                  className={styles.wdot}
                  style={{ background: "var(--reading-bright)" }}
                />
                Reading — Inference
              </div>
              <div className={styles.wnext}>
                <span
                  className={styles.wdot}
                  style={{ background: "var(--writing-bright)" }}
                />
                Writing — Narrative
              </div>
            </div>
            <div className={`${styles.wbox} ${styles.wboxCenter}`}>
              <div className={styles.wboxHead}>Timer</div>
              <div className={styles.wclock}>10:00</div>
            </div>
            <div className={`${styles.wbox} ${styles.wboxCenter}`}>
              <div className={styles.wboxHead}>Objective</div>
              <div className={styles.wobj}>
                I can infer a trait using evidence.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Teacher testimonial ─────────────────────────────────────── */}
      <section className={styles.byteachers}>
        <blockquote className={styles.quote}>
          <p>
            &ldquo;It finally looks the way I think about my year — by subject,
            in color, week by week. My plan and my classroom finally match.&rdquo;
          </p>
          <footer className={styles.quoteFoot}>
            {/* eslint-disable-next-line @next/next/no-img-element -- single small
                avatar on a static page; next/image adds no value here. */}
            <img
              className={styles.avaPhoto}
              src="/classroom/c07.webp"
              alt=""
              width={1150}
              height={1437}
            />
            <div className={styles.quoteMeta}>
              <b>Ms. Rivera</b>
              <span>Grade 5 · 8 years teaching</span>
            </div>
          </footer>
        </blockquote>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────── */}
      <section className={styles.pricing} id="pricing">
        <div className={styles.secHead}>
          <span className={styles.eyebrow}>Pricing</span>
          <h2>Start free. Grow with your team.</h2>
        </div>
        <div className={styles.plans}>
          {PLANS.map((plan) => (
            <article
              key={plan.name}
              className={[styles.plan, plan.featured ? styles.planFeatured : ""]
                .filter(Boolean)
                .join(" ")}
            >
              {plan.featured && <span className={styles.ptag}>Most popular</span>}
              <h3>{plan.name}</h3>
              <div
                className={[styles.price, plan.soon ? styles.priceSoon : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                <b>{plan.price}</b>
                {plan.unit && <span>{plan.unit}</span>}
              </div>
              <p className={styles.pdesc}>{plan.desc}</p>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {plan.soon ? (
                // Coming-soon tier: a disabled CTA with no destination. We set
                // the native `title=` directly (NOT the <Tooltip> wrapper) so
                // the button stays a direct child of the card and keeps its
                // full-width `.planCta` sizing — the Tooltip primitive wraps a
                // disabled trigger in an inline-flex span that would shrink the
                // button to its label width. CLAUDE.md §4: the title explains
                // WHY it's disabled (surfaces on hover + touch long-press).
                <Button
                  variant={plan.ctaVariant}
                  size="md"
                  className={styles.planCta}
                  disabled
                  title="AI-assisted planning is in development — it isn't available to add yet."
                >
                  {plan.cta}
                </Button>
              ) : (
                <Link href="/login" className={styles.planCta}>
                  <Button
                    variant={plan.ctaVariant}
                    size="md"
                    className={styles.planCta}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ── Dark CTA band ───────────────────────────────────────────── */}
      <section className={styles.cta}>
        <div className={styles.ctaIn}>
          <h2>Plan your year the warm way.</h2>
          <p>Free for your first class. Bring your team when you&rsquo;re ready.</p>
          <Link href="/login" className={styles.ctaInBtn}>
            <Button variant="primary" size="lg" trailingIcon={<ArrowIcon />}>
              Start planning free
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className={styles.foot}>
        <div className={styles.footBrand}>
          <BrandLockup />
          <p>
            Curriculum and teaching solutions, for teachers, by teachers.
          </p>
        </div>
        <div className={styles.footCols}>
          {FOOT_COLS.map((col) => (
            <div key={col.head}>
              <h5>{col.head}</h5>
              {col.links.map((link) => (
                <a key={link} href="#">
                  {link}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className={styles.footBase}>
          © 2026 mycurricula.app · Made for teachers, by teachers
        </div>
      </footer>
    </main>
  );
}
