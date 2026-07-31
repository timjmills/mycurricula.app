# Technique Toolkit — Marketing and Editorial Surfaces

For landing pages, campaign sites, product pages, portfolios, launch
announcements, and editorial features. Places where someone arrives once, decides
quickly, and leaves.

Here, distinctiveness is a functional requirement. A forgettable landing page
fails at its job even if it is perfectly usable. This is the surface where
ambitious visual technique earns its place.

Treat this as a starting point, not a boundary. Research better-fitting
approaches, and prefer maintained libraries compatible with the stack.

## Concept first

Before any technique, state the idea the page is built around: the single visual
or narrative concept everything serves. Techniques selected without a concept
produce an effects showcase — technically impressive, communicating nothing, and
indistinguishable from every other effects showcase.

The concept should come from the product's actual character, not from a trend.

## 3D and generative rendering

- WebGL / WebGPU scenes (three.js, react-three-fiber, OGL for lighter needs)
- Custom GLSL shaders — gradient fields, distortion, dissolve, refraction
- Raymarching and signed distance fields for volumetric or impossible geometry
- Particle systems, GPU-driven for large counts
- Flow fields, noise-driven motion, fluid simulation
- Procedural and generative imagery, optionally treated or composited afterwards
- Post-processing: bloom, depth of field, chromatic aberration, grain,
  displacement

Each of these needs a stated device budget, a resolution-scaling strategy, and a
static fallback. A hero that stutters on a mid-range phone is a worse first
impression than a well-art-directed still image.

## Layered and composited 2D

Often a better ratio of impact to cost than 3D:

- SVG filters — displacement, turbulence, feTurbulence-driven texture
- Masks, clip paths, and shape-based reveals
- Blend modes for depth and colour interaction
- CSS `background-blend-mode` and gradient meshes
- Grain, halftone, duotone, and print-derived treatments
- Layered parallax with genuine depth cues rather than a single offset

## Scroll and narrative

- Scroll-driven animation (native CSS scroll timelines where supported)
- Pinned and scrubbed sections for stepwise storytelling
- Sticky-stacked panels
- Choreographed timelines (GSAP, Motion) with a coherent rhythm
- Progressive reveal tied to reading pace, not to arbitrary offsets

Scroll hijacking that removes control from the user is the fastest way to make a
striking page annoying. Momentum, direction, and exit should stay predictable.

## Typography as the subject

- Variable fonts driven by scroll position, cursor proximity, or velocity
- Per-character and per-word animation
- Kinetic typography and type-led compositions
- Extreme scale contrast between display and body type
- Text on paths, along shapes, or masked into imagery

Typography carries more distinctiveness per kilobyte than any other technique on
this list, and degrades gracefully. It is usually the first place to spend
ambition, not the last.

## Interaction and craft

- Magnetic buttons and cursor-reactive elements
- Custom cursors — with a real cursor preserved for anyone who needs it
- Spring and inertia physics on drag, marquee, and carousel
- Art-directed light and dark modes, treated as two designs rather than one
  inverted
- A designed loading state that is part of the experience rather than an apology
- Sound used sparingly, always muted by default, always with a visible control
- View Transitions between pages for continuity

## Non-negotiables

Ambition and responsibility are not in tension here; the ambitious version simply
has to include these:

- Real content reachable without WebGL, without JavaScript-driven reveal, and
  with reduced motion enabled — decorative layers should never gate information
- All text as text, in the DOM, for search engines and assistive technology
- `prefers-reduced-motion` honoured across scroll effects, parallax, autoplay,
  and entrance animation
- Keyboard access to every interactive element, custom cursors included
- Contrast maintained over video, imagery, and animated backgrounds at every
  frame — not just the frame you designed against
- Mobile treated as its own art direction, not a disabled desktop experience
- A performance budget stated up front, with LCP protected from the hero effect
- Static poster or fallback image for every heavy scene

## Scoping the ambition

When proposing a high-ambition direction, keep the ambition and design the
safeguards explicitly — device tiering, lazy initialisation below the fold,
resolution scaling, pausing when off-screen or backgrounded, and a fallback that
is designed rather than merely functional.

Do not water the concept down as a default response to risk. Name the risk and
mitigate it.
