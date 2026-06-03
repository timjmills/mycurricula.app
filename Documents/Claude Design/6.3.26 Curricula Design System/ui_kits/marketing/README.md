# Marketing UI kit — mycurricula.app

The **public landing page** treatment in the v1.3 brand language — the look to carry into a website
redesign. One self-contained page that shows how the system reads in a marketing context: warm hero
mesh, Bricolage display type, honey call-to-action, and the **color cascade** used as the product peek.

## Run it
Open `index.html`. It's a static, responsive page (no JS) built on `../../colors_and_type.css`.

## Sections (in order)
1. **Nav** — logo (`mycurricula.app`), links, Sign in / Get started.
2. **Hero** — eyebrow + Bricolage headline + lead + dual CTA, over the hero-mesh swash.
3. **Product peek** — a window-chrome card showing the Year Overview cascade (Reading / Math / Science lanes).
4. **Trust strip** — who it's for.
5. **Features** — four tiles: color navigation, plan the year, catch-up, teach mode.
6. **How it works** — four numbered steps on the brand-soft gradient.
7. **Teach mode band** — dawn-gradient band with mini teaching widgets.
8. **Testimonial** — a teacher quote (Bricolage).
9. **Pricing** — Teacher (free) · Team (featured, honey) · School.
10. **CTA** — dark band with corner glows.
11. **Footer** — brand + link columns.

## Files
```
index.html     ← the page
marketing.css  ← landing-specific components (built on ../../colors_and_type.css)
```

## Conventions
- **Gradients are atmosphere, not decoration** — reserved for the hero, the "how" band, the teach
  band, and the CTA. Ordinary cards stay flat with hairline borders.
- **One display face** (Bricolage) for all headings; **Plus Jakarta Sans** for body/UI.
- **Honey = the marketing CTA**; indigo stays for in-product/primary actions. The `.app` in the
  wordmark is set in honey.
- Fully responsive (tiles/steps/plans collapse; nav links hide under 720px).

## Caveats
- Static only — buttons are placeholders (`href="#"`).
- For real photography/screenshots, drop an `<image-slot>` or real assets into the hero/peek.
- Fonts are delivered via **Google Fonts** (Bricolage Grotesque + Plus Jakarta Sans) — no self-hosting needed.
