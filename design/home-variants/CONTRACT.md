# Section file contract

Each section of the home page is one file `sections/<NN>-<id>.html` (NN = order, two digits, from brief.md). `node design/home-variants/build.mjs` joins them into `index.html`, where the owner switches variants and picks one per section.

## File shape

```html
<!-- section: hero | Hero | One line: what the visitor should think/do after this section -->
<section data-variant="A" data-name="Screenshot-led" data-idea="One sentence: the approach and why it sells.">
  … full-width section markup …
</section>
<section data-variant="B" data-name="…" data-idea="…">…</section>
<section data-variant="C" data-name="…" data-idea="…">…</section>
```

- Exactly three variants, A, B, C, that differ in **approach** (what they show and how they persuade), not just in colour or layout shuffles.
- No `<html>`, `<head>`, `<body>`. Attribute values in `data-*` must not contain `"`.
- Plain HTML + Tailwind 4 classes (loaded by the browser CDN; tokens in `theme.css`). Use the token colours: `bg-background text-foreground text-muted-foreground text-faint-foreground bg-muted border-border bg-primary text-primary bg-inverse text-inverse-foreground bg-lilac bg-mist bg-frost`. Buttons: `class="btn btn-accent"` (main CTA), `btn btn-default` (ink), `btn btn-muted`; sizes `btn-sm`, `btn-lg`. Section label: `<p class="label">Apps</p>` (renders `/// Apps`). Gradient grounds: `arch-gradient`, `arch-gradient-flip`, `band-gradient` (+ an absolutely placed `<div class="grain absolute inset-0">`).
- Navy rules: lavender-white ground, indigo ink, one ultramarine accent; content width `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`; 12-column grid with the `/// label` in the first 3 columns where it fits; square corners except buttons and inputs; hairline `border-border`; key words of headings in `<em>`; Switzer only, no monospace; light only; no decorative icon soup (functional icons as small inline SVG are fine: check, globe, chevron, arrow).
- Real screens: `<img src="../../public/marketing/<name>.webp">` (mail, mail-thread, chat, notes, calendar, drive, contacts, collections, shared-mailbox, mail-settings; light versions only). Give them `border border-border` and an honest `alt`. Faux UI built in HTML is fine when it explains better than a screenshot (e.g. a DNS record, a price calculator).
- Interactivity (tabs, calculators, dropdowns, accordions) is welcome where it helps: inline `<script>` placed inside the variant's `<section>`, wrapped in an IIFE, querying only inside that section (give the section a unique `id`, e.g. `hero-b`). No external libraries.
- Must work at 390px wide with no horizontal scroll, and at 1440px. Real copy only (English), facts only from the repo (brief.md, src/config/*, CLAUDE.md "claim only what ships"). No lorem ipsum, no invented customers, testimonials, logos or numbers.
- Accessible: semantic headings (one `h1` only in the hero variants), labels on inputs, visible focus, `aria-*` on custom widgets, contrast on gradients.
