---
domain: your_domain
purpose: One-line description of what this domain covers.
---

<!--
Scaffold for a DEV-RULES domain file — project-type-specific constitutional rules (e.g.,
frontend, backend, mobile, data). Copy to `reference/constitution/DEV-RULES.{DOMAIN}.md` in
your project, fill in the frontmatter above, and replace the body below.

**Filename/domain case contract (mechanical — enforced by the pre-commit frontmatter hook
and the `arc status --session-init --json` probe, not convention):**

- Filename fragment `{DOMAIN}` must be uppercase — e.g., `DEV-RULES.FRONTEND.md`
- `domain:` value must be lowercase — e.g., `domain: frontend`
- `fragment.toLowerCase()` must equal `domain` exactly

Worked example: file `DEV-RULES.FRONTEND.md` with `domain: frontend`. The fragment
`FRONTEND` passes the uppercase check; `frontend` passes the lowercase check;
`"FRONTEND".toLowerCase() === "frontend"` satisfies the match. Non-matching pairs fail the
pre-commit hook; malformed frontmatter surfaces in `domainRules.warnings` at session-init.

Reserved filenames `DEV-RULES.ARC.md` and `DEV-RULES.PROJECT.md` carry no frontmatter and
are skipped by the probe — this template does not apply to them.

Delete this comment block after customizing the file.
-->

# Development Rules ([Domain Title])

[One-paragraph statement of scope — what kind of rules live here and how they relate to
the broader methodology ([DEV-RULES.ARC][dev-rules-arc]) and project-wide standards
([DEV-RULES.PROJECT][dev-rules-project]).]

---

## Contents

- [Section One](#section-one) — short description
- [Section Two](#section-two) — short description

---

## Section One

- Rule statement.

## Section Two

- Rule statement.

---

[dev-rules-arc]: DEV-RULES.ARC.md
[dev-rules-project]: DEV-RULES.PROJECT.md
