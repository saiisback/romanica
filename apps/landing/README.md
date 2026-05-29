# @romanica/landing

The public marketing landing page — a standalone Next.js (App Router) app. Black / red /
ember, minimalist dev aesthetic. No backend, no workspace deps — it prerenders to fully
static HTML, so it deploys anywhere.

## Develop

```bash
bun run --filter '@romanica/landing' dev     # http://localhost:3001
```

## Build

```bash
bun run --filter '@romanica/landing' build
```

## Deploy to Vercel

This lives inside a Bun monorepo, so point Vercel at this subdirectory:

1. Import the repo into Vercel.
2. **Root Directory** → `apps/landing`.
3. Framework preset: **Next.js** (auto-detected).
4. Install command: `bun install` · Build command: `bun run build` · Output: `.next` (defaults are fine).

Vercel runs the install from the workspace root using `bun.lock`, then builds this app.
Because the page is static, it's served straight from the edge.

## Structure

```
app/
  layout.tsx     # metadata + globals
  page.tsx       # the whole page (hero, features, layers, architecture, CTA)
  globals.css    # Tailwind v4 + the black/red/ember theme tokens
components/
  Nav.tsx        # sticky top nav
  CodeWindow.tsx # terminal-style code block with light syntax highlighting
  layers.ts      # the 10-layer data
```

Edit links: the GitHub URL is the `GITHUB` constant at the top of `app/page.tsx`.
