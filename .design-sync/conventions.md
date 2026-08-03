## Wrapping and setup

No context provider is required — every component works standalone (they're built on unstyled `@base-ui/react` primitives, not a themed component-kit). Two things do need setting up at the page root, not per-component:

- **Dark mode is a plain class, not a provider.** Add `class="dark"` to `<html>` (or any ancestor) to switch the whole palette — every color token below is redefined under a `.dark` selector. There's no `ThemeProvider` in the bundle; if the app needs light/dark *switching* rather than a fixed mode, that's the app's own concern (e.g. toggle the class on a media-query or user pref), not this kit's.
- **`Toaster` is a single global mount, not a per-page component.** Render `<Toaster />` once near the app root. Trigger toasts from anywhere with `toast(...)` from the `sonner` package directly (`toast.success(...)`, `toast.error(...)`, etc.) — `Toaster` only renders the queue, it doesn't expose a trigger API itself.

## Styling idiom: Tailwind utility classes over semantic tokens

Every component takes a `className` prop that merges with its internal classes (last-wins, via `tailwind-merge`) — style variations by passing utility classes, not by wrapping in extra elements. Never reach for a raw color (`bg-neutral-900`, `text-gray-500`) — use the semantic token classes below; they're what makes dark mode and future re-theming work for free:

| Surface | classes |
|---|---|
| Page background / text | `bg-background` / `text-foreground` |
| Card surface | `bg-card` / `text-card-foreground` |
| Popover / dropdown / dialog surface | `bg-popover` / `text-popover-foreground` |
| Primary action | `bg-primary` / `text-primary-foreground` |
| Secondary surface | `bg-secondary` / `text-secondary-foreground` |
| Muted / de-emphasized | `bg-muted` / `text-muted-foreground` |
| Destructive | `bg-destructive` / `text-destructive` (often used at low opacity: `bg-destructive/10`) |
| Borders / rings | `border-border`, `ring-foreground/10` |
| Radius scale | `rounded-lg` (default control radius), `rounded-xl` (cards/dialogs), `rounded-4xl` (pills — badges) |

Components already apply sensible defaults from this table internally — you only need it when composing new layout around them (page backgrounds, custom containers), not to restyle the components themselves.

**Known variant/size props** (pass as-is, don't invent new ones):
- `Button` / `Badge`: `variant="default" | "secondary" | "outline" | "ghost" | "destructive" | "link"`. `Button` also takes `size="xs" | "sm" | "default" | "lg" | "icon" | "icon-sm" | "icon-lg"`.
- `Card`: `size="default" | "sm"` (sm = tighter padding, for dense lists).
- `TabsList`: `variant="default" | "line"` (pill-background tabs vs. underline tabs).
- `Slider`: uncontrolled via `defaultValue` (or controlled `value`/`onValueChange`), plus `min`/`max`/`step`/`disabled` — a single numeric value, not a range, unless `defaultValue`/`value` is an array. Pair with a `Label` above it (see the Slider preview) rather than relying on any built-in caption.
- `Progress`: `value` is a number 0–100 (or `null` for an indeterminate state) — no variant/size prop; pair with a `Label` above it the same way as `Slider`.

## Where the truth lives

- `styles.css` (imports the compiled Tailwind output + design tokens) — read this before styling anything; it's the actual source of every class/token named above.
- `tokens/` — the raw CSS custom properties (`--primary`, `--background`, etc.) for both `:root` and `.dark`.
- Per-component `.prompt.md` — synthesized from each component's `.d.ts` props (no separate hand-written docs exist upstream for this kit).

## Composing components

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter, Badge, Button } from "@binding/ui";

<Card style={{ width: 340 }}>
  <CardHeader>
    <CardTitle>Senior Backend Engineer</CardTitle>
    <CardDescription>Nimbus Cloud Systems · Remote / Hybrid</CardDescription>
    <CardAction>
      <Badge variant="secondary">92% match</Badge>
    </CardAction>
  </CardHeader>
  <CardContent>Own our payments ledger service: distributed systems, Postgres, Kubernetes.</CardContent>
  <CardFooter>
    <Button size="sm">View match</Button>
  </CardFooter>
</Card>
```

`CardHeader`/`CardTitle`/`CardDescription`/`CardAction`/`CardContent`/`CardFooter` (and the equivalent sub-parts of `Dialog`, `Select`, `Tabs`) are real exports available on the bundle even though only their parent has its own preview card — compose them exactly like the snippet above.
