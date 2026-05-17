# MyCurricula

Weekly curriculum planning tool for Grade 5 teachers. Next.js (App Router,
TypeScript) frontend.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the root path redirects
to `/weekly`, the app's primary view.

## Scripts

| Command                | Purpose                          |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Start the dev server (port 3000) |
| `npm run build`        | Production build                 |
| `npm run start`        | Serve the production build       |
| `npm run lint`         | ESLint (Next.js config)          |
| `npm run format`       | Format all files with Prettier   |
| `npm run format:check` | Check formatting without writing |

## Structure

```
app/         Next.js routes (App Router). globals.css lives here.
components/  Shared React components.
lib/         Utilities, data access.
styles/      Reserved for additional stylesheets.
public/      Static assets.
Documents/   Planning docs and design handoff (not part of the app).
```

## Conventions

- **Tailwind CSS** supplies layout/spacing utilities and the preflight reset
  only. Color, type, and spacing **tokens** are owned by CSS custom properties
  (ported from the design handoff `tokens.css`) — do not add theme colors to
  `tailwind.config.ts`.
- Fonts: Geist / Geist Mono via the `geist` package, wired in `app/layout.tsx`.
- Path aliases: `@/components/*`, `@/lib/*`, `@/app/*` (see `tsconfig.json`).
