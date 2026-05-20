# Plan: Docs Site Refresh

**Purpose:** Refresh the public docs surface to a Node-only, Astro-based monorepo deployed via Cloudflare Pages.
Stand up `arcd.dev` (bare Astro landing page) and `docs.arcd.dev` (Astro + Starlight docs site) as sibling
Cloudflare Pages deployments; port the existing mkdocs content; adopt the Remedy color scheme for visual
coherence with the sibling `arc-portfolio` repo; retire the Python/mkdocs toolchain.

- **State:** Planned — drafted as a PRD 2026-04-14; demoted to plan-doc and renamed from `arcd-docs-site` to
  `docs-site-refresh` during WOR Phase 6.4 backlog migration on 2026-05-19. Docs site work remains committed;
  routes to `backlog/planned/docs-site-refresh/`.
- **Created:** 2026-04-14 (initial PRD); demoted to plan-doc + WU rename 2026-05-19 (WOR PRD R51 + 6.4.b).
- **Origin:** Internal.

---

## Problem / Motivation

The framework currently ships a single docs site built with mkdocs-material and deployed to GitHub Pages at
`https://andrewrcr.github.io/arc-framework/`. Pre-rebrand state: personal-profile GitHub Pages URL, no custom
domain, a Python toolchain that adds a second language to an otherwise Node-only monorepo, and a theme (Material
Design) whose default vocabulary is at odds with the terminal-forward aesthetic the project is moving toward.

The rebrand work unit (`plan-arcd-rebrand.md`) secures `arcd.dev` and renames everything; it deliberately defers
the docs-site migration here so the two scopes stay coherent and reviewable. This work unit stands up two sibling
sites: the landing page at `arcd.dev` (bare Astro, minimal polish) and the docs site at `docs.arcd.dev`
(Astro + Starlight, ported content), both deployed via Cloudflare Pages with direct Git integration. It also
retires the Python/mkdocs toolchain cleanly so the post-migration monorepo is Node-only.

The visual direction is anchored on the **Remedy** color scheme (Robert Rossmann's `vscode-remedy`,
BSD-3-Clause) as already adapted in the sibling `arc-portfolio` repository
(`src/data/themes/{palettes,definitions}/remedy.ts`). The portfolio adaptation handles the semantic role mapping,
WCAG AA adjustments, and bright/dark variants; this work would port those tokens into Starlight's CSS custom
property surface with docs-site-specific adjustments where the portfolio's semantic roles don't map cleanly.
Visual consistency across `arcd.dev`, `docs.arcd.dev`, and the portfolio site is a goal.

**Why now (sequencing rationale):** The rebrand needs a credible public docs surface before the repo goes
public, and running the site migration after the rename means the content port happens once, against post-rebrand
naming. Interleaving it with the rename itself would double the editorial surface in a single work unit.
Sequenced immediately after the rebrand WU, the docs-site refresh consumes a stable namespace, uses
forward-looking `docs.arcd.dev` URLs that the rebrand sweep has already placed into content, and leaves the
project with a Node-only monorepo and a coherent public presence.

---

## Working Direction (settled context)

### Two-site, monorepo-sibling shape

- `apps/landing/` — bare Astro project for `arcd.dev`. No Starlight, no sidebar, no search; a single route with
  hero + tagline + one-paragraph explainer + 1-2 feature cards + 3 CTAs (docs, GitHub, getting-started). Minimal
  polish, landing-page shape, not a marketing site.
- `apps/docs/` — Astro + Starlight project for `docs.arcd.dev`. Ports all existing `docs/*.md` content into
  Starlight's content collection conventions; rebuilds the navigation sidebar in Starlight's config format.

### Visual anchor: Remedy palette

Port from `arc-portfolio/src/data/themes/palettes/remedy.ts` into Starlight's `--sl-color-*` CSS variable
surface. Bright + dark variants. WCAG AA adjustments from the portfolio's `remedyA11y` export apply directly
where the baseline palette doesn't meet 4.5:1 contrast. Docs-site-specific deviations from the portfolio's
semantic role mapping favor docs-site legibility — document inline.

### Cloudflare Pages, direct Git integration (with Wrangler fallback)

Two CF Pages projects (`arcd-landing`, `arcd-docs`), each with build root scoped to its monorepo subdirectory
plus build watch paths that prevent cross-app rebuilds. Direct Git integration is the preferred path; a
GitHub Actions + Wrangler fallback activates only if direct Git integration fails persistently on monorepo
build config issues within a short investigation window.

### DNS cutover discipline: SSL-before-records-before-traffic

Ordered sequence prevents both zero-docs-site windows and SSL-less traffic windows: build green on preview
URLs → custom domains in dashboard (SSL auto-issued) → verify HTTPS on custom-domain endpoints → DNS records
updated → end-to-end verification → old toolchain retired.

---

## Scope Sketch (provisional)

Six structural layers + asset reorganization + old toolchain retirement. Not committed — awaits refresh +
PRD-graduation when the rebrand sequencing converges.

### Layer 1 — Monorepo scaffolding

- Create `apps/` directory at repo root with two sibling projects: `apps/landing/` (bare Astro) and `apps/docs/`
  (Astro + Starlight). Each a standalone npm workspace.
- Root `package.json` `workspaces` array gains both new apps alongside `packages/arcd` —
  `["packages/arcd", "apps/landing", "apps/docs"]`.
- Each app has its own `package.json` with pinned Astro / Starlight versions and standard scripts (`dev`,
  `build`, `preview`). Root-level `npm run build` / `dev` / `test` continue to work via per-workspace
  invocations.
- Per-app `.gitignore` for build outputs (`dist/`, `.astro/`).

### Layer 2 — Visual-direction spike (time-boxed ~2 hours)

- Port the Remedy palette into a Starlight `custom.css` (or equivalent) as CSS custom properties — both bright
  and dark variants. Apply WCAG AA adjustments from `remedyA11y`.
- Map Remedy semantic roles to Starlight's CSS variable surface (`--sl-color-*` family). Where Starlight's
  docs-site UI needs differ from the portfolio's semantic roles, adjust in favor of docs-site legibility;
  document deviations inline.
- Select a typography stack consistent with the portfolio: monospace-forward, JetBrains Mono or equivalent for
  code, paired serif or sans for body prose.
- Produce one proof-of-concept rendered page using the theme tokens — render any ported-but-not-styled content
  file and validate the visual direction before broader styling work.
- Commit the spike output (`theme.css` or equivalent + the proof-of-concept page) as the first execution-phase
  artifact.

### Layer 3 — Content port

- Port all content from `docs/*.md` (and subdirectories: `customization/`, `methodology/`, `reference/`) to
  `apps/docs/src/content/docs/` following Starlight's content collection conventions. Directory structure may
  reorganize during the port if Starlight's sidebar config makes a different layout more natural; otherwise
  preserve the existing hierarchy.
- Convert the 5 known mkdocs admonitions (`!!! note "Title"` / `!!! tip "Title"`) to Starlight's
  `:::note[Title]` / `:::tip[Title]` syntax. Files affected (per 2026-04-14 audit): `the-framework.md`,
  `getting-started.md`, `customization/configuration.md`, `methodology/rationale.md`, `customization/hooks.md`.
  A one-line sed script handles the conversion.
- Sweep branding in the ported content: apply the three-tier naming architecture (ARC / ARCd / ARCd Framework)
  from `plan-arcd-rebrand.md` § Content sweep discipline. The rebrand WU excepts `docs/` from its own sweep
  because `docs/` is deleted here; the port is the only sweep those files receive.
- Rebuild the navigation sidebar from scratch in Starlight's config format
  (`apps/docs/astro.config.mjs` → `starlight({ sidebar: [...] })`). Reference the existing `mkdocs.yml` `nav`
  tree for content ordering, but a manual rebuild is cleaner than mechanical YAML transformation.
- Verify internal links post-port. All relative `[link](./other-page.md)` references resolve under Starlight's
  routing conventions; update as needed.
- Configure Starlight's `logo` option to reference the ARCd logo SVG from its new home (see Layer 5).

### Layer 4 — Landing page authoring

- Author the `apps/landing/` page content as a bounded task after the spike completes. Scope: hero + tagline,
  one-paragraph explainer, 1-2 feature cards highlighting the human-agent collaboration model, 3 CTAs (docs,
  GitHub, getting-started page on docs site). Use spike's theme tokens.
- Landing page is explicitly **not** a Starlight site — bare Astro project, single route. No sidebar, no
  search, no content collections.

### Layer 5 — Asset reorganization

- Move README banner SVGs (`readme-banner-minimal-dark.svg`, `readme-banner-minimal-light.svg`, and
  `readme-banner.svg` if still referenced) from `docs/img/` to `/assets/` at repo root. Update root `README.md`
  references.
- Promote `docs/demos/` to `/demos/` at repo root as first-class VHS toolchain directory. Preserve all 8
  tape+script pairs and `common.sh`. Update internal references.
- Move logo variants (`arc-logo.svg`, `arc-logo-dark.svg`, `arc-logo-light.svg`, `favicon.ico`) to **both**
  `apps/docs/src/assets/` and `apps/landing/src/assets/` — duplicated, not shared. Starlight and Astro both
  expect assets inside the app's own directory; shared dirs require workspace-aware import paths that
  complicate the build for no real gain at this scale.
- Move docs-facing demo GIFs (`arc-commit.gif`, `arc-handoff.gif`, `session-init.gif`, `task-execution.gif`,
  `first-session-init.gif`) to `apps/docs/src/assets/demos/`. Update docs content references.
- Move README-facing demo GIFs (`session-init-readme.gif`, `task-execution-readme.gif`) to `/assets/` alongside
  the banners (root README consumer). Update references.
- Audit `arc-hero.png` / `arc-hero-raw.png` — if nothing references them post-port, delete in the cleanup
  commit.
- Move `docs/scripts/frame-screenshot.sh` to `/scripts/frame-screenshot.sh` alongside `check-package-sync.sh`.
  Update internal references.
- Delete `docs/overrides/partials/logo.html` — Starlight's native `logo` config replaces the Material theme
  partial.
- Audit `docs/stylesheets/extra.css` (5 lines): fold still-relevant rules into Starlight's `custom.css`, else
  drop.

### Layer 6 — Cloudflare Pages deployment

- Create two CF Pages projects in the dashboard: `arcd-landing` and `arcd-docs`. Each points at the post-rebrand
  `andrewRCr/ARCd-framework` repository with direct Git integration. Per-project config:
    - **Build root:** `apps/landing` and `apps/docs` respectively
    - **Build command:** `npm run build`
    - **Build output directory:** `dist`
    - **Build watch paths:** `apps/landing/**` and `apps/docs/**` respectively (so a landing-only change does
      not rebuild docs and vice versa)
- Verify both projects build green on their preview `*.pages.dev` URLs before configuring custom domains. This
  checkpoint validates CF Pages' monorepo support in practice; the Wrangler fallback activates if this fails
  and cannot be resolved within the investigation time-box.
- **Fallback (contingent; activate only if direct Git integration fails persistently):** Replace CF Pages'
  direct Git integration with a GitHub Actions workflow that runs
  `wrangler pages deploy apps/{landing,docs}/dist --project-name=arcd-{landing,docs}` on pushes to main, with
  path filters. Workflow at `.github/workflows/deploy-pages.yml`; requires `CLOUDFLARE_API_TOKEN` secret with
  Pages:Edit permission. Fallback replaces only the affected project's direct Git config.
- Configure custom domains in CF Pages dashboard: `arcd.dev` → `arcd-landing`, `docs.arcd.dev` → `arcd-docs`.
  Cloudflare auto-issues SSL certs. Verify HTTPS resolves on `*.pages.dev` + custom domain endpoint before
  touching DNS.
- Update DNS records in the CF zone: `arcd.dev` → CF Pages hostname for `arcd-landing`; `docs.arcd.dev` →
  `arcd-docs`. Verify end-to-end resolution over custom domains.
- Enable Cloudflare Web Analytics on both Pages projects via dashboard — auto-injects for Pages projects.

### Layer 7 — Old toolchain retirement (final cleanup)

After both subdomains are verified live on custom domains with passing end-to-end checks, retire the old
mkdocs toolchain in a single cleanup commit:

- Delete `mkdocs.yml`.
- Delete `docs/` (all remaining content should have been ported or relocated by this point).
- Delete `.github/workflows/docs.yml`.
- Remove any Python-related CI setup, requirements files, cache configuration.
- Verify no remaining references to `mkdocs`, `pymdownx`, `glightbox`, or the old `docs/` path in any framework
  file, script, or config.
- Update `ARCd-config.yml` → `hooks.test_patterns` to remove the `docs/demos/` entry (demos moved to `/demos/`).
  Re-add if the new location still needs test-pattern exclusion.

### Layer 8 — Contributor-facing updates

- Update root `contributing.md` to reflect the new docs workflow: edits happen in `apps/docs/src/content/docs/`,
  local preview via `npm run dev -w apps/docs`, build via `npm run build -w apps/docs`. Remove references to
  mkdocs, `docs/` as content location, or the old GitHub Pages URL.

### Layer 9 — Interactive features

- Configure an image lightbox for the docs site. Demo GIFs and screenshots benefit from click-to-enlarge — the
  current mkdocs glightbox setup applies this globally, same behavior expected post-migration. Baseline:
  `medium-zoom` (framework-agnostic, ~5 KB, drop-in, touch-friendly) applied globally to content images via a
  small Astro wrapper component. Fallback: `astro-lightbox` or custom component if `medium-zoom` has a specific
  integration issue with Starlight's content collection rendering. Resolve library choice in situ — the
  commitment is a working global lightbox, not a specific library. Landing page excluded (no content images
  warrant lightbox).

---

## Technical Considerations

### Dependency on `plan-arcd-rebrand.md`

This work unit assumes the rebrand has landed. Specifically, it requires:

- Package directory renamed to `packages/arcd/`
- Repository renamed to `andrewRCr/ARCd-framework`
- `@arcd/cli` published and deprecated `@arc-framework/cli` flagged
- Content sweep in `.arc/`, root docs, and `packages/arcd/arc/` complete, with forward-looking `docs.arcd.dev`
  URLs in place
- `ARCd-config.yml` in use as the installed config file

If the rebrand has not fully landed, this work unit cannot proceed beyond monorepo scaffolding without
introducing naming inconsistencies that the rebrand was designed to prevent.

**Plan-arcd-rebrand exception for `docs/` sweep:** The rebrand plan excepts `docs/*.md` from its content sweep
Indicative completion signals because those files are deleted here. The branding sweep on `docs/*.md` happens
as part of the content port in this work unit (Layer 3), in the same pass as admonition conversion and
relocation to `apps/docs/src/content/docs/`. Each file gets touched once, not twice.

### Remedy theme adaptation strategy

The `arc-portfolio` adaptation of Remedy uses shadcn/ui's semantic role taxonomy (primary, secondary, card,
popover, muted, destructive, etc.). Starlight's theming is based on its own `--sl-color-*` surface (accent,
text, background, with light/dark/white variants). The adaptation path:

1. **Port raw palette values** from `arc-portfolio/src/data/themes/palettes/remedy.ts` into a CSS file. Both
   bright and dark variants. Pure value transcription — palette itself unchanged.
2. **Map palette to Starlight's variable surface.** Starlight exposes a well-documented set of CSS custom
   properties that control colors throughout its UI. Map as follows:

    - `--sl-color-bg` → Remedy `base` (bright/dark)
    - `--sl-color-bg-nav` → Remedy `baseCode` (slightly layered surface)
    - `--sl-color-text` → Remedy `foreground`
    - `--sl-color-text-accent` → Remedy `accents.orange` (signature)
    - `--sl-color-accent` → Remedy `accents.orange` (primary)
    - `--sl-color-accent-high` / `--sl-color-accent-low` → orange darkened/lightened, or accent-family
    - `--sl-color-hairline` → Remedy `border`
    - Other Starlight variables (white, gray scale, backgrounds for code blocks) — derive from Remedy palette
      as needed

3. **Apply WCAG AA adjustments** from the portfolio's `remedyA11y` export — documented adjustments for cyan
   contrast on light, foreground-dimmed on muted backgrounds, orange on dark, red on dark.
4. **Docs-site-specific deviations.** Where the portfolio's semantic role mapping doesn't fit Starlight's docs
   layout (e.g., Starlight's sidebar uses a different surface hierarchy than the portfolio's card layout),
   prefer legibility and content flow over mechanical role preservation. Document deviations inline.

### Cloudflare Pages monorepo setup

Cloudflare Pages' monorepo support (officially documented since 2024) works via per-project "build root
directory" configuration. Each CF Pages project is bound to the same GitHub repository but scoped to a
different subdirectory for its build inputs.

Watch paths are critical: without them, every push to main rebuilds both sites, which wastes build minutes and
causes noisy deploys. With them, a landing-only change rebuilds only `arcd-landing`.

**npm workspace caveat:** CF Pages builds run from the build root, not the repo root. If Astro or Starlight
reach into the monorepo's shared `node_modules` for dependencies installed at the root level, the build may
fail. Mitigation: install app-specific dependencies in `apps/{landing,docs}/package.json` rather than at the
root, or use CF Pages' `NPM_FLAGS=--include-workspace-root` env var to force root install resolution. Resolve
in situ during the build-verification step.

### Direct Git integration vs. Wrangler fallback

Direct Git integration is the preferred path. The Wrangler + GitHub Actions fallback activates only if the
build-verification checkpoint — "both projects build green on `*.pages.dev`" — fails for a reason that cannot
be resolved via dashboard config within a short investigation window (~30 minutes per project).

**Fallback trigger condition:** A CF Pages direct Git build fails persistently in a way that implicates the
monorepo build config itself (not a transient network issue, not a fixable Astro config issue, not an
`NPM_FLAGS` issue). Examples: build command runs at repo root instead of the specified build root; watch paths
ignored; build artifacts published from the wrong directory.

**Fallback shape:** A GitHub Actions workflow at `.github/workflows/deploy-pages.yml` with two jobs (landing and
docs), each triggered on pushes to main with `paths:` filters matching the respective app directory. Each job
runs `npm ci`, `npm run build -w apps/{landing,docs}`, then
`wrangler pages deploy apps/{landing,docs}/dist --project-name=arcd-{landing,docs}`. Requires a
`CLOUDFLARE_API_TOKEN` secret in the repo settings with Pages:Edit permission. Fallback replaces only the
affected project's direct Git config — if only `arcd-docs` fails, `arcd-landing` stays on direct Git.

### DNS cutover ordering

SSL-before-records-before-traffic:

1. Both CF Pages projects build green on `*.pages.dev` preview URLs.
2. Custom domains added in CF Pages dashboard for each project. Cloudflare auto-issues SSL certs. Registers
   custom domain with CF Pages but does not yet route traffic there.
3. Verify HTTPS resolves over the custom domain endpoint against the CF Pages preview
   (e.g., `curl -v https://arcd.dev` while DNS still points elsewhere — CF Pages serves the custom domain
   preview directly). SSL cert valid.
4. DNS records updated in the CF zone: `arcd.dev` → CF Pages hostname for `arcd-landing`, `docs.arcd.dev` →
   `arcd-docs`.
5. End-to-end verification: both subdomains resolve, serve expected content, return 200 with valid SSL.
   Internal links from landing → docs work.
6. Only after step 5 passes does old GitHub Pages workflow retirement proceed.

Sequence ensures there is never a window where traffic is routed to a CF Pages endpoint without a valid SSL
cert, and never a window where zero docs site exists.

### Two-copy discipline does not apply to `apps/`

The `packages/arcd/arc/` template source remains the authoritative source for `.arc/` framework files, synced
via the package-source-to-`.arc/` discipline documented in the rebrand plan. The new `apps/landing/` and
`apps/docs/` directories are **not** framework files — they are project-specific sibling projects in the same
monorepo, not replicated into adopters' `.arc/`. No two-copy discipline applies.

### Keep-alive guarantee

The old GitHub Pages deploy at `andrewrcr.github.io/arc-framework` (or its post-repo-rename equivalent) stays
live throughout this work unit until Layer 7 retires it. At no point is the docs site unreachable. The rebrand
plan's content sweep has already migrated internal link references to `docs.arcd.dev`, which produces a brief
broken-link window on the old docs site — acceptable since inbound traffic is effectively zero pre-public.
Inbound external links (if any) continue to resolve to the old Pages URL until Layer 7, at which point they
404 (intentional — no redirect layer, per out-of-scope below).

---

## Indicative completion signals (provisional)

Not commitment criteria — signals worth checking at PRD-graduation:

- **Sites live on custom domains:** `https://arcd.dev` returns 200 with the landing page rendered correctly,
  using the Remedy palette in both light and dark mode. `https://docs.arcd.dev` returns 200 with the docs site
  rendered correctly, sidebar navigation working, Pagefind search functional. Both subdomains have valid SSL
  certs issued by Cloudflare.
- **Monorepo structure:** `apps/landing/` and `apps/docs/` exist as npm workspaces alongside `packages/arcd/`.
  Root `npm run build`, `npm run dev`, `npm run test` all succeed.
- **Content port complete:** All pages that existed in `docs/*.md` have counterparts in
  `apps/docs/src/content/docs/`. The 5 known admonitions converted to Starlight syntax. Internal docs links
  resolve. Brand references follow the three-tier naming model.
- **Visual spike artifact:** A `theme.css` (or equivalent) file exists in `apps/docs/src/styles/` (or Astro's
  conventional CSS location) with the Remedy palette ported as CSS custom properties, both variants, WCAG AA
  verified. The proof-of-concept page renders with the theme.
- **Landing page authored:** Hero with tagline, explainer paragraph, 1-2 feature cards, and 3 CTAs present on
  `arcd.dev`. Content is final, not placeholder.
- **CF Pages deployment:** Two CF Pages projects (`arcd-landing`, `arcd-docs`) exist, build green on pushes to
  main, and deploy to the expected subdomains. Build watch paths scope each project to its monorepo
  subdirectory so unrelated changes do not trigger unnecessary builds. Cloudflare Web Analytics enabled on
  both.
- **Asset reorganization complete:**
    - `/assets/` exists at repo root with the README banner SVGs and README-facing demo GIFs. Root `README.md`
      references the new paths and renders correctly on GitHub.
    - `/demos/` exists at repo root as the VHS toolchain home. All 8 tape+script pairs and `common.sh` present
      and functional. Any internal references updated.
    - `/scripts/frame-screenshot.sh` exists alongside `check-package-sync.sh`.
    - Logo SVGs and favicons present in both `apps/docs/src/assets/` and `apps/landing/src/assets/`.
    - Docs-facing demo GIFs present in `apps/docs/src/assets/demos/` and referenced from ported docs content
      correctly.
- **Old toolchain retired:** `mkdocs.yml`, `docs/`, `.github/workflows/docs.yml`, and any Python CI setup are
  deleted. No remaining references to `mkdocs`, `pymdownx`, or `glightbox` in tracked files.
- **Contributor guidance updated:** `contributing.md` describes the new docs workflow
  (`apps/docs/src/content/docs/` for edits, `npm run dev -w apps/docs` for preview). No stale mkdocs
  references.
- **Quality gates:** `npm run -s lint:md`, `npm run lint:ts`, `npm run lint:sh`, `npm run typecheck`,
  `npm test`, and `npm run build` all pass. Astro builds for both apps complete without warnings.
- **No zero-downtime window:** The old GitHub Pages deploy remains live until both new subdomains are verified
  on their custom domains; only then is the old toolchain retired.

---

## Out of Scope (preserved exclusions)

- **Landing page as a marketing site.** Scope is minimal-polish only. No multi-page marketing tree, no product
  tour, no case studies, no pricing page, no testimonials. If the landing page later needs to grow, separate
  future work unit.
- **Reorganizing docs content structure mid-port.** The port is a lift-and-shift with format conversion, not a
  content rewrite. Structural reorganization of the docs tree is a separate content effort.
- **Writing new docs pages.** Content gaps that exist in the pre-port state remain in the post-port state.
  This work is a format migration, not a content-expansion pass.
- **Docs content search analytics.** Pagefind runs client-side and emits no telemetry; search-query analytics
  would require additional infrastructure.
- **Monorepo tooling upgrades.** No Turborepo, no Nx, no custom build orchestration. Plain npm workspaces
  suffice at this scale.
- **Shared component library across `apps/landing/` and `apps/docs/`.** The two apps are small enough that
  duplicating a handful of components is cheaper than introducing a shared-package workspace. If component
  duplication becomes painful later, extract to `packages/ui/` in a future work unit.
- **Visual parity with the portfolio site beyond the color palette.** The portfolio has different interactive
  patterns, surface treatments, and component vocabulary. Remedy palette is the shared anchor; the rest of
  each site's visual design is standalone.
- **The GitHub Pages deployment URL remaining live as a redirect.** Old `arc-framework.github.io` URLs are dead
  after the retirement cleanup commit. No redirect layer.
- **i18n or multi-language support.** Docs are English-only at this time. Starlight supports i18n natively if
  needed later.

---

## Open Questions

### At PRD-graduation

- **Astro and Starlight version pinning.** Use the latest stable versions of both at the time of scaffolding.
  Pin to exact versions in `package.json` so future updates are deliberate.
- **Shiki syntax highlighting theme.** Pick during the spike or post-spike based on what renders well against
  the Remedy palette. Default to Starlight's built-in if time-constrained (P1-tier concern).
- **Docs-facing vs. README-facing demo GIF classification.** The `*-readme` naming convention implies README
  usage, but confirm by grepping consumers before moving. If any README-facing GIF is also referenced from
  ported docs content, duplicate rather than risk a broken reference.
- **`arc-hero.png` / `arc-hero-raw.png` disposition.** Grep for consumers after the content port. If nothing
  references them, delete in the cleanup commit.
- **Typography pairing.** JetBrains Mono for code is settled; body typography is a spike-time decision.
  Resolve alongside the palette port.

No blockers identified.

---

## Sequencing

**Planned.** Hard dependency on the rebrand WU (`plan-arcd-rebrand.md`): rebrand needs to land before this work
unit proceeds beyond monorepo scaffolding. Under the rebrand's provisional routing at 6.4.b, the rebrand's
sequencing is itself pending portfolio-piece scope refresh — which means this WU's downstream timing tracks the
rebrand's timing.

- **Upstream:** ARCd Rebrand (post-rebrand namespace requirement — package dir, repo name, package publish,
  config file, content sweep). Work Organization Reform (meta-file shape and lifecycle convention; no rename
  churn during sweep).
- **Downstream:** WU5 Public Release (consumes settled public docs surface). Any post-1.0 docs-content work.

---

## Document History

| Date       | Change                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| 2026-04-14 | Initial draft (as PRD; WU name `arcd-docs-site`)                                                       |
| 2026-05-19 | Demoted from PRD to plan-doc + WU rename to `docs-site-refresh` during WOR Phase 6.4 backlog migration |
