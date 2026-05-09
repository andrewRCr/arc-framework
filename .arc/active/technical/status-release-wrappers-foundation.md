# Status: Interlock Release Wrappers — Foundation

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-foundation

- **Spec:** `prd-release-wrappers-foundation.md`
- **Task List:** `tasks-release-wrappers-foundation.md`
- **Sibling Work Unit(s):** `plan-release-wrappers-ergonomics.md`

- **Last Completed:** Task 6.3 — Refusal-message template harmonization
  audit; no drift, superseded by 1.5's `formatRefusal()` helper. Phase 6
  largely complete (6.1 ADR-017, 6.2 four-doc parent with 6.2.0/a/b/c/d
  subtasks, 6.3 audit, 6.5 sweep); only 6.4 ADR-018 + Phase 7 verification
  remain.
- **Next Task:** Task 6.4 — ADR-018: interlock value extension — trigger-set
  model + wrapper-scope-vs-permission rule (line ~501)
- **Blockers:** [none]

- **Next Action:** Start Task 6.4 — Draft ADR-018 per
  `notes-release-wrappers-foundation.md` § 1.5: trigger-set permissiveness
  ladder (`manual` < `on-{primary}` < `on-workflow` as trigger sets),
  wrapper-scope-vs-permission authorization rule, and prompt-vs-bypass
  framing with two-layered trust model (mechanical wrapper / agent judgment)
  graduate to the ADR. Distinct from ADR-017 — 017 covers _whether_
  defense-in-depth applies, 018 covers _how_ wrapper-side authorization
  works once opted in. Internal-only per § Architecture Documentation;
  no package-source counterpart. File: `.arc/reference/adr/adr-018-interlock-value-extension.md`.

---
