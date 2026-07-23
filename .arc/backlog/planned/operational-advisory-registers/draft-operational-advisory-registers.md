# Draft: Operational Advisory Registers

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-07-23); captured during the
  `session-locus-model` right-sizing audit.
- **Purpose:** Make routine operational narration preserve signal under normal parallel work by assigning each
  advisory to an explicit urgency register.

---

## Problem / Motivation

Session-init and adjacent lifecycle surfaces emit an increasing number of conditional advisories. Under ordinary
parallel work, several conditions are nearly permanent: the base moves while sibling WUs integrate, sibling
worktrees exist, mid-WU commits remain unpushed, and personal notes lag temporarily. Rendering expected steady
state with the same cadence as actionable failures makes the whole surface easier to ignore.

The once-per-calendar-day nudge-marker pattern already reduces noise for selected reminders, but each surface
chooses that behavior independently. There is no common register that tells authors which conditions always render,
which batch into periodic awareness, and which remain silent.

## Direction

Classify routine operational output across session init, recovery, handoff, and CLI-composed narration into three
registers:

- **Actionable now:** always render because immediate intervention is required.
- **Awareness:** batch or rate-limit through the existing daily nudge mechanism.
- **Expected:** remain silent because the condition is ordinary steady state.

Codify the classification where advisory authors encounter it, likely across the session-operations strategy and
the probe/narration composition sites. Inventory the complete current surface before changing cadence so failures
cannot be hidden by a category chosen from examples alone.

## Composition

`session-locus-model` owns a locus-scoped noise diet for its own surfaces. This WU generalizes the register
discipline across routine operations after that implementation integrates; it does not reopen the completed locus
model.

---
