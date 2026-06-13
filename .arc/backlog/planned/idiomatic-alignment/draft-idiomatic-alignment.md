# Draft: Idiomatic Alignment (knowledge-format norms)

- **Origin:** [internal] — OKF / LLM-wiki idiomatic-alignment exploration (2026-06-13).
- **State:** Provisional — captured from the alignment exploration; alignment surface not yet planned.
- **Purpose:** Evaluate where ARC should align its conventions with the emerging "LLM-wiki" knowledge-format family
  (Google's OKF; Karpathy's LLM-wiki) — for onboarding/legitimacy, interoperability, and projection-readiness —
  without reshaping ARC's load-bearing internal conventions for their own sake.

---

## Context — convergence, not a gap

ARC, designed before either existed, already independently converged on the family's core shape: markdown +
YAML frontmatter, directory-as-hierarchy, README/ALL-CAPS hubs (= their `index.md`), append logs (= their `log.md`),
a schema/convention file (ARC is already on the dominant norm — `AGENTS.md` / `CLAUDE.md`), and an LLM-maintained
knowledge base. OKF (Google Cloud, v0.1, 2026-06-12) is conformant if every non-reserved `.md` has parseable
frontmatter with a non-empty `type` — a trivially low bar. Karpathy's gist is the cited antecedent OKF formalizes.

**The register is convergence, not adoption.** "We independently arrived at the same shape these now describe — here
is the mapping" is *stronger* legitimacy than "built on OKF," and it avoids coupling ARC's identity to a one-day-old
v0.1 spec. Frame as *convergent with / a mature instance of*, never *conformant to / built on*.

## Alignment surface to evaluate

- **Frontmatter `type` as an orthogonal machine-legible layer.** OKF separates **Concept ID = the file path**
  (identity / grouping) from **`type` = a frontmatter field** (the kind). ARC currently *overloads* both onto the
  filename prefix: `meta-`/`tasks-`/`notes-` carry a type hint *and* ride the shared slug (good for grouping,
  collides if you "extract the type"), while workflows / methods / extensions carry type only via **directory** — a
  third, prefix-less scheme. OKF's path-is-ID / type-is-frontmatter split is a principled **third horn** for the
  long-standing "justify or tweak the prefix" question: keep the human-facing filename scheme exactly as is (prefix
  for fuzzy-find, slug for grouping, directory for workflows) **and** add a uniform, orthogonal frontmatter `type`
  that also covers the prefix-less families. The filename stops being the *sole* type-carrier; projection/tooling
  that wants to query by type gets a clean layer. **Caveat:** real churn, and nothing reads it today — evaluate
  deliberately; this is an option to weigh, not a foregone change. (`naming-conventions` already brushes the idea:
  "a documented property (or frontmatter if ever machine-legible).")
- **`index.md` / `log.md` correspondence.** Document the mapping between the family's reserved files and ARC's
  equivalents (README-per-dir + ALL-CAPS hubs; the heterogeneous append logs) in `strategy-file-classification.md` —
  *document the correspondence, don't rename* (README is a stronger web/git norm than `index.md`; ARC's flat
  `active/` + README-per-dir already covers the hub role).
- **Projection-readiness.** Keep ARC's `reference/` + project-knowledge layer cheaply emittable as a conformant OKF
  bundle (a downstream consumer/interop story), composing with the `arc-backend` record→markdown projection model.
  Forward — only worth emitting when a consumer exists; the point here is not to foreclose it.

## Scope boundary

- **In scope:** the convention/structural alignment questions above — design and (if warranted) a bounded
  convention change; the correspondence documentation.
- **Out of scope:** renaming ARC's internal vocabulary (work unit, errand, interlock, …) to the family's coarser,
  catalog-shaped terms — different domain, more precise terms, load-bearing. The public-facing *framing copy* (the
  onboarding on-ramp) is **not** here — it routes to `docs-content-sweep` as a framing note.

## Relationship to other work

- **`naming-conventions`** — coordinate / extract. It owns the `TYPE.QUALIFIER` hub renames and the
  file-classification codification, but **not** the lowercase-prefix family or the prefix-less-workflow gap. This WU
  pulls the frontmatter-`type` / prefix-scheme question out of it if that lands with cleaner boundaries; agree the
  split at planning time.
- **`arc-backend` / `strategy-storage-evolution`** — OKF-as-projection composes with ADR-022 record/projection +
  Architecture B; coordinate the projection-readiness thread (captured in the arc-backend draft).
- **`composable-workflows`** — the `index.md` hub pattern is concrete input to its `system/workflows/` navigability
  open question (captured in its inbound buffer).
- **`knowledge-lint`** — the enforcement-side sibling of the same convergence (the "Lint" operation).
- **`docs-content-sweep`** — owns the public-facing framing copy (the LLM-wiki-family on-ramp); see its framing note.

## Sources

- OKF spec — `github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md` (v0.1, 2026-06-12).
- Karpathy LLM-wiki — `gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`.

## Scope estimate

Small–Medium and design-led. Mostly evaluation + a correspondence doc; any frontmatter-`type` adoption would be a
larger, separate cascade decided here first.

---
