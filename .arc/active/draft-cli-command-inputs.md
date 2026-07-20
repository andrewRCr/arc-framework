# Draft: cli-command-inputs

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Define and implement a uniform validated input contract for interactive and non-interactive ARC
  commands.

---

## Problem / Motivation

ARC commands use Commander arguments, Clack prompts, confirmation helpers, and local defaults inconsistently.
Known entry points have acquired isolated non-TTY safeguards, but another prompt can still block or auto-cancel
when invoked by an agent or CI. More seriously, some required-input paths may silently choose provisional values
that are acceptable only during an interactive conversation.

The CLI needs a command-wide contract that distinguishes safe optional prompting, required input, and destructive
confirmation. It must make automation deterministic without weakening interactive guidance or lifecycle policy.

## Goals

- Inventory every prompting command and classify each input under one non-interactive behavior matrix.
- Validate Commander and Clack-derived values with schemas composed from `cli-schema-kernel`.
- Let optional prompts select only an explicitly safe, non-mutating default under CI or non-TTY execution.
- Make required inputs fail fast with actionable flag guidance when interaction is unavailable.
- Require explicit automation consent for destructive confirmation.
- Provide the required-input substrate needed by later stub-creation and promotion work.

## Non-Goals

- Replace Commander or Clack, redesign prompt presentation, or churn the prompt framework.
- Own work-unit lifecycle-transition policy or define the future stub verb.
- Make unsafe or mutating choices merely because they are current interactive defaults.
- Add silent provisional values, placeholder owners, or default `P3` priority where input is required.
- Change command semantics unrelated to input acquisition and validation.

## Design Decisions

### Command-class matrix

Every prompt/input site is assigned one of three classes:

- **Optional with safe default:** interactive runs may prompt; CI/non-TTY runs may auto-select a documented,
  non-mutating default. Existing examples include `start --here` and `user open` stale-subdirectory handling.
- **Required input:** interactive runs elicit the value. CI/non-TTY runs fail immediately, name each missing value,
  and show the exact flags required to proceed. No silent provisional or priority default is permitted.
- **Destructive confirmation:** interactive runs require a positive confirmation. CI/non-TTY runs require an
  explicit confirmation flag and otherwise fail without mutation.

TTY detection is an input to policy, not scattered command behavior. CI and non-TTY cases must be deterministic
and testable independently.

### Flag contract

Spec formalization must choose the uniform automation flag shape after completing the command inventory. The
leading option is `--yes`, because the CLI already uses confirmation precedent and it communicates explicit
consent. A broader `--no-input` flag is acceptable only if its semantics remain precise across all three classes;
it must never imply consent to destructive actions or permission to invent required values.

Commands may still expose domain-specific value flags. Error messages name those flags rather than asking a
non-interactive caller to rerun interactively.

### Input acquisition and validation

- Parse Commander inputs, environment-derived values, and Clack answers through domain schemas composed from the
  kernel.
- Normalize only where the domain contract explicitly permits it; otherwise surface the rejected value and rule.
- Share input acquisition policy and diagnostics without centralizing command-specific semantics.
- Ensure prompt cancellation has a distinct outcome from invalid input and unavailable interaction.

### Lifecycle seam

Stub creation and promotion currently have asymmetric required-input paths. This member owns the reusable substrate
for acquiring and validating those values in interactive and non-interactive modes. `lifecycle-transition-core`
owns the stub verb, transition policy, and which values the lifecycle requires. Neither work unit should duplicate
the other's decision layer.

### Inventory scope

Start with all Clack/confirmation call sites and known commands including `start`, `user open`, `user-sync`, `sync`,
and release/setup flows. Reconcile every prompt as optional-safe, required, destructive, or an audited false
positive. New prompt sites added during implementation must adopt the same substrate.

## Delivery and Verification

- Produce the command-class matrix before implementation and use it as the acceptance inventory.
- Test every class under interactive TTY, non-TTY, and CI signals, including contradictory flags and cancellation.
- Add command-level tests proving that non-interactive execution never waits for input.
- Verify destructive commands perform no mutation without explicit consent.
- Verify required-input errors are actionable and never create partial state.
- Add schema tests for domain-specific values and preserve existing safe-default behavior.

## Alternatives

- **Require `--yes` for every prompt:** rejected because optional safe defaults do not represent consent and required
  values cannot be invented.
- **Use TTY detection alone:** rejected because automation needs explicit, inspectable behavior and CI can expose
  unusual stream configurations.
- **Let each command decide:** rejected because that is the inconsistency and hang risk being removed.
- **Replace the prompt stack:** rejected because the failure is policy, not presentation technology.

## Risks

- A nominally safe default may still mutate or discard information in an edge case.
- One global flag can imply different levels of consent unless the matrix semantics are strict.
- Command tests can miss hangs if they mock prompts above the actual stream boundary.
- The lifecycle seam can blur, causing this member to absorb product policy or the transition work to duplicate
  input mechanics.

## Unknowns and Assumptions

- Choose `--yes`, `--no-input`, or a deliberately split contract during spec formalization after the full inventory;
  `--yes` is the current recommendation for destructive consent.
- Confirm whether CI detection adds behavior beyond non-TTY detection or serves only as a stronger non-interactive
  signal.
- Assume every required value can be expressed by an existing or newly added explicit flag; gaps belong in the
  command matrix before implementation.

## Scope Estimate

Large (week+). Class `Heavy`: the implementation is cross-command, and the flag/consent contract must be settled
before code changes. Depends on `work-organization-reform` and `cli-schema-kernel`.
