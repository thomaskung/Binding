# design-sync notes — jumponboard

## Repo shape

As of 2026-07-21, `packages/ui` (`@jumponboard/ui`) is a real workspace
package — not a published npm package, but a real `package.json` with a real,
existing entry (`packages/ui/src/index.ts`), consumed by the app itself via
Next's `transpilePackages`. Previously this was a bare folder
(`src/components/ui/`) inside the app with no package boundary at all; see git
history around 2026-07-21 for the migration that split it out.

- `srcDir` is `packages/ui/src` — a real, isolated package directory, not a
  folder scoped out of the whole-app `src/` tree anymore.
- `entry` (`packages/ui/src/index.ts`) is a REAL, EXISTING file now — this is
  the fix for the old weak `.d.ts` fallback (`Button.d.ts` used to be
  `{[key: string]: unknown}`): the converter bundles directly from whatever
  `--entry` it's given via its own esbuild pass, so a real barrel with real
  typed exports is what produces real per-component `.d.ts`, not a build step.
  Do not repoint `entry` at a `dist/` — the app deliberately never consumes
  one (see the package's own `package.json`: `main`/`module`/`types` all point
  at `src/index.ts` too, so Next's `transpilePackages` preserves the `"use
  client"` directives on these components, which a bundled `dist/index.js`
  would not reliably do).
- CSS: Tailwind v4, CSS-first config, tokens live in `packages/ui/src/theme.css`
  (not `src/app/globals.css` anymore — that file is now just
  `@import "@jumponboard/ui/theme.css";`). `theme.css` has its own
  `@source "./";` directive scoping Tailwind's content-detection to
  `packages/ui/src` — this is also what fixes the old whole-repo-scan
  false-positive (see "Re-sync risks", now removed below). `cfg.buildCmd` runs
  a one-off `@tailwindcss/cli` compile scoped to `packages/ui/src/theme.css`
  → `.design-sync/.cache/tailwind-compiled.css` (gitignored) and `cssEntry`
  points there. Re-run `buildCmd` before every build/rebuild — the cache file
  isn't committed.

## Component scope: 11 of 38 real exports

Compound files (`card.tsx`, `dialog.tsx`, `select.tsx`, `tabs.tsx`) export many
sub-parts (e.g. `dialog.tsx`: Dialog, DialogTrigger, DialogContent,
DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogPortal,
DialogClose, DialogOverlay — 10 exports from one file). Confirmed with the
user: only the 11 semantically top-level components get their own preview
card (Badge, Button, Card, Dialog, Input, Label, Select, Separator, Tabs,
Textarea, Toaster); the 27 sub-parts are excluded via `componentSrcMap: null`
so they don't get their own (meaningless-alone) card, but they remain fully
importable from the bundle — the Card/Dialog/Select/Tabs previews compose them
in context.

## Known render warns (triaged benign — do not re-chase on re-sync)

- `[RENDER_THIN]` on **Dialog** and **Toaster**: both use `position: fixed`
  (Dialog's popup, Toaster's portal) which the render-check's DOM-height
  measurement reports as 1px/0px even though the screenshot shows the real
  content correctly positioned and styled. Confirmed via
  `_screenshots/general__Dialog.png` and `_screenshots/general__Toaster.png`
  on 2026-07-20 — both fully rendered, not broken.

## Toaster preview: shared-module-instance gotcha

`Toaster.tsx`'s preview calls `toast.success(...)` from `sonner` to make a
real toast appear. Sonner's `toast()` and `<Toaster/>` communicate through an
in-module store — if `toast` and `Toaster` come from two separately-bundled
copies of the `sonner` module (main bundle vs. the preview's own esbuild
pass), the toast silently never appears (no error, just nothing rendered).
Fixed via `cfg.extraEntries: ["sonner"]`, which merges sonner's exports onto
the same `window.JumpOnBoardUI` namespace as the main bundle — the preview's
`import { toast } from "sonner"` then resolves through the same ds-shim to the
same bundled module instance as `Toaster`. Build logs an
`[EXPORT_COLLISION]` warning (sonner's own `Toaster` name collides with ours)
— informational only; our preview imports `Toaster` from `"jumponboard"`
explicitly, never from `"sonner"`, so it isn't affected.

## Re-sync risks

- The first re-sync after the 2026-07-21 `packages/ui` migration will be a
  **full re-verify**, not an incremental diff — `pkg`/`srcDir` both changed,
  which invalidates the `sourceKeys` anchor, so all 11 components get
  re-captured. Grades carry forward (keyed on component name, not the
  anchor), so this shouldn't require re-approving anything, just
  re-confirming. Expected, not a bug.
- Only 11 of 38 real exports are synced. If the app adds new top-level
  primitives to `packages/ui/src/`, they're picked up automatically by the
  `componentSrcMap`-based exclusion list (nothing to update) — only new
  *sub-parts* of already-synced compounds need a new `componentSrcMap: null`
  entry, or they'll surface as their own (likely low-value) card.
