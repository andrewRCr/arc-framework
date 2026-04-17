# PRD: ARCd Docs Site

**Type:** Technical
**Updated:** 2026-04-14

**State:** Pending Dependencies

**Related Work:**

- Depends on: `prd-arcd-rebrand.md` — the rebrand work unit must land first so this work operates on the
  post-rebrand namespace (`packages/arcd/`, `ARCd-config.yml`, `arcd` binary, renamed repository).

---

## Introduction

The ARC Framework currently ships a single docs site built with mkdocs-material and deployed to GitHub Pages
at `https://andrewrcr.github.io/arc-framework/`. This is the pre-rebrand state: a personal-profile GitHub
Pages URL, no custom domain, a Python toolchain that adds a second language to an otherwise Node-only
monorepo, and a theme (Material Design) whose default vocabulary is at odds with the terminal-forward
aesthetic the project is moving toward.

The rebrand work unit (`prd-arcd-rebrand.md`) secures `arcd.dev` and renames everything, but it deliberately
defers the docs-site migration to this follow-up so the two scopes stay coherent and reviewable. This work
unit stands up two sibling sites: the landing page at `arcd.dev` (bare Astro, minimal polish) and the docs
site at `docs.arcd.dev` (Astro + Starlight, ported content), both deployed via Cloudflare Pages with direct
Git integration. It also retires the Python/mkdocs toolchain cleanly so the post-migration monorepo is
Node-only.

The visual direction is anchored on the **Remedy** color scheme (Robert Rossmann's `vscode-remedy`,
BSD-3-Clause) as already adapted in the sibling `arc-portfolio` repository
(`src/data/themes/{palettes,definitions}/remedy.ts`). The portfolio adaptation handles the semantic role
mapping, WCAG AA adjustments, and bright/dark variants; this work unit ports those tokens into Starlight's
CSS custom property surface with docs-site-specific adjustments where the portfolio's semantic roles don't
map cleanly. Visual consistency across `arcd.dev`, `docs.arcd.dev`, and the portfolio site is a goal.

**Why now:** The rebrand needs a credible public docs surface before the repo goes public, and running the
site migration after the rename means the content port happens once, against post-rebrand naming.
Interleaving it with the rename itself would double the editorial surface in a single work unit. Sequenced
immediately after the rebrand WU, the docs-site migration consumes a stable namespace, uses forward-looking
`docs.arcd.dev` URLs that the rebrand sweep has already placed into content, and leaves the project with a
Node-only monorepo and a coherent public presence.

## Goals

- Stand up `arcd.dev` (landing page) and `docs.arcd.dev` (docs site) as two Cloudflare Pages deployments,
  each scoped to a monorepo subdirectory (`apps/landing/` and `apps/docs/` respectively) via direct Git
  integration.
- Scaffold `apps/landing/` as a bare Astro project (no Starlight) — minimal polish, landing-page shape, not
  a marketing site.
- Scaffold `apps/docs/` as an Astro + Starlight project, port all existing `docs/*.md` content into it, and
  convert the 5 known mkdocs admonitions to Starlight's `:::note[Title]` syntax.
- Adapt the Remedy theme from `arc-portfolio` into Starlight's CSS custom property system as a
  time-boxed visual-direction spike, producing a theme-tokens artifact and one proof-of-concept rendered
  page before broader styling work.
- Reorganize existing `docs/`-resident artifacts (README banner assets, VHS demos toolchain, screenshot
  script, images) into durable homes that survive the `docs/` deletion.
- Configure two Cloudflare Pages projects (`arcd-landing`, `arcd-docs`), each with build-watch paths scoped
  to its monorepo subdirectory, custom domain bindings, and Cloudflare Web Analytics enabled.
- Execute the DNS cutover without a zero-docs-site window — keep the existing GitHub Pages deploy live
  until both new subdomains are verified on their custom domains, then retire the old toolchain in a
  single cleanup commit.
- Update `contributing.md` so contributors onboarding after the migration see the correct location for
  docs edits (`apps/docs/src/content/docs/`).

## System Scenarios

**Scenario 1: A user lands on `arcd.dev`.**

The landing page renders with the Remedy palette, JetBrains-Mono-forward typography, and a brief shape: hero
with tagline, one-paragraph "what is this" explainer, one or two feature cards highlighting the
human-agent collaboration model, and three CTAs (docs, GitHub repo, getting-started). The page loads under
200 ms from a warm Cloudflare edge, passes basic accessibility checks, and renders correctly in both light
and dark mode.

**Scenario 2: A user navigates from `arcd.dev` to `docs.arcd.dev`.**

Clicking the "docs" CTA navigates to the Starlight docs site. The visual transition is seamless — same
palette, same typography, same surface treatments — but the page chrome expands to Starlight's
sidebar + content + table-of-contents layout. Search (Pagefind) works from the header. Dark/light mode
toggles consistently across both subdomains via their respective system-preference defaults.

**Scenario 3: A contributor edits a docs page.**

A contributor clones the repository, locates the docs content at `apps/docs/src/content/docs/`, edits a
markdown file, and runs `npm run dev -w apps/docs` to preview locally. The change is committed and pushed;
Cloudflare Pages detects the change via build watch paths, rebuilds only `apps/docs` (not `apps/landing`),
and deploys the update. `contributing.md` tells them exactly this, without mentioning mkdocs.

**Scenario 4: A CF Pages build fails.**

During initial project setup, CF Pages' direct Git integration surfaces a monorepo-build issue that cannot
be resolved via dashboard config within the investigation time-box. The fallback activates: a GitHub
Actions workflow runs `wrangler pages deploy apps/{landing,docs}/dist --project-name=arcd-{landing,docs}`
on pushes to main, with build-path filtering to avoid deploying both sites on every push.

**Scenario 5: DNS cutover.**

With both CF Pages projects building green on their `*.pages.dev` preview URLs, custom domains are added
in the CF Pages dashboard. Cloudflare auto-issues SSL certs. Once HTTPS resolves on the custom-domain
endpoints, DNS records in the Cloudflare zone are updated to point `arcd.dev` and `docs.arcd.dev` at the
CF Pages hostnames. End-to-end verification follows. Only then does the old GitHub Pages workflow retire.

## Requirements

### P0 — Must-have

**Monorepo scaffolding:**

1. Create `apps/` directory at repo root with two sibling projects: `apps/landing/` (bare Astro) and
   `apps/docs/` (Astro + Starlight). Each is a standalone npm workspace.
2. Update the root `package.json` `workspaces` array to include both new apps alongside the existing
   `packages/arcd` entry. Resulting workspaces: `["packages/arcd", "apps/landing", "apps/docs"]`.
3. Each app has its own `package.json` with pinned Astro and Starlight (for docs) versions, and standard
   scripts (`dev`, `build`, `preview`). Root-level `npm run build`, `npm run dev`, and `npm run test`
   continue to work and transparently invoke per-workspace scripts where applicable.
4. Add per-app `.gitignore` entries for build outputs (`dist/`, `.astro/`) and ensure they are not tracked.

**Visual-direction spike (time-boxed ~2 hours):**

5. Port the Remedy palette from `arc-portfolio/src/data/themes/palettes/remedy.ts` into a Starlight
   `custom.css` (or equivalent Astro CSS file) as CSS custom properties. Both bright and dark variants.
   Apply the WCAG AA adjustments already captured in the portfolio's `remedyA11y` object where the
   baseline palette does not meet 4.5:1 contrast.
6. Map the Remedy semantic roles (primary/orange, secondary/yellow, accent/cyan, destructive/red, surface
   hierarchy, hover configuration) to Starlight's CSS variable surface (`--sl-color-*` family). Where
   Starlight's docs-site UI needs differ from the portfolio's semantic role mapping, adjust in favor of
   docs-site legibility — document the deviation inline.
7. Select a typography stack consistent with the portfolio site: monospace-forward, JetBrains Mono or
   equivalent for code, a paired serif or sans for body prose.
8. Produce one proof-of-concept rendered page in `apps/docs/` using the theme tokens — render any
   ported-but-not-styled content file and validate the visual direction before broader styling work.
9. Commit the spike output (`theme.css` or equivalent + the proof-of-concept page) as the first committed
   artifact from this work unit's execution phase.

**Content port:**

10. Port all content from `docs/*.md` (and subdirectories: `customization/`, `methodology/`, `reference/`)
    to `apps/docs/src/content/docs/` following Starlight's content collection conventions. Directory
    structure may be reorganized during the port if Starlight's sidebar config makes a different layout
    more natural; otherwise preserve the existing hierarchy.
11. Convert the 5 known mkdocs admonitions (`!!! note "Title"` and `!!! tip "Title"` variants) to
    Starlight's `:::note[Title]` / `:::tip[Title]` syntax. Files affected (per the 2026-04-14 audit):
    `the-framework.md`, `getting-started.md`, `customization/configuration.md`, `methodology/rationale.md`,
    `customization/hooks.md`. A one-line sed script is sufficient.
12. Sweep branding in the ported content: apply the three-tier naming architecture (ARC / ARCd / ARCd
    Framework) from `prd-arcd-rebrand.md` § Content sweep discipline. The rebrand WU excepts `docs/` from
    its own sweep because `docs/` is being deleted here; the port in this work unit is the only sweep
    those files receive.
13. Rebuild the navigation sidebar from scratch in Starlight's config format
    (`apps/docs/astro.config.mjs` → `starlight({ sidebar: [...] })`). Reference the existing `mkdocs.yml`
    `nav` tree for content ordering, but do not attempt to mechanically transform the YAML — Starlight's
    sidebar schema is different enough that a manual rebuild is cleaner.
14. Verify internal links post-port. All relative `[link](./other-page.md)` references must resolve under
    Starlight's routing conventions. Update any that need adjustment.
15. Configure Starlight's `logo` option to reference the ARCd logo SVG from its new home (see Req 20).

**Landing page authoring:**

16. Author the `apps/landing/` page content as a bounded task after the spike completes. Scope: hero with
    tagline, one-paragraph "what is this" explainer, 1–2 feature cards highlighting the human-agent
    collaboration model, and three CTAs (docs, GitHub repo, getting-started page on docs site). Use the
    theme tokens from the spike.
17. The landing page is explicitly **not** a Starlight site — it is a bare Astro project with a single
    route. No sidebar, no search, no content collections.

**Asset reorganization:**

18. Move README banner SVGs (`readme-banner-minimal-dark.svg`, `readme-banner-minimal-light.svg`, and
    `readme-banner.svg` if still referenced) from `docs/img/` to `/assets/` at repo root. Update root
    `README.md` to reference `assets/readme-banner-*.svg`.
19. Promote `docs/demos/` to `/demos/` at repo root as a first-class VHS toolchain directory. Preserve all
    8 tape+script pairs and `common.sh`. Update any internal references.
20. Move the logo variants (`arc-logo.svg`, `arc-logo-dark.svg`, `arc-logo-light.svg`, `favicon.ico`) to
    **both** `apps/docs/src/assets/` and `apps/landing/src/assets/` — duplicated, not shared. Starlight
    and Astro both expect assets to live inside the app's own directory; a shared directory requires
    workspace-aware import paths that complicate the build for no real gain at this scale.
21. Move docs-facing demo GIFs (`arc-commit.gif`, `arc-handoff.gif`, `session-init.gif`, `task-execution.gif`,
    `first-session-init.gif`) to `apps/docs/src/assets/demos/`. Update any docs content that references them.
22. Move README-facing demo GIFs (`session-init-readme.gif`, `task-execution-readme.gif`) to `/assets/`
    alongside the banners (root README consumer). Update README references.
23. Audit `arc-hero.png` / `arc-hero-raw.png` — if nothing references them in the post-port state, delete
    as part of the cleanup commit.
24. Move `docs/scripts/frame-screenshot.sh` to `/scripts/frame-screenshot.sh` alongside the existing
    `check-package-sync.sh`. Update any internal references.
25. Delete `docs/overrides/partials/logo.html` — Starlight's native `logo` config replaces the Material
    theme partial.
26. Audit `docs/stylesheets/extra.css` (5 lines) during the content port: fold any still-relevant rules
    into Starlight's `custom.css`, else drop. Not scope-gating — resolve in situ during the port.

**Cloudflare Pages deployment:**

27. Create two Cloudflare Pages projects in the Cloudflare dashboard: `arcd-landing` and `arcd-docs`. Each
    points at the `andrewRCr/ARCd-framework` repository (post-rebrand name) with direct Git integration.
    For each project:

    - **Build root:** `apps/landing` and `apps/docs` respectively
    - **Build command:** `npm run build`
    - **Build output directory:** `dist`
    - **Build watch paths:** `apps/landing/**` and `apps/docs/**` respectively (so a landing-only change
      does not rebuild docs and vice versa)

28. Verify both projects build green on their preview `*.pages.dev` URLs before configuring custom
    domains. This is the checkpoint where CF Pages' monorepo support is validated in practice; the
    Wrangler fallback (Req 29) activates if this checkpoint fails and cannot be resolved within the
    investigation time-box.
29. **Fallback (contingent P0 — activate only if direct Git integration fails at Req 28):** Replace CF
    Pages' direct Git integration with a GitHub Actions workflow that runs
    `wrangler pages deploy apps/{landing,docs}/dist --project-name=arcd-{landing,docs}` on pushes to
    main. Workflow uses path filters so landing-only or docs-only changes do not deploy both sites. If
    activated, this replaces Req 27's direct-Git configuration for the affected project(s) — not both
    unless both fail.
30. Configure custom domains for each project in the CF Pages dashboard: `arcd.dev` → `arcd-landing`,
    `docs.arcd.dev` → `arcd-docs`. Cloudflare auto-issues SSL certs. Verify HTTPS resolves on the
    `*.pages.dev` + custom domain endpoint before touching DNS.
31. Update DNS records in the Cloudflare zone for `arcd.dev` to point at the CF Pages hostname for
    `arcd-landing`, and `docs.arcd.dev` to point at `arcd-docs`. Verify end-to-end resolution over the
    custom domains.
32. Enable Cloudflare Web Analytics on both Pages projects via the dashboard. No additional script tags
    needed — CF Web Analytics auto-injects for Pages projects when enabled.

**Old toolchain retirement (final cleanup):**

33. After both subdomains are verified live on their custom domains with passing end-to-end checks,
    retire the old mkdocs toolchain in a single cleanup commit:

    - Delete `mkdocs.yml`
    - Delete `docs/` (all remaining content should have been ported or relocated by this point)
    - Delete `.github/workflows/docs.yml`
    - Remove any Python-related CI setup, requirements files, or cache configuration
    - Verify no remaining references to `mkdocs`, `pymdownx`, `glightbox`, or the old `docs/` path in
      any framework file, script, or config

34. Update `.arc/system/arc-config.yml` (post-rebrand: `ARCd-config.yml`) → `hooks.test_patterns` to
    remove the `docs/demos/` entry (the demos directory has moved to `/demos/`). Re-add if the new
    location still needs test-pattern exclusion.

**Contributor-facing updates:**

35. Update root `contributing.md` to reflect the new docs workflow: edits happen in
    `apps/docs/src/content/docs/`, local preview via `npm run dev -w apps/docs`, build via
    `npm run build -w apps/docs`. Remove any references to mkdocs, `docs/` as the content location, or
    the old GitHub Pages URL.

**Interactive features:**

36. Configure an image lightbox for the docs site. Content includes demo GIFs and screenshots that
    benefit from click-to-enlarge — the current mkdocs glightbox setup applies this globally and the
    same behavior is expected post-migration. Baseline: `medium-zoom` (framework-agnostic, ~5 KB,
    drop-in, touch-friendly) applied globally to content images via a small Astro wrapper component.
    Fallback: `astro-lightbox` or a custom component if `medium-zoom` has a specific integration issue
    with Starlight's content collection rendering. Resolve library choice in situ — the commitment is
    a working global lightbox, not a specific library. Landing page is excluded (no content images that
    warrant lightbox).

### P1 — Should-have

37. Tune Starlight's Shiki syntax highlighter to a theme consistent with the Remedy palette. Starlight
    defaults to Shiki's `github-dark` — pick a warmer alternative or supply a custom Shiki theme derived
    from Remedy. Not scope-gating for launch; can ship with default highlighting if time-constrained.
38. Pagefind search smoke test: search for "session handoff" and verify the expected page surfaces in
    results. Informal test, not a gate.
39. Add a `robots.txt` and confirm Starlight's auto-generated sitemap is accessible at
    `docs.arcd.dev/sitemap.xml`.

### P2 — Nice-to-have

40. Add a visible "edit this page" link in Starlight's page footer pointing at the GitHub source file —
    helpful for drive-by contributors.

## Non-Goals

This PRD explicitly does **not** cover:

- **Landing page as a marketing site.** Scope is minimal-polish only. No multi-page marketing tree, no
  product tour, no case studies, no pricing page, no testimonials. If the landing page later needs to
  grow, that is a separate future work unit.
- **Reorganizing docs content structure mid-port.** The port is a lift-and-shift with format conversion,
  not a content rewrite. Structural reorganization of the docs tree is a separate content effort and
  should not be bundled here.
- **Writing new docs pages.** Content gaps that exist in the pre-port state remain in the post-port
  state. This work unit is a format migration, not a content-expansion pass.
- **Docs content search analytics.** Pagefind runs client-side and emits no telemetry; search-query
  analytics would require additional infrastructure and is out of scope.
- **Monorepo tooling upgrades.** No Turborepo, no Nx, no custom build orchestration. Plain npm workspaces
  suffice at this scale.
- **Shared component library across `apps/landing/` and `apps/docs/`.** The two apps are small enough
  that duplicating a handful of components is cheaper than introducing a shared-package workspace. If
  component duplication becomes painful later, extract to `packages/ui/` in a future work unit.
- **Visual parity with the portfolio site beyond the color palette.** The portfolio has different
  interactive patterns, surface treatments, and component vocabulary. Remedy palette is the shared
  anchor; the rest of each site's visual design is standalone.
- **The GitHub Pages deployment URL remaining live as a redirect.** Old `arc-framework.github.io` URLs
  are dead after the retirement cleanup commit. No redirect layer. The rebrand's content sweep has
  already migrated inbound links to `docs.arcd.dev`.
- **i18n or multi-language support.** Docs are English-only at this time. Starlight supports i18n natively
  if needed later.

## Technical Considerations

### Dependency on `prd-arcd-rebrand.md`

This work unit assumes the rebrand has landed. Specifically, it requires:

- Package directory renamed to `packages/arcd/`
- Repository renamed to `andrewRCr/ARCd-framework`
- `@arcd/cli` published and deprecated `@arc-framework/cli` flagged
- Content sweep in `.arc/`, root docs, and `packages/arcd/arc/` complete, with forward-looking
  `docs.arcd.dev` URLs in place
- `ARCd-config.yml` in use as the installed config file

If the rebrand has not fully landed, this work unit cannot proceed beyond monorepo scaffolding without
introducing naming inconsistencies that the rebrand was designed to prevent.

**PRD 1 exception for `docs/` sweep:** The rebrand PRD excepts `docs/*.md` from its content sweep Success
Criteria because those files are deleted here. The branding sweep on `docs/*.md` happens as part of the
content port in this work unit (Req 12), in the same pass as admonition conversion and relocation to
`apps/docs/src/content/docs/`. Each file gets touched once, not twice.

### Remedy theme adaptation strategy

The `arc-portfolio` adaptation of Remedy uses shadcn/ui's semantic role taxonomy (primary, secondary,
card, popover, muted, destructive, etc.). Starlight's theming is based on its own `--sl-color-*` surface
(accent, text, background, with light/dark/white variants). The adaptation path:

1. **Port raw palette values** from `arc-portfolio/src/data/themes/palettes/remedy.ts` into a CSS file.
   Both bright and dark variants. This is pure value transcription — the palette itself is unchanged.
2. **Map palette to Starlight's variable surface.** Starlight exposes a well-documented set of CSS
   custom properties that control colors throughout its UI. Map as follows:

    - `--sl-color-bg` → Remedy `base` (bright/dark)
    - `--sl-color-bg-nav` → Remedy `baseCode` (slightly layered surface)
    - `--sl-color-text` → Remedy `foreground`
    - `--sl-color-text-accent` → Remedy `accents.orange` (signature)
    - `--sl-color-accent` → Remedy `accents.orange` (primary)
    - `--sl-color-accent-high` / `--sl-color-accent-low` → orange darkened/lightened, or accent-family
    - `--sl-color-hairline` → Remedy `border`
    - Other Starlight variables (white, gray scale, backgrounds for code blocks) — derive from Remedy
      palette as needed

3. **Apply WCAG AA adjustments** from the portfolio's `remedyA11y` export. The portfolio already has
   documented adjustments for cyan contrast on light, foreground-dimmed on muted backgrounds, orange on
   dark, red on dark — apply these directly.
4. **Docs-site-specific deviations.** Where the portfolio's semantic role mapping does not fit Starlight's
   docs layout (e.g., Starlight's sidebar uses a different surface hierarchy than the portfolio's card
   layout), prefer legibility and content flow over mechanical role preservation. Document any deviation
   inline with a short rationale comment in the CSS file.

### Cloudflare Pages monorepo setup

Cloudflare Pages' monorepo support (officially documented since 2024) works via per-project "build root
directory" configuration. Each CF Pages project is bound to the same GitHub repository but scoped to a
different subdirectory for its build inputs:

- **`arcd-landing` project:** build root = `apps/landing`, build command = `npm run build`, output =
  `apps/landing/dist`, watch paths = `apps/landing/**`
- **`arcd-docs` project:** build root = `apps/docs`, build command = `npm run build`, output =
  `apps/docs/dist`, watch paths = `apps/docs/**`

Watch paths are critical: without them, every push to main rebuilds both sites, which wastes build
minutes and causes noisy deploys. With them, a landing-only change rebuilds only `arcd-landing`.

**npm workspace caveat:** CF Pages builds run from the build root, not the repo root. If Astro or
Starlight reach into the monorepo's shared `node_modules` for dependencies installed at the root level,
the build may fail. Mitigation: install app-specific dependencies in `apps/{landing,docs}/package.json`
rather than at the root, or use CF Pages' `NPM_FLAGS=--include-workspace-root` env var to force root
install resolution. Resolve in situ during Req 28 verification.

### Direct Git integration vs. Wrangler fallback

Direct Git integration is the preferred path (Req 27). The Wrangler + GitHub Actions fallback (Req 29)
activates only if Req 28's checkpoint — "both projects build green on `*.pages.dev`" — fails for a reason
that cannot be resolved via dashboard config within a short investigation window (~30 minutes per
project).

**Fallback trigger condition:** A CF Pages direct Git build fails persistently in a way that implicates
the monorepo build config itself (not a transient network issue, not a fixable Astro config issue, not
an `NPM_FLAGS` issue). Examples: build command runs at repo root instead of the specified build root;
watch paths ignored; build artifacts published from the wrong directory.

**Fallback shape:** A GitHub Actions workflow at `.github/workflows/deploy-pages.yml` with two jobs
(landing and docs), each triggered on pushes to main with `paths:` filters matching the respective app
directory. Each job runs `npm ci`, `npm run build -w apps/{landing,docs}`, then
`wrangler pages deploy apps/{landing,docs}/dist --project-name=arcd-{landing,docs}`. Requires a
`CLOUDFLARE_API_TOKEN` secret in the repo settings with Pages:Edit permission. The fallback replaces
only the affected project's direct Git config — if only `arcd-docs` fails, `arcd-landing` stays on
direct Git.

### DNS cutover ordering

SSL-before-records-before-traffic. The sequence:

1. Both CF Pages projects build green on `*.pages.dev` preview URLs (Req 28).
2. Custom domains added in CF Pages dashboard for each project (Req 30). Cloudflare auto-issues SSL
   certs. This step registers the custom domain with CF Pages but does not yet route traffic there.
3. Verify HTTPS resolves over the custom domain endpoint against the CF Pages preview
   (e.g., `curl -v https://arcd.dev` while DNS still points elsewhere — CF Pages serves the custom
   domain preview directly). SSL cert is valid.
4. DNS records updated in the CF zone (Req 31): `arcd.dev` → CF Pages hostname for `arcd-landing`,
   `docs.arcd.dev` → CF Pages hostname for `arcd-docs`.
5. End-to-end verification: both subdomains resolve, serve the expected content, and return 200 with
   valid SSL. Internal links from landing → docs work.
6. Only after step 5 passes does the old GitHub Pages workflow retirement (Req 33) proceed.

This sequence ensures there is never a window where traffic is routed to a CF Pages endpoint without a
valid SSL cert, and never a window where zero docs site exists.

### Two-copy discipline does not apply to `apps/`

The `packages/arcd/arc/` template source remains the authoritative source for `.arc/` framework files,
synced via the package-source-to-`.arc/` discipline documented in the rebrand WU. The new `apps/landing/`
and `apps/docs/` directories are **not** framework files — they are project-specific sibling projects in
the same monorepo, not replicated into adopters' `.arc/`. No two-copy discipline applies.

### Files touched (indicative)

- **New directories:** `apps/landing/`, `apps/docs/`, `assets/`, `demos/`
- **New files:** `apps/landing/{package.json, astro.config.mjs, src/*}`,
  `apps/docs/{package.json, astro.config.mjs, src/*, src/content/docs/**, src/styles/theme.css}`
- **Deleted files / directories:** `docs/` (entirely), `mkdocs.yml`, `.github/workflows/docs.yml`,
  `site/` (build artifact if present)
- **Moved files:** `docs/img/readme-banner-*.svg` → `assets/`, `docs/img/*-readme.gif` → `assets/`,
  `docs/img/*.gif` (docs-facing) → `apps/docs/src/assets/demos/`,
  `docs/img/arc-logo*.svg` → `apps/docs/src/assets/` + `apps/landing/src/assets/`,
  `docs/demos/` → `/demos/`, `docs/scripts/frame-screenshot.sh` → `/scripts/`
- **Modified files:** root `package.json` (workspaces array), root `README.md` (banner paths),
  `contributing.md` (docs workflow update), `ARCd-config.yml` (`hooks.test_patterns`),
  potentially `.github/workflows/deploy-pages.yml` (if Wrangler fallback activates)
- **CF Pages dashboard (manual):** Two projects created with build config; custom domains bound;
  Web Analytics enabled

### Keep-alive guarantee

The old GitHub Pages deploy at `andrewrcr.github.io/arc-framework` (or its post-repo-rename equivalent)
stays live throughout this work unit until Req 33 retires it. At no point is the docs site unreachable.
The rebrand WU's content sweep has already migrated internal link references to `docs.arcd.dev`, which
produces a brief broken-link window on the old docs site — acceptable since inbound traffic is
effectively zero pre-public. Inbound external links (if any) continue to resolve to the old Pages URL
until Req 33, at which point they 404 (intentional — no redirect layer, per non-goals).

## Success Criteria

This work is complete when **all** of the following hold:

- **Sites live on custom domains:** `https://arcd.dev` returns 200 with the landing page rendered
  correctly, using the Remedy palette in both light and dark mode. `https://docs.arcd.dev` returns 200
  with the docs site rendered correctly, sidebar navigation working, Pagefind search functional. Both
  subdomains have valid SSL certs issued by Cloudflare.
- **Monorepo structure:** `apps/landing/` and `apps/docs/` exist as npm workspaces alongside
  `packages/arcd/`. Root `npm run build`, `npm run dev`, `npm run test` all succeed.
- **Content port complete:** All pages that existed in `docs/*.md` have counterparts in
  `apps/docs/src/content/docs/`. The 5 known admonitions are converted to Starlight syntax. Internal
  docs links resolve. Brand references follow the three-tier naming model.
- **Visual spike artifact:** A `theme.css` (or equivalent) file exists in `apps/docs/src/styles/` (or
  Astro's conventional CSS location) with the Remedy palette ported as CSS custom properties, both
  variants, WCAG AA verified. The proof-of-concept page renders with the theme.
- **Landing page authored:** Hero with tagline, explainer paragraph, 1–2 feature cards, and 3 CTAs
  present on `arcd.dev`. Content is final, not placeholder.
- **CF Pages deployment:** Two CF Pages projects (`arcd-landing`, `arcd-docs`) exist, build green on
  pushes to main, and deploy to the expected subdomains. Build watch paths scope each project to its
  monorepo subdirectory so unrelated changes do not trigger unnecessary builds. Cloudflare Web Analytics
  is enabled on both.
- **Asset reorganization complete:**
    - `/assets/` exists at repo root with the README banner SVGs and README-facing demo GIFs.
      Root `README.md` references the new paths and renders correctly on GitHub.
    - `/demos/` exists at repo root as the VHS toolchain home. All 8 tape+script pairs and `common.sh`
      are present and functional. Any internal references updated.
    - `/scripts/frame-screenshot.sh` exists alongside `check-package-sync.sh`.
    - Logo SVGs and favicons present in both `apps/docs/src/assets/` and `apps/landing/src/assets/`.
    - Docs-facing demo GIFs present in `apps/docs/src/assets/demos/` and referenced from ported docs
      content correctly.
- **Old toolchain retired:** `mkdocs.yml`, `docs/`, `.github/workflows/docs.yml`, and any Python CI
  setup are deleted. No remaining references to `mkdocs`, `pymdownx`, or `glightbox` in tracked files.
- **Contributor guidance updated:** `contributing.md` describes the new docs workflow
  (`apps/docs/src/content/docs/` for edits, `npm run dev -w apps/docs` for preview). No stale mkdocs
  references.
- **Quality gates:** `npm run -s lint:md`, `npm run lint:ts`, `npm run lint:sh`, `npm run typecheck`,
  `npm test`, and `npm run build` all pass. Astro builds for both apps complete without warnings.
- **No zero-downtime window:** The old GitHub Pages deploy remains live until both new subdomains are
  verified on their custom domains; only then is the old toolchain retired.

## Open Questions

**Resolve during work:**

- **Astro and Starlight version pinning.** Use the latest stable versions of both at the time of
  scaffolding. Pin to exact versions in `package.json` so future updates are deliberate.
- **Shiki syntax highlighting theme.** Pick during the spike or post-spike based on what renders well
  against the Remedy palette. Default to Starlight's built-in if time-constrained (P1 requirement).
- **Docs-facing vs. README-facing demo GIF classification.** The `*-readme` naming convention implies
  README usage, but confirm by grepping consumers before moving. If any README-facing GIF is also
  referenced from ported docs content, duplicate rather than risk a broken reference.
- **`arc-hero.png` / `arc-hero-raw.png` disposition.** Grep for consumers after the content port. If
  nothing references them, delete in the cleanup commit.
- **Typography pairing.** JetBrains Mono for code is settled; body typography is a spike-time
  decision. Resolve alongside the palette port.

No blockers identified.

## Document History

| Date       | Change        |
| ---------- | ------------- |
| 2026-04-14 | Initial draft |
