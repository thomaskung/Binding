# design-sync notes — jumponboard

## Repo shape

Not a published component library — `src/components/ui/` (10 shadcn/ui files,
11 PascalCase component exports) inside a private Next.js app, no `dist/`,
no package `exports`. Confirmed with the user (2026-07-20) to sync anyway,
scoped to those 11 top-level exports.

- `srcDir` pinned to `src/components/ui` (NOT the default `src/`) — the repo's
  `src/` is the whole app (server actions, pages, "use server" modules); a
  default srcDir scan would try to bundle server-only code into the browser
  IIFE.
- No dist → synth-entry mode. `--entry ./src/components/ui/index.ts` (a
  nonexistent file) is passed on every build/rebuild purely so
  `package-build.mjs`'s ancestor-walk finds the real repo-root `package.json`
  (name `jumponboard`) instead of trying to resolve `node_modules/jumponboard`
  (which doesn't exist — this is the DS's own repo, not an installed dep).
- CSS: Tailwind v4, CSS-first config (`@theme` in `src/app/globals.css`), no
  compiled stylesheet shipped anywhere — Next's own build pipeline compiles it
  at app-build time. `cfg.buildCmd` runs a one-off
  `@tailwindcss/cli` compile to `.design-sync/.cache/tailwind-compiled.css`
  (gitignored) and `cssEntry` points there. Re-run `buildCmd` before every
  build/rebuild — the cache file isn't committed.

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

- The Tailwind CLI compile (`buildCmd`) has automatic content-detection
  scanning the whole repo — if classes referenced only inside
  `.design-sync/previews/*.tsx` inline styles change, no risk (we use inline
  `style={}` there, not Tailwind classes), but if a future preview adds
  Tailwind utility classes not used elsewhere in the app, re-run `buildCmd`
  before rebuilding or they won't be in the compiled CSS.
- This cuts both ways: since `buildCmd` scans the WHOLE repo (not just
  `src/components/ui/`), any Tailwind class added anywhere in the app (new
  pages, new features) also changes the compiled CSS's hash and flips
  `styleChanged: true` on the next re-sync — even when zero design-system
  component source changed (confirmed 2026-07-21: a large app feature build
  touched none of the 11 synced components, `sourceHashes` matched the
  anchor exactly for all 11, yet `styling: true` still triggered a re-upload
  of `styles.css`/`_ds_bundle.css`). Expected and harmless — just re-run
  `buildCmd` before the resync driver, same as always; don't mistake a
  styling-only upload with 0 changed/added components for a real diff.
- `--entry ./src/components/ui/index.ts` is a synthetic, nonexistent path —
  don't "fix" this by creating that file; it's load-bearing exactly because
  it doesn't exist (soft-fails into synth-entry mode after establishing
  `PKG_DIR`).
- Only 11 of 38 real exports are synced. If the app adds new top-level
  primitives to `src/components/ui/`, they're picked up automatically by the
  `componentSrcMap`-based exclusion list (nothing to update) — only new
  *sub-parts* of already-synced compounds need a new `componentSrcMap: null`
  entry, or they'll surface as their own (likely low-value) card.
