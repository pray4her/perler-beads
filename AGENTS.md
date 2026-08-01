# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 15, React 19, and TypeScript static PWA. Routes and global styles live in `src/app/`; `page.tsx` is the editor and `focus/page.tsx` is the making workflow. Reusable UI is under `src/components/`, with shadcn-style primitives in `src/components/ui/`. Put stateful logic in `src/hooks/`, pure image and color operations in `src/utils/`, and shared types in `src/types/`. Static assets belong in `public/`, maintenance scripts in `scripts/`, and architecture notes in `docs/`. Color mappings are in `src/app/colorSystemMapping.json` and `色号对应表.csv`.

## Build, Test, and Development Commands

- `npm ci` — install the locked dependency set (Node 20; see `.nvmrc`).
- `npm run dev` — start the local Next.js development server.
- `npm run build` — type-check and create the static export in `out/`.
- `npm start` — serve the generated `out/` directory locally.
- `npm run lint` — run the configured Next.js/TypeScript ESLint checks.
- `npm run check:frontend-regressions` — verify known routing, sheet-state, and slider regressions.
- `npm run pages:deploy` — build and deploy `out/` to Cloudflare Pages; use only with configured Wrangler credentials.

## Coding Style & Naming Conventions

Use strict TypeScript and the `@/*` alias for `src/` imports. Follow two-space indentation, semicolons, and double-quoted TS/TSX style. Name components and their files in PascalCase (`ColorPalette.tsx`), hooks with `use` plus camelCase (`useManualEditingState.ts`), and utilities in camelCase. Keep browser APIs inside client components or their utilities. Reuse `src/components/ui/` primitives and helpers from `src/lib/utils.ts`.

## Testing Guidelines

No general test framework or coverage threshold is configured. For every change, run `npm run build`, `npm run lint`, and `npm run check:frontend-regressions`. Add focused checks to the regression script when fixing one of its guarded UI behaviors. Manually verify image import, editing, download, and `/focus/` navigation for affected flows.

## Commit & Pull Request Guidelines

Follow the dominant Conventional Commit pattern: `feat: add palette search`, `fix: preserve focus progress`, or `chore: update deployment config`. Keep subjects short and imperative; English or Chinese is acceptable. Pull requests should explain the user-visible change, link relevant issues, list validation commands, and include before/after screenshots or recordings for UI changes. Call out changes to static-export routing, PWA behavior, color data, or deployment configuration explicitly.

## Security & Configuration

Do not commit credentials, local Wrangler state, or generated directories such as `.next/` and `out/`. Preserve `trailingSlash: true` compatibility by using `/focus/` for static-export navigation.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/` at repo root). See `docs/agents/domain.md`.
