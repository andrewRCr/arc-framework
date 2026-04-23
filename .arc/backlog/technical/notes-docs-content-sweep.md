# Notes: Docs Content Sweep

**Purpose:** Staging file for content extracted from `.arc/` source files during operational-context audits.
Populated by source WUs (initial population: Session-Init Optimization, Phase 4); consumed by the
docs-content-sweep WU when `plan-docs-content-sweep.md` graduates to a PRD.

**Why a staging file:** Extractions land here as structured entries — verbatim prose plus traceability
metadata — so the sweep WU has reviewable content to absorb rather than reconstructing context from
in-repo diffs months later. Each entry is self-contained: source path, line range, the extracted prose,
advisory destination, and stylistic integration notes.

**Lifecycle:**

- **Populate:** Source WU audit subtasks add entries below the § Entries heading using the locked
  template. Append-only — preserve entry order and never reuse numbers; reviewer cross-references rely
  on stable numbering.
- **Source-side placeholder:** Each extraction leaves a `[TODO-docs-site]` reference-style link
  placeholder in the source file at the extraction site (see § Source-Side Placeholder Convention).
- **Sweep:** The docs-content-sweep WU absorbs entries into `docs/` IA, resolves all `[TODO-docs-site]`
  placeholders to final docs URLs, and archives this file when the sweep completes.

**Intended lifespan:** Until docs-content-sweep WU archives.

---

## Entry Template

Locked shape for every entry under § Entries. Mirrors the structure described in
`plan-docs-content-sweep.md` § Content Contributions.

```markdown
## Entry N — <source-basename> § <section-anchor>

**Source:** <repo-root-relative path> (lines X–Y)

**Content:**

> <verbatim prose, multi-line blockquote>

**Suggested destination:** <docs/ IA path, or "open — editorial at sweep time">

**Stylistic integration notes:** <rephrasing needs, audience shift from dual-audience `.arc/` prose to
docs-only readership, anchor IDs that must be retained for inbound link stability>
```

**Field notes:**

- **Heading:** `<source-basename>` is the file name with extension (e.g., `DEV-RULES.ARC.md`);
  `<section-anchor>` is the markdownlint slug of the source heading the extraction came from
  (e.g., `commit-discipline`). Numbering (`Entry N`) is global across this file, not per source —
  increment monotonically.
- **Source path:** repo-root-relative (e.g., `.arc/reference/constitution/DEV-RULES.ARC.md`); line range
  references the pre-trim line numbers so reviewers can compare against `git show` at the extraction
  commit. If the extraction spans non-contiguous regions of the source, file separate entries — one
  entry per contiguous extraction.
- **Content blockquote:** verbatim prose; preserve markdown formatting (lists, emphasis, code spans,
  nested fences via indentation). The blockquote is the absorption payload — the sweep WU adapts it,
  not invents from it.
- **Suggested destination:** advisory only; final IA placement is editorial at sweep time. Use the
  literal string `open — editorial at sweep time` when no specific destination is obvious.
- **Stylistic integration notes:** flag dual-audience phrasing that needs adaptation, anchor IDs that
  inbound links depend on, and any cross-references that move with the content.

## Source-Side Placeholder Convention

Every extraction leaves a `[TODO-docs-site]` reference-style link placeholder in the trimmed source
file at the extraction site. The placeholder gives readers an inline pointer for the absent material
and gives the sweep WU a single greppable anchor for every absorption point.

**Syntax:**

```markdown
See [extracted topic name][TODO-docs-site] for detailed background.
```

The link text is descriptive prose chosen by the extracting author; the reference label is always the
literal string `TODO-docs-site` (no numeric suffixes, no per-entry variants — uniqueness across the
file isn't needed because the sweep resolves them globally).

**Placement:** at the extraction site in the trimmed source — typically the sentence or paragraph that
previously introduced the now-extracted material. The placeholder doesn't replace structural elements
(headings, list scaffolding); it's an inline pointer woven into the trimmed prose.

**Definition:** add a single stub definition at the bottom of each source file that contains one or
more placeholders, alongside other reference-link definitions:

```markdown
[TODO-docs-site]: # "Placeholder pending docs-content-sweep — see notes-docs-content-sweep.md"
```

The `#` URL is a no-op anchor; the title attribute flags the reference as TBD on hover. One stub per
file serves all `[TODO-docs-site]` references within that file (DRY — multiple inline references resolve
to the same stub). The stub satisfies MD052 so the source WU's zero-tolerance markdown-lint gate stays
green during audit work, while preserving the placeholder-as-signal intent: readers see a link, hover
surfaces "pending", grep finds every absorption point, and the sweep WU has a clear write target (the
stub definition itself) when rewriting to the final docs URL.

**Completion semantics:** the docs-content-sweep WU resolves every `[TODO-docs-site]` reference to its
final docs URL by rewriting the stub definition in each file (inline references inherit automatically
because they share the label). Verification: `grep -rn "TODO-docs-site" .arc/
packages/arc-framework/arc/` returns zero matches when the sweep completes — both inline references
and stub definitions disappear in the same pass.

**Why the convention lives here, not in `plan-docs-content-sweep.md`:** the convention has two halves.
The sweep-side half (resolution semantics, IA placement) lives with the sweep workflow in
`plan-docs-content-sweep.md` § Content Contributions. The source-side half (syntax, placement, when
to leave one) lives with the staging file source authors populate — this file. Each half lives next
to the work it governs.

---

## Entries

<!-- Populated by source WU audit subtasks. Append-only; preserve numbering. -->

[none yet]
