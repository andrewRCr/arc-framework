# Draft: adopter-markdown-contract — ARC's markdown-format contract with adopters (out-of-box lint fit)

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-07); captured
  during session-init discussion of the adopter out-of-box markdown-lint experience, 2026-07-05.
- **Purpose:** Define what ARC requires of a project's markdown linter versus what is mere author-preference, so an
  adopting team gets a clean first impression on ARC's own files and a rule disagreement can never break ARC.
- **Provisional:** design direction only (from discussion, not yet groomed); no design authority until committed.

---

## Inbound Buffer — Pending Integration

> _Routed-in concern pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`)._

### `[ ]` **Define ARC's markdown-format contract with adopters (out-of-box lint fit)**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: adopter-markdown-contract`), housekeep drain (2026-07-07).
- _Observation:_ ARC's standard surfaces (task lists, USER-INBOX, templates, machine-parsed files) rely on wide
  lines and deep nesting that trip a default markdownlint. An adopting team installs ARC and either has no config
  (defaults flag ARC's own files heavily) or a preexisting config (conflicts with what ARC's parser needs) — either
  way a noisy first impression on ARC's own content, and worse, an adopter with a strong opinion on a rule may
  abandon ARC over a lint disagreement. Two distinct problems are entangled: (A) ARC's _shipped_ files trip the
  adopter's linter; (B) ARC asks the adopter to _author_ new markdown in a structure ARC machine-parses.
- _Design direction (from discussion, not yet groomed):_ separate **parser-required** invariants from
  **author-preference** — most of what trips defaults (MD013 line length, MD007 indent width) is cosmetic, not
  parser-load-bearing. Highest leverage is **parser tolerance** (accept 2- or 4-space nesting etc.) so almost
  nothing about lint is required for correctness — then a rule disagreement can't break ARC. Mechanisms, by
  leverage: (1) scope ARC-shipped content out of the adopter's lint (it is vendored tool content, like
  `node_modules`) via a shipped ignore glob; (2) ship any in-tree ARC config in the **most portable format**
  (strict `.markdownlint.json`, not cli2-only `.jsonc`); (3) an **extendable** shareable config (eslint-config-*
  pattern) for adopters who want ARC's conventions on their own content, with per-rule override authority. Hooks
  stay the _dev's_ gate — not an adopter-imposed mechanism.
- _Related WUs (coordinate; candidate cohort):_ `markdown-formatting` (internal dev-repo formatting hygiene —
  distinct **audience**, deliberately not folded), `quality-gate-hooks` (enforcement side — dev gate, not adopter
  imposition), and `knowledge-lint` (structural/parse validation of guidance surfaces). These share the
  markdown-structure domain and should either form a cohort or explicitly coordinate scope.
- _Related errand (partly realized at this drain):_ the LSP-parseability errand — making `.markdownlint-cli2.jsonc`
  strict-JSON-valid — is executing as its own errand in this housekeep batch (2026-07-07). It advances mechanism
  (2) above (portable config format) for the dev repo; this WU still owns the adopter-facing contract (ignore glob,
  shareable config, parser-tolerance decision).
