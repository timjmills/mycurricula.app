# Criteria — Performance

Always separate **measured** findings from **code-level risks requiring
profiling**. Both belong in the report; presenting the second as the first is a
common way audits mislead.

## Loading

- Total JavaScript shipped to the route, and how much runs before interactivity
- Code splitting at route and heavy-component boundaries
- Dependencies large relative to what they provide — a date library for one
  format call, an icon package imported wholesale, a chart library for one
  sparkline
- Duplicate dependencies at different versions in the bundle
- Font loading strategy: subsetting, `font-display`, preload of the fonts
  actually used above the fold
- Images: modern formats, correct dimensions, `srcset`, lazy loading below the
  fold, explicit width/height to reserve space
- Third-party scripts, their weight, and whether they block
- Preload and prefetch used deliberately — indiscriminate preloading makes things
  worse, not better

## Rendering

- Layout shift from images, fonts, ads, banners, or late-arriving content
- Long tasks blocking the main thread
- Large DOM trees; long lists rendered without virtualisation
- Unnecessary client-side rendering of content that could be static or
  server-rendered
- Hydration cost on content-heavy pages

## Runtime

- Re-renders caused by unstable references, context that changes too broadly, or
  state held higher than it needs to be
- Expensive work in render rather than memoised or moved out
- Data fetching: waterfalls, duplicate requests, missing caching, refetch on
  every focus
- Event handlers that need throttling or debouncing (scroll, resize, pointermove,
  input)
- Layout thrashing — reading layout properties inside a write loop

## Animation

- Animate `transform` and `opacity`; animating `width`, `height`, `top`, `left`,
  or `box-shadow` forces layout or paint every frame
- `requestAnimationFrame` rather than interval timers for visual updates
- Animation loops, observers, and listeners cleaned up on unmount — leaked rAF
  loops are a frequent cause of pages that degrade the longer they stay open
- Canvas and WebGL: draw call count, texture sizes, resolution scaling on
  high-DPR displays, and pausing when off-screen or backgrounded
- Adaptive quality for lower-powered devices
- Effects disabled or simplified under `prefers-reduced-motion` and on
  battery-constrained devices

## Budgets

Where the project has no stated budget, propose one rather than leaving it
implicit. A reasonable default for an application route:

| Metric | Target |
|---|---|
| LCP | < 2.5s on a mid-tier device, throttled 4G |
| INP | < 200ms |
| CLS | < 0.1 |
| Route JS (compressed) | < 200KB, plus a stated reason for anything larger |
| Animation frame budget | 16ms |

## Fallbacks

Any advanced rendering technique needs a stated answer to: what happens without
WebGL, without the newer CSS feature, on a low-powered device, on a slow network,
and with reduced motion enabled? "Progressive enhancement" as a word is not an
answer; name the actual fallback.
