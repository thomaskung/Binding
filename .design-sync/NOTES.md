# design-sync notes — binding

## Repo shape

As of 2026-07-21, `packages/ui` (`@binding/ui`) is a real workspace
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
  `@import "@binding/ui/theme.css";`). `theme.css` has its own
  `@source "./";` directive scoping Tailwind's content-detection to
  `packages/ui/src` — this is also what fixes the old whole-repo-scan
  false-positive (see "Re-sync risks", now removed below). `cfg.buildCmd` runs
  a one-off `@tailwindcss/cli` compile scoped to `packages/ui/src/theme.css`
  → `packages/ui/.ds-tailwind-cache.css` (gitignored — see "PKG_DIR-relative
  config paths" below for why it lives there and not under `.design-sync/`)
  and `cssEntry` points there. Re-run `buildCmd` before every build/rebuild —
  the cache file isn't committed.

## PKG_DIR-relative config paths (bit this on the first post-migration re-sync)

Once `packages/ui` got its own real `package.json`, `package-build.mjs`'s
ancestor-walk resolves `PKG_DIR` to `packages/ui` itself (previously it
soft-failed up to the repo root, since there was no real package.json to find
closer in). This silently changed what `cfg.tsconfig` and `cfg.cssEntry`
resolve relative to — both go through `cfgPath()`, which is **always**
`resolve(PKG_DIR, rel)` regardless of which bounds-check root is passed:

- `cfg.tsconfig` — bounds-checked against `workspaceRoot` (the enclosing git
  repo), so it CAN reach outside `packages/ui`. Root's `tsconfig.json` is
  reached via `"../../tsconfig.json"`, not `"tsconfig.json"`.
- `cfg.cssEntry` — bounds-checked against `pkgRoot` (`packages/ui` itself), so
  it must resolve to somewhere **inside** `packages/ui` or the build silently
  skips it (`! cssEntry: ... not found — skipped`, easy to miss in the log).
  This is why `buildCmd` writes its compiled output to
  `packages/ui/.ds-tailwind-cache.css` instead of somewhere under
  `.design-sync/.cache/` — the old location is now out of bounds for
  `cssEntry` specifically (`tsconfig` and `cssEntry` have different bounds).

If either config path changes again, re-verify against `cfgPath()` in
`.ds-sync/package-build.mjs` rather than assuming repo-root-relative — the
same silent-skip failure mode applies to both.

## Preview files hardcode the package name — update them on any `pkg` rename

`.design-sync/previews/*.tsx` are hand-authored and `import { ... } from
"<pkg>"` by the OLD literal package name. When `cfg.pkg` changes (e.g. the
2026-08-03 `jumponboard` → `binding` rename), every preview import
breaks (`Could not resolve "<old-pkg>"`) and all 11 previews silently fall
back to the floor card — the build doesn't fail, so this is easy to miss
unless you actually read the preview-build warnings. Fix: `sed -i` the old
package name to the new one across `.design-sync/previews/*.tsx` (and check
`.design-sync/conventions.md`'s code sample too — it hardcodes the same
import and the design agent reads it verbatim as usage guidance).

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
the same `window.BindingUI` namespace as the main bundle — the preview's
`import { toast } from "sonner"` then resolves through the same ds-shim to the
same bundled module instance as `Toaster`. Build logs an
`[EXPORT_COLLISION]` warning (sonner's own `Toaster` name collides with ours)
— informational only; our preview imports `Toaster` from `"@binding/ui"`
explicitly, never from `"sonner"`, so it isn't affected.

## 2026-07-22: added Slider + Progress (13 components total)

Added for the recruiter-monetization per-role budget UI (budget-cap slider + spend-used bar). Both are thin wrappers over `@base-ui/react`'s `slider`/`progress` primitives, same convention as `separator.tsx`. `Progress`'s single-cell preview tripped `[GRID_OVERFLOW]` on first sync (its two exports, `Default`/`Empty`, don't tile well in the grid) — fixed via `cfg.overrides.Progress: {"cardMode": "single", "primaryStory": "Default"}`, same fix already applied to Dialog/Select/Toaster. Both graded `good` on first capture, no iteration needed.

## Re-sync risks

- Confirmed on the 2026-07-21 `packages/ui` migration's first re-sync: `pkg`/
  `srcDir` changing invalidates the `sourceKeys` anchor, so all 11 components
  come back `changed` (not `unchanged`) and need a **full re-grade** — every
  grade got cleared (`contract changed`), not carried forward. (An earlier
  version of this note claimed grades carry forward across a `pkg` rename —
  that was wrong; corrected here.) Re-grading was fast since nothing visually
  changed (Read each `_screenshots/review/<group>__<Name>.png`, confirm
  against the pre-migration look, write `good`) — budget for that pass, not
  a silent no-op, on any future `pkg`/`srcDir` change.
- Only 11 of 38 real exports are synced. If the app adds new top-level
  primitives to `packages/ui/src/`, they're picked up automatically by the
  `componentSrcMap`-based exclusion list (nothing to update) — only new
  *sub-parts* of already-synced compounds need a new `componentSrcMap: null`
  entry, or they'll surface as their own (likely low-value) card.
