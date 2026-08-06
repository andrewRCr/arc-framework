# Task List: clearance-corpus-retirement

- **Design:** `spec-clearance-corpus-retirement.md`

---

## **Phase 1:** Retire the clearance install path

_Purpose:_ Remove the installable clearance workflow, template, and their packaging so new installs cannot
opt into a dead required-status path. Package source is authoritative; keep the `.arc/` mirror byte-identical
after each edit (package-project sync).

_Design decisions:_ Whole-file delete for setup + template; recipe/manifest drop those rows only and retain
`confirm-live-change-pair.sh`. Scripts README blurb reword is Phase 2 (retained surface).

### `[x]` **1.1 Delete setup workflow and merge-gate clearance template**

- _Goal:_ No installable clearance setup workflow or `arc-clearance.yml` template remains in package or project
  mirror

    - `[x]` **1.1.a Delete setup-arc-clearance workflow (package + .arc/)**
        - Removed `system/workflows/arc/supplemental/setup-arc-clearance.md` from package and `.arc/`

    - `[x]` **1.1.b Delete arc-clearance.yml merge-gate template (package + .arc/)**
        - Removed `reference/templates/arc/merge-gate/arc-clearance.yml` from package and `.arc/`

    - `[x]` **1.1.c Remove clearance coverage from merge-gate templates README**
        - Dropped the `arc-clearance.yml` product bullet, install-arc-cleared sentence, and
          `[clearance-setup]` link from package + `.arc/` merge-gate README

- _Outcome:_ Installable clearance setup workflow and template are gone; recipe README no longer offers them

### `[x]` **1.2 Drop retired paths from recipe and internal manifest**

- _Goal:_ Install recipe and digest manifest no longer ship or certify the deleted clearance files; live-pair
  script remains installed

    - `[x]` **1.2.a Remove deleted paths from init-recipe.json; keep live-pair script**
        - Dropped both deleted paths from `include_files`; `confirm-live-change-pair.sh` retained

    - `[x]` **1.2.b Drop deleted-path entries from project manifest.json**
        - Removed both file entries; rehashed merge-gate README; live-pair script entry kept

    - `[x]` **1.2.c Confirm no other inventory still names the deleted paths**
        - Remaining refs are Phase 2 setup surfaces and Phase 4 test pins (not install inventory)

- _Outcome:_ Recipe and manifest no longer ship/certify clearance files; live-pair script still installed

## **Phase 2:** Reword retained setup and install surfaces

_Purpose:_ Auto-merge setup, initial-setup offers, CODEOWNERS comments, and the live-pair script blurb stay —
but no longer describe, offer, or require `arc-cleared`.

### `[x]` **2.1 Excise clearance cross-references from auto-merge setup and CODEOWNERS**

- _Goal:_ Auto-merge lane docs describe classifier + `merge-ok` only; CODEOWNERS comments no longer name a
  required `arc-cleared` context

    - `[x]` **2.1.a Reword present-tense arc-cleared cross-refs in setup-merge-gate.md**
        - Procedural classifier + interlock boundary only; dropped independent-clearance install clauses
          (package + `.arc/`)

    - `[x]` **2.1.b Reword merge-gate CODEOWNERS template comment naming arc-cleared**
        - Template comment now points only at the canonical classifier (package + `.arc/`)

    - `[x]` **2.1.c Reword this repo's .github/CODEOWNERS arc-cleared comment**
        - Project CODEOWNERS comment names the canonical classifier, not a required `arc-cleared` context

- _Outcome:_ Setup and CODEOWNERS surfaces no longer describe installable required-status clearance

### `[x]` **2.2 Replace initial-setup merge-guard offer with merge.lock opt-in**

- _Goal:_ `01_verify-and-configure.md` offers a config opt-in for draft-lock semantics and does not point at
  Set Up ARC Clearance or leave an orphan "independently selectable merge guard" claim

- _Note:_ No new `setup-merge-lock.md`. Point at project config / template `merge.lock` and existing
  `arc merge lock` / ADR-031 / work-organization doctrine as needed.

    - `[x]` **2.2.a Replace ARC merge guard choices with merge.lock opt-in guidance**
        - Both initial and reconfigure sections offer draft-state merge lock config guidance (`draft` vs
          `none`)

    - `[x]` **2.2.b Drop orphan independently-selectable merge-guard claim**
        - Removed the structural-host-enforcement clause from the Planning auto-merge bullet

    - `[x]` **2.2.c Remove dead setup-arc-clearance link definitions**
        - Dropped the `[setup-arc-clearance]` link definition

- _Outcome:_ Initial-setup offers `merge.lock` opt-in only; no dead clearance setup path

### `[x]` **2.3 Reword the live-pair script install blurb**

- _Goal:_ Scripts README describes `confirm-live-change-pair.sh` as live-pair / lane-attestation support, not
  clearance publication

    - `[x]` **2.3.a Update scripts README entry for confirm-live-change-pair.sh**
        - Blurb now describes the live-pair / lane-attestation role (package + `.arc/`)

- _Outcome:_ Retained install surface no longer narrates the retired clearance publish path

## **Phase 3:** Doctrine, overview, and historical banner

_Purpose:_ Present-tense mechanism claims and host-side enforcement wording match the draft-lock model under the
spec's reword constraint; historical activation analysis is banner-marked, not rewritten.

_Design decisions:_ Exact prose is implementation judgment inside the fixed constraint — do not equate required
check with draft lock; keep "never infer merge safety from agent-layer discipline."

### `[x]` **3.1 Reword doctrine and overview present-tense clearance claims**

- _Goal:_ Live doctrine/overview no longer describe `arc-cleared` as current machinery; structural-enforcement
  loci still forbid inferring merge safety from agent review alone

- **Additional Context:** `spec-clearance-corpus-retirement.md` § Decision 4 (reword constraint)

    - `[x]` **3.1.a Update strategy-work-organization auto-merge / clearance mentions**
        - Classifier + interlock as procedural enforcement; draft lock named as separate per-PR hold, not a
          required-status substitute (package + `.arc/`)

    - `[x]` **3.1.b Update TECHNICAL-OVERVIEW Self-Hosting Review Gate passages**
        - Replaced `arc-cleared` lifecycle-lock narrative with `merge.lock: draft` / `arc merge lock release`
          wording in Self-Hosting Review Gate and Merge gating

    - `[x]` **3.1.c Update structural-enforcement wording in brief, strategy, and review methods**
        - AGENT-BRIEF + session-operations distinguish required check vs draft lock; keep never-infer caution;
          standard-review drops "only a required host-side check" phrasing; self/frontline sentences unchanged

- _Outcome:_ Live doctrine matches draft-lock model without equating it to a fail-closed required check

### `[x]` **3.2 Banner-mark historical clearance activation analysis**

- _Goal:_ `analysis-arc-clearance-activation.md` remains as history and is clearly marked as retired machinery

- _Note:_ ADRs (029 amendment, 031), `completed/**`, and coupling-audit tip inputs stay untouched — tip
  coupling `manifest.json` is not a residual allowlist. Analysis lives only under
  `.arc/reference/supplemental/analysis/` (not packaged).

    - `[x]` **3.2.a Add retired-machinery banner to analysis-arc-clearance-activation.md**
        - Banner at top points to ADR-031 / draft-lock displacement; body left as history

- _Outcome:_ Historical activation analysis is banner-marked, not rewritten

## **Phase 4:** Retarget coupled tests

_Purpose:_ Integration and e2e pins stop treating clearance as a shipped install asset and match the reworded
prose. This is the main red-suite failure mode if skipped.

### `[ ]` **4.1 Retarget review-gate and pr-open clearance pins**

- _Goal:_ Coupled tests green against the post-retirement corpus; presence cases inverted or removed; reword
  pins match new prose

    - `[ ]` **4.1.a Retarget review-gate-workflows integration pins**
        - In `packages/arc-framework/__tests__/integration/review-gate-workflows.test.ts`: retire or invert
          "ships an installable clearance workflow" and "keeps clearance setup additive…"; drop `arc-clearance.yml`
          / `setup-arc-clearance.md` from the byte-identical host-policy path set (keep live-pair script +
        `setup-merge-gate.md`); update setup/README/CODEOWNERS prose pins and initial-setup offer assertions for
        `merge.lock` opt-in

    - `[ ]` **4.1.b Retarget pr-open-extensions TECHNICAL-OVERVIEW and review pins**
        - In `packages/arc-framework/__tests__/integration/pr-open-extensions.test.ts`: update TECHNICAL-OVERVIEW
        `arc-cleared` pin and structural-enforcement / frontline-self-review sentence pins to the new wording

    - `[ ]` **4.1.c Confirm init e2e absence assertion still holds**
        - In `packages/arc-framework/__tests__/e2e/init.e2e.test.ts`: adjust only if the deletion path changes its
          premise

    - `[ ]` **4.1.d Run touched tests until green**
        - Touched test files and any recipe/init tests that enumerate include_files

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` `grep -riE "arc.cleared|arc.clearance"` over the corpus returns only historical records
  (`completed/**`, banner-marked analysis), ADR text, backlog planning artifacts that re-ground at their own
  grooming, and this work unit's own artifacts — no live workflow, template, CI, ruleset, recipe, install
  blurb, or CLI install surface

- `[ ]` Scripts `README.md` describes `confirm-live-change-pair.sh` as live-pair / lane-attestation support, not
  clearance publication

- `[ ]` `confirm-live-change-pair.sh` remains installed and referenced by lane attestation; recipe still ships it

- `[ ]` `01_verify-and-configure.md` offers `merge.lock` config opt-in (or equivalent), does not point at Set Up
  ARC Clearance, and leaves no orphan independently-selectable merge-guard structural-enforcement claim

- `[ ]` Coupled tests listed in Phase 4 are green against the post-retirement corpus

- `[ ]` Package and `.arc/` mirrors stay byte-identical for edited framework files

- `[ ]` All quality gates green (Markdown + ARC contract checks for docs; full suite when tests/recipe change)

- `[ ]` Ready for integration

---
