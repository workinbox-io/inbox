# Stageshow kit

The React kit from the Stageshow skill (MIT, see LICENSE): stages, windows, a scripted cursor and
motion parts for faux product UI on marketing pages. Import from `@/components/stageshow/kit`.

Used by `components/marketing/`:

- `hero-demo.tsx`: the homepage hero, the Projects screen creating a project. Plays once in view.
- `features-bento.tsx`: the features grid, one Stage per tile, each tile one small beat.
- `look.css`: maps the kit's `--ss-*` tokens to the site's variables, so light and dark follow
  the theme toggle; `site-theme.ts` passes the theme to each `Stage`.

Changed from upstream: `BrandMark` and the `brands/` registry are removed (their
`new URL(..., import.meta.url)` assets break Astro's prerender, and nothing here uses them).

To change a picture, keep its framing (window inset one gutter, bleeding off the bottom) and
replace the strings with your product's. Film it with the skill's `scripts/film.mjs`.
