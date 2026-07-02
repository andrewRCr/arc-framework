# Draft: Frictionless Capture

- **Origin:** [internal] — captured during `out-of-wu-entry` planning discussion (2026-06-24).
- **State:** Planning — pre-spec capture (2026-06-24). Iterate toward a spec when implementation comes into
  reach; sequence after the two coordination seams below for the clean build.
- **Purpose:** Give ARC a **frictionless cold-session capture** path — a low-friction way to capture-and-sync a
  single inbox item when not already in a warm ARC session — by adding a **cold fast-path** to the existing
  `arc-inbox` skill rather than forcing full session-init + handoff just to jot one item.

---

## Problem / Motivation

There is no low-friction way to capture-and-sync a single inbox item when not already in a warm ARC session.
The `arc-inbox` skill assumes a warm session (session-init has run); cold-invoking it — or sitting through full
session-init + handoff just to jot one item — is too heavy. This is verified, repeatedly-wished-for demand.

Pure-CLI is a half-measure: the common case wants agent judgment (proper phrasing, field handling,
errand-vs-WU classification, `WU_Target` verify/suggest, ask-if-unclear), not a raw append that burdens
housekeep and piles up.

## Approach

Enhance the existing `arc-inbox` skill with a **cold fast-path** — invoked with the rough idea as an arg in a
fresh (non-ARC) agent session; skip session-init **and** handoff; minimal identity bootstrap only; apply the
same judgment as the warm path; capture; **sync per arc-config** (`session.remote_sync` / `user.notes_push`);
report done. Single-item, fast, judgment retained, agent uses the CLI behind the scenes.

## Architecture (already the blessed seam)

Judgment lives in the `arc-inbox` skill; the deterministic managed-write CLI `arc inbox add` is owned by
`operational-state-docs` (OSD). This WU is the skill side + cold entry path; compose with `arc inbox add` when
OSD ships it (interim: current append mechanics). Forward-compat with OSD's CLI; do not build that CLI here.

## Warm/cold detection

Consume the session marker owned by `skill-infrastructure-cleanup` (§ "Guard ARC skills against cold
invocation" — session-init plants, session-handoff removes). That WU frames the marker as a guard ("go run
`arc-session` first"); this WU **inverts** it for `arc-inbox` — cold is not an error to block but the signal to
take the lightweight self-bootstrap path. Interim before the marker ships: make the cold path
self-sufficient/idempotent (verify identity + resolve inbox path unconditionally). Steer **off** "agent memory"
as the detector — a fresh session can't reliably know it's fresh (absence-of-signal is fragile).

## Coordination (soft, not hard blockers)

`operational-state-docs` (the `arc inbox add` write primitive) and `skill-infrastructure-cleanup` (the
warm/cold marker). Sequence after both for the clean build; doable interim but would duplicate write mechanics
OSD will re-home (rework).

**Shared-inbox model seam (2026-07-02):** the cold path writes `INBOX.USER` only — never the project inbox
(`ATOMIC-INBOX` → `INBOX.PROJECT`), whose sole write points are the drain's promotion and sweep (the
capture-personal-first invariant in `draft-shared-inbox-model.md`). Capture-time classification (`WU_Target`
suggestion) stays a provisional hint; the drain's disposition gate — `inbound-routing-method`'s coupling +
horizon rubric — is authoritative, so the cold path never needs that judgment to be final at capture speed.

## Symmetry note

`out-of-wu-entry` enriches the ARC session door (more entry intents honored); this WU removes the need for the
door entirely (cold skill invocation) — opposite ends of the "out-of-WU work shouldn't require winding down"
spectrum, no shared mechanism.
