# Landing & Home — Build Checklist

_Working artifact. Covers the four-pillar goal: **quote bank · public marketing
landing (`/welcome`) · teacher home landing (`/home`) · home settings**.
Last updated 2026-06-14._

Legend: `[x]` done · `[~]` partial · `[ ]` todo · ⏳ blocked

---

## 1. Quote bank (the insight engine behind `/home`)

- [x] Article + PDF extraction tooling (`scripts/quote-mining/`)
- [x] Mine 966 article digests → attributed quotes
- [x] Read **all ~344 books**, mine quotes with an even spread across sources
- [x] **+1,009 more book quotes** for learning/teaching (named-author gravitas:
      Hattie, Wiliam, Sweller, Brown/Roediger/McDaniel, Marzano, Tomlinson,
      Brookhart, Zager, Ambrose, Sousa, Carey…)
- [x] Categorize → **classroom culture · learning · teaching · leading**
- [x] Dedupe + per-source diversity cap (45/work; Michael Linsin exempt for
      classroom culture)
- [x] Finalize → full bank `lib/home/insights.data.json` (**5,068**) + trimmed
      client hero pool `lib/home/insights.hero.json` (**320**)
- [x] Each quote = 1–2 sentence line **+ paragraph `expand`** + real attribution
      (author/work; article URL where available)
- [x] Hero pool balanced book/article (**36 book / 44 article** per category
      where books exist; leading is article-only — no book quotes mined there)
- [x] Rotation **randomizes per visit AND alternates categories** (degrades to a
      plain shuffle when filtered to a single category)
- [x] **Source ledger** `scripts/quote-mining/QUOTE-SOURCES.md` (709 works) — a
      per-category record of what's already mined, to steer future pulls
- [ ] _Optional cleanup_: a few attribution/categorization slips in the **earlier
      classroom-culture book wave** (a stray parenting title or two; one
      mis-credited author). Non-blocking — fix on the next mining pass.

## 2. Public marketing landing — `/welcome`

- [x] Built (`app/welcome/page.tsx` + `welcome.module.css`); root layout, no app chrome
- [x] Headline, value props, dual CTAs, sample-plan preview card
- [x] Live-verified (paper theme); console clean
- [ ] Theme sweep (cloud/night/mint/sky/blossom) + responsive (375 / 768 / 1440)
- ⏳ Hero / marketing imagery via ChatGPT — **blocked: ChatGPT quota to Jun 18**

## 3. Teacher home landing — `/home` ("Quiet Dawn")

- [x] Built (`components/home/*`, `app/(planner)/home/page.tsx`)
- [x] Hero: living theme-wash + time-of-day greeting + rolling attributed insight
- [x] "Read more" paragraph expansion; "Read source" link (https-gated)
- [x] Below-hero **daily dashboard** — packed 3×3 bento grid (schedule + lessons
      as tall cards; to-do, progress, shoutbox, jump-back, tips fill the rest) so
      the whole day sits in one view (2026-06-14 redesign; replaced the long
      stacked-row scroll). 3-col desktop → 2-col tablet → 1-col phone
- [x] Calm / Full / Custom modes drive which dashboard cards show
- [x] Nav wired (SideNav Home item; brand → `/home`; default-view option)
- [x] Live-verified — styled, authed, console clean; category alternation proven;
      dashboard checked at **1280 / 768 / 390**
- [x] **All six themes verified** on the dashboard (paper · cloud · night · mint ·
      sky · blossom) — chrome re-hues, text legible, no dark-on-dark
- [x] Rotation **opens on a random category** each visit (random start index)
- [x] Hero wash extracted to a reusable **`<ThemeWash />`** primitive
      (`components/ui`) so other pages can reuse the same themed background
- ⏳ Candid teacher hero photo via ChatGPT — **blocked: quota to Jun 18**;
      placeholder wash veil is in place (`.heroPhoto` in `home.module.css`)

## 4. Home settings

- [x] `HomeScreenSettings` card in Settings → Appearance (mode, visible rows,
      photo toggle, reset dismissed onboarding tooltips)
- [x] Persists per device (localStorage `mycurricula:user:home-*`); `reset()` supported
- [ ] Theme sweep + responsive spot-check

## 5. Cross-cutting gates & ship

- [x] **§4a code review** — Codex blocked (ChatGPT quota); independent/self-review
      substitute performed on the rotation + finalize changes; `tsc --noEmit` clean
- [x] **§4b live QA** — real-Chrome pass on `/home` + `/welcome` (paper); console clean
      apart from the benign `linkedom`/`canvas` optional-dep warning
- [x] `/home`: full **theme sweep (6)** + **responsive (3 tiers)** complete
- [ ] `/welcome`: theme sweep (6) + responsive (375 / 768 / 1440) still to do
- ⏳ **ChatGPT images** for both pages (tasks #8 / #10) — generate on quota reset
      (Jun 18) via the `/gen-image` skill:
  - `/home` → `public/home/*.webp` (candid Grade-5 classroom moments), then swap
    the placeholder veil for the real image
  - `/welcome` → `public/*.webp` (hero + 1200×630 og-image)
- [ ] Commit to a branch — **only when you ask**
- [ ] Formal Codex re-run once quota resets (optional; satisfies the gate-of-record)
