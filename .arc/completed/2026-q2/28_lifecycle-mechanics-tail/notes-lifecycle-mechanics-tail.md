# Notes: lifecycle-mechanics-tail

## Contents

- [Examined and rejected (audit residue)](#examined-and-rejected-audit-residue)

## Examined and rejected (audit residue)

Mechanics the lifecycle/errand-corpus audit examined and deliberately left out — recorded so task generation
doesn't resurface them as scope. Distinct from the spec's Non-Goals (which name the larger out-of-scope surfaces
owned by other WUs); these are the small "looks like a candidate, isn't" rejections:

- **`mkdir -p .arc/active/`** (the none/external authoring path) — no host verb needed; arc-in-git already
  `ensureDir`s on relocate / stub.
- **`_Hold:_` / `_Created:_` retain field-writes** — trivial, and gated behind a never-agent-suggested
  escape-hatch; not worth a mechanic.
- **Errand handoff checkpoint commit** — staging judgment + commit grammar, not a deterministic mechanic.
- **`clean-work-unit` temporal-noise strip** — content judgment, not deterministic.

The two seed dogfood instances that opened the audit (the missing `arc stub --cohort` affordance and the
relocate leg leaving an emptied cohort subdir) both became in-scope components — see the spec's Proposed Design.
