---
name: arc-inbox
description: Capture a deferred work item to USER-INBOX — classify it by character, build the managed entry, and route it to the right section.
disable-model-invocation: false
---

# ARC Inbox

The unified capture entrypoint. The routing *decision* — fix inline, run an errand now, or defer to
capture — is `DEV-RULES.ARC § Discovered Work Routing`; consult it first. This skill runs once that
call is **capture for later**, and owns entry construction. Draining captured items is `arc-housekeep`'s;
executing them is `arc-session`'s.

1. Confirm capture is the route.

   - A current-WU concern is fixed **inline** (never captured); an urgent out-of-WU concern is an
     **errand now** (`arc-session --errand`). Only a non-urgent, out-of-WU concern lands here.
   - If the item isn't "capture for later," stop and route it per `DEV-RULES.ARC § Discovered Work
     Routing` — the table there makes the inline / errand-now / capture-defer call.

2. Classify by fate → section.

   - **Errand** — self-evident, single-session, below both intrinsic floors → `## Errand`. Atomic in character:
     one indivisible concern (possibly an extended sweep), no design to record and no durable cross-session plan a
     correct execution must navigate.
   - **Work Unit** — clears either floor (a design worth recording, or a durable cross-session plan) → `## Work Unit`.
   - Pick by *fate* (the two-floor gate), not by destination — the section is the routing fate; the finer home
     (existing stub, new stub, standalone errand, shared flush) resolves later at the drain.
   - **Infra smell (advisory, never a gate):** if a `## Errand` capture obviously touches load-bearing infra
     (`.arc/system/**`, strategies, `arc-config.yml`), several files, or carries a design fork, it likely needs the
     **reviewed lane** (a blast-radius read, orthogonal to the wrapper) — and is worth a second look for **design
     hiding** in it (a derivation floor quietly crossed → it is a Work Unit). Still file it under `## Errand` and
     let the drain re-triage — optionally note the smell in an `_Observation:_`. Capture stays coarse by design;
     the drain is the authoritative re-triage.

3. Build the entry.

   Shared shape — an H3 heading carrying a `[ ]` checkbox and a bold title, then italic-descriptor
   sub-bullets. Multi-line bullets separate with a blank line (loose-list).

   - **Descriptors** (prose, bare values): `_Observation:_`, `_Approach:_`, `_Files:_`, `_Scope:_`,
     `_Captured during:_` — and others as the entry warrants.
   - **`## Errand`** — the shared shape; **no `WU_Target`**. May carry the reminder flag (step 4).
   - **`## Work Unit`** — the shared shape **plus a `WU_Target:` line** naming its destination stub:
     - `WU_Target: <slug>` — route there if it exists; create it if not (dir decided at drain).
     - `WU_Target: <slug> (planned|provisional)` — the parenthetical is a new-stub dir hint, ignored
       once the target already exists.
     - `WU_Target: TBD` — undecided; resolved at drain.
     - No `new` keyword — existence-at-drain decides route-vs-create.

   ```markdown
   ### `[ ]` **Short imperative title**

   - _Observation:_ what surfaced and why it matters.
   - _Approach:_ the likely shape of the fix (optional).
   - _Captured during:_ <the work in hand>.
   ```

4. Reminder flag — `## Errand` only, optional.

   When the developer asks not to forget a capture, set the managed reminder field so session-init
   nudges them after a delay:

   - ``- _Remind:_ `true` `` — a *parsed* field marks itself by **backtick-delimiting its value** (the
     key stays bare-italic), distinguishing it from prose descriptors. Write it only when set; its
     absence reads as `false`.
   - ``- _Created:_ `<YYYY-MM-DD>` `` — **stamp the current date** yourself as the aging anchor (value
     backtick-delimited). It is tool-stamped at capture, not hand-written by the developer.

   These drive the personal-`USER-INBOX`-only reminder nudge gated by `inbox.remind_after_days`. For
   the field grammar and the nudge cadence, see `strategy-session-operations.md § USER-INBOX`.

5. Write it.

   - Append the entry to the chosen section of `user/{identity}/USER-INBOX.md` — personal and
     gitignored, so it accepts writes any time, from any branch, with no isolation cost. Leave existing
     entries in place; `USER-INBOX` drains at the between-WUs `arc-housekeep` flow.
   - **Homeless errand-class item** — one with no determinable home still captures to `## Errand` here; it
     transits to the shared `backlog/ATOMIC-INBOX.md` at the next drain. Never write the shared inbox
     directly from a capture — it is drain-written only (write isolation). The shared inbox is
     errand-class-only; spec-worthy work always graduates to a stub instead.
