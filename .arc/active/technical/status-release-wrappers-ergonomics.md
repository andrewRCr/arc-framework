# Status: Release Wrappers — Ergonomics

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-ergonomics

- **Spec:** `prd-release-wrappers-ergonomics.md`
- **Task List:** `tasks-release-wrappers-ergonomics.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 6.R.1 — Design capture (notes file + ADR-017 amendment;
  6.R.1.a–b complete). Phase 6 fully complete (6.1–6.3).
- **Next Task:** Task 6.R.2.a — Resolver substrate `resolved-settings.ts` (line ~793)
- **Blockers:** [none]

- **Next Action:** Begin Phase 6.R Step 2 — code refactor for the four collapsed keys plus
  the `releaseEnabled` → `releaseOptedIn` rename. Start with 6.R.2.a (resolver substrate);
  6.R.2.b (consumer updates) and 6.R.2.c (verification audit — no orphaned yaml-key reads)
  follow. Per Task 6.R.2 _Note:_, co-bundle 6.R.4.b's yaml-key removal commit with 6.R.2's
  (or ensure 6.R.2 lands first) to avoid the transient inconsistent state.

---
