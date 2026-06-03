# Draft: CLI README — npm Landing Page for `@arc-framework/cli`

- **Origin:** [internal] — routed from `ATOMIC-INBOX` at the shared-inbox sweep (2026-06-02); reclassified from
  an atomic capture to a provisional stub because the real scope is quick-tier with design decisions (tone,
  scope boundaries, include-vs-defer-to-docs).
- **Purpose:** Give the published `@arc-framework/cli` npm package a README body so its npm page has content
  below the metadata.

---

## Problem / Motivation

`npm view @arc-framework/cli` shows `readmeFilename: ""` for the published `0.1.0` — there is no
`packages/arc-framework/README.md`, so the npm page for the CLI has no content below the metadata. The root
README covers the full framework, not the CLI specifically.

## Shape (candidate directions — not yet chosen)

Author a CLI-focused README covering installation, core commands (`arc init`, `arc join`, `arc update`,
`arc user *`, `arc sync`, `arc log standalone`), basic usage, and a pointer to the full docs site. Keep it
focused — this is the npm landing page, not the full marketing surface; it could scope-creep if it duplicates
root-README content.

## Scope Estimate

Quick-tier — ~1-2 hours of content authoring with real design decisions (tone, scope boundaries, include vs.
defer to docs). Likely its own branch (`docs/cli-readme`) under full protection, unless rolled into a broader
content sweep. Land before the next publish.

## Dependencies / Cross-refs

- Sequencing: land before the next `npm publish`. Neighbors the `release-readiness` cohort (publish-adjacent
  polish) without depending on any sibling.
