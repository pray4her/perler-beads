# Adopt shadcn/ui with Anthropic-inspired theme tokens

We needed a owned, accessible component set for a full visual overhaul without inventing a second design system. We chose shadcn/ui (code owned in-repo) and customized CSS variables to Anthropic-like warm off-white (`#faf9f5`) / near-black (`#141413`), with system dual theme and near-black primary CTAs instead of rainbow gradients or stock shadcn purple-gray defaults.

## Considered Options

- Keep ad-hoc Tailwind classes (status quo): fast short-term, inconsistent chrome across home and focus mode.
- Radix Themes or another packaged DS: less ownership, harder to match the monochrome institutional look.
- shadcn + Anthropic tokens (chosen): owns components, maps cleanly onto existing Next 15 + Tailwind v4 stack.

## Consequences

Primary actions no longer use semantic rainbow colors; product meaning for bead colors stays on the canvas/swatches only. Dark mode follows `prefers-color-scheme` via CSS variables and the Tailwind `dark` variant.
