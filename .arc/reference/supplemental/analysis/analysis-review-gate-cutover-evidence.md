# Review Gate Acceptance Evidence and Extraction Map

This document is the authoritative sanitized acceptance record and extraction map shared by the repository's inactive
review-controller implementation, live qualification, enforcement promotion, and later reusable GitHub adapter. It
defines stable boundaries and evidence slots; it does not claim that qualification or promotion has occurred.

Raw non-secret API records stay in the operator's private mode-restricted checkpoint directory. Tracked evidence may
contain only immutable GitHub ids and URLs, exact commit heads, versions and digests, capability outcomes, enforcement
summaries, timestamps, dispositions, and hashes. Credentials, private keys, secret values, token values, attestation
bodies, command captures containing authentication, and unredacted API payloads are not fields in this contract.

## Reusable Neutral Contracts and Ports

The reusable core lives under `packages/arc-framework/src/scripts/review-gate/core/` and the provider-neutral parts of
`runtime/`. It owns these semantics without depending on GitHub or a named review provider:

- versioned policy and requirement derivation;
- durable request reservation, immutable trigger generation, receipt identity, and ledger validation;
- evidence admission, exact-head and full-change-set binding, contamination, fallback, and aggregate verdicts;
- finding identity, head-mutation authorization, settlement authority, and conversation lifecycle;
- passive CI/review waiting and canonical state-change results;
- injected host, provider, action, storage, clock, and projection ports.

These contracts are the extraction boundary. Repository policy and provider branding must not move into the neutral
core when a public adapter consumes it.

## GitHub and Provider Implementations

The GitHub implementation owns canonical REST/GraphQL reads, App-authored ledger comments and check runs, source
identity verification, event discovery, default-branch reconciliation, exact-head re-query, developer-authenticated
actions, and original-thread reply/resolution. The GitHub App has no service or webhook runtime; protected Actions
jobs mint short-lived installation tokens and serialize writes per repository/pull-request lane.

Provider implementations remain replaceable behind the neutral adapter contract:

- `coderabbit-pr` owns the one-shot label, later full-review command, resolved-configuration proof, substantive result
  parsing, stale/unknown handling, capability declaration, and any provider-owned settlement it can prove.
- `codex-pr` owns the rubric-bearing developer comment, effective guidance digest, pinned App/bot parsers for standard
  findings and clean issue comments, exact reviewed-head resolution, unknown grammar, and separately qualified
  connected-account behavior.
- qualified agent and human attestations use one source-neutral manifest. The authenticated submitter remains distinct
  from an agent reviewer claim, and human evidence requires an authenticated non-author reviewer.

## Self-Hosting Policy

Self-hosting policy is repository-specific and is not part of the reusable core:

- provider order is `coderabbit-pr`, then `codex-pr`;
- `independent-analysis/v1` covers intent/scope, correctness/failure behavior, trust/compatibility, verification, and
  coherence/maintainability over the complete current change set;
- only a controller-owned trigger may satisfy a reservation; unowned commands contaminate the generation;
- fallback requires proven pre-effect rejection/capacity exhaustion or terminal no-effect evidence;
- at least one hosted provider must prove a complete satisfying path before activation;
- connected-account behavior remains parser-only unless an admissible intentionally unconnected actor proves the
  complete terminal path;
- active flights freeze pushes, and each finding retains its original conversation locus and distinct FIX, DEFER,
  REJECT, or provider-owned closure authority;
- project review hooks and App-owned required contexts remain inactive until promotion proves them add-before-remove.

## Qualification Boundary and Inputs

Qualification is bounded by these checked-in implementation properties:

1. The launcher runs from a clean local default branch equal to the immutable remote default-branch and implementation
   SHA, using an authenticated developer whose immutable GitHub id matches the scope.
2. Scope, probe descriptors, checkpoints, and raw non-secret evidence live outside the repository under directory mode
   `0700` and file mode `0600`.
3. Developer authentication performs only typed assigned actions. App, forced-token, and emergency-repair probes use
   protected default-branch workflows and protected environments.
4. Every result is re-queried from canonical GitHub state, bound to the disposable PR/head and workflow SHA, hashed,
   and checkpointed before the next cell begins.
5. Resume is explicit and accepts only the exact validated prefix. A blocked, mismatched, contaminated, fixture-backed,
   credential-shaped, or changed-default-branch run emits no passing candidate.
6. Activation accepts only the deterministic provider-policy and provisional-evidence operations compiled from the
   complete candidate. Manual additions, omissions, edits, path changes, or digest drift are refusals.
7. Repair and promotion preserve a non-empty proven authority set and add/prove replacement authority before removing
   the prior context.

### Qualification input contracts

The private `scope.json` and `probes.json` files use these exact shapes. The launcher validates them again against
live workspace and GitHub state; a descriptor is not evidence by itself.

```ts
interface QualificationScope {
  repositoryId: string;
  repositoryRef: string;
  defaultBranch: string;
  defaultBranchSha: string;
  implementationSha: string;
  qualificationPullRequest: number;
  disposablePullRequest: number;
  disposableHeadSha: string;
  expectedActorIdentity: string;
  policyVersion: string;
  parserVersion: string;
  parserDigest: string;
  rubricVersion: "independent-analysis/v1";
  guidanceDigests: Record<string, string>;
  sourceIdentities: { coderabbit: string; codex: string };
  terminalUnavailableMode: "parser-only" | "terminal";
}

interface QualificationProbeDescriptor {
  cellId: string;
  result: {
    cellId: string;
    status: "passed";
    outcome: string;
    sourceIdentity: string;
    triggerPath: "label" | "comment" | null;
    evidenceRef: string;
    rubricDimensions: string[];
    admissibleActor: boolean;
    fixture: false;
  };
  evidenceApiPaths: string[];
  dispatch: "none" | "reconcile" | "qualify-token" | "repair";
  repairAttestation?: string;
}
```

Provider cells carry all five rubric dimensions in canonical order. The CodeRabbit label and command cells use
`label` and `comment`; the Codex command cell uses `comment`; every other cell uses `null`. Pending, fallback, event,
ledger, and all provider cells dispatch reconciliation. Token cells dispatch qualification, repair authority dispatches
repair, and await/finding/closure cells use no workflow dispatch. Evidence API paths begin with
`repos/<owner>/<repository>/`; evidence references begin with the matching durable GitHub repository URL.

## Required Qualification Matrix

The closed matrix contains these ids in order. A checkpoint is an exact prefix of this list; no row is optional.

```text
pending-first
coderabbit-label-trigger
coderabbit-command-trigger
coderabbit-clean
coderabbit-findings
coderabbit-stale
coderabbit-unknown
codex-comment-trigger
codex-clean
codex-findings
codex-stale
codex-unknown
codex-connected-account
provider-fallback
await-ci
await-review
event-repair
finding-fix
finding-nonfix
provider-closure
ledger-reconstruction
token-stateless
token-classic
repair-authority
```

## Source Identities and Prior Sanitized Facts

These facts predate acceptance and are inputs or parser evidence, not activated capability declarations:

| Subject | Sanitized fact | Qualification significance |
| --- | --- | --- |
| ARC review App | App id `4268856`; bot user id `302312524` | Re-prove installation, repository selection, permissions, and every emitted source id |
| GitHub Actions | App id `15368` | Re-prove CI source and the exclusive emergency-status writer |
| Hosted Codex | App id `1144995`; bot user id `199175422` | Pin clean/findings/connected-account parsers to both identities |
| Codex trigger | A developer-authored request produced exact-head findings and clean artifacts | Re-run the owned full-rubric path through shipped code |
| Connected account | An App-authored response matched the parser but used an inadmissible actor | Keep parser-only/non-terminal unless an admissible actor proves terminality |
| CodeRabbit native approval | An empty approval appeared without a qualifying owned request | Native approval alone remains non-satisfying |
| Installation token formats | Both temporary forced formats authenticated the same App in an earlier probe | Re-run both through the exact shipped consumer and retain no token value |

The App permission target is metadata read, checks write, pull requests write, and statuses read for only this
repository, with no contents write or merge authority. Qualification must re-query the live installation rather than
treat this statement as proof.

## Qualification Result Slots

The implementation delivery intentionally leaves all live slots empty. The activation compiler may populate only
`qualification.provisional` after a complete baseline run. Promotion replaces or extends that provisional record only
after the enabled-policy matrix passes from merged default-branch code.

```yaml
qualification:
  provisional: null
  acceptance: null
```

A provisional record contains the baseline default-branch SHA, policy/parser/rubric/guidance versions and digests,
matrix digest, checkpoint-chain hash, source and actor identities, capability outcomes, and evidence references. It
does not alter required checks or project-hook activation and is not a `CutoverAcceptanceProof`.

The deterministic handoff functions are `compileQualificationActivation` and
`validateQualificationActivationDiff` in
`packages/arc-framework/src/scripts/review-gate/runtime/qualification-activation.ts`. The first maps a revalidated
candidate to the only policy and provisional-manifest operations; the second compares the proposed delivery operation
by operation and rejects every extra path or manual edit.

## CutoverAcceptanceProof Schema

The final sanitized proof is admissible only after the complete enabled-policy matrix and enforcement boundary are
live-revalidated. Hash strings are lowercase SHA-256; commit ids are full 40-character Git SHAs; evidence references
are durable HTTPS GitHub URLs.

```ts
type Sha256 = string;
type GitSha = string;

interface CutoverMatrixCellProof {
  cellId: string;
  outcome: string;
  sourceIdentity: string;
  actorIdentity: string;
  pullRequestNumber: number;
  headSha: GitSha;
  workflowSha: GitSha;
  evidenceUrl: string;
  rawCheckpointHash: Sha256;
}

interface CutoverAcceptanceProof {
  schemaVersion: 1;
  status: "accepted";
  implementation: {
    pullRequestNumber: number;
    pullRequestUrl: string;
    mergeCommitSha: GitSha;
  };
  qualification: {
    pullRequestNumber: number;
    pullRequestUrl: string;
    activationCommitSha: GitSha;
  };
  liveDefaultBranchSha: GitSha;
  enabledPolicy: {
    version: string;
    digest: Sha256;
    providerSourceIdentities: string[];
  };
  rubric: {
    version: "independent-analysis/v1";
    digest: Sha256;
  };
  guidanceDigests: Record<string, Sha256>;
  parser: {
    version: string;
    digest: Sha256;
  };
  matrix: {
    requiredCellIds: string[];
    resultDigest: Sha256;
    checkpointChainHash: Sha256;
    cells: CutoverMatrixCellProof[];
  };
  enforcementBoundary: {
    mode: "legacy" | "shadow" | "dual" | "final";
    requiredChecks: Array<{ context: string; appId: number }>;
    genericRequiredApprovals: number;
    postPullRequestOpenActive: boolean;
    preMergeActive: boolean;
  };
}
```

Validation requires the exact ordered required-cell list, one result per cell, at least one enabled hosted clean path,
matching implementation/qualification/default-branch identities, current policy/rubric/guidance/parser digests, a
live source-pinned enforcement snapshot, and a valid raw-checkpoint hash for every cell. Unknown fields, missing rows,
duplicate rows, placeholders, non-GitHub evidence URLs, or values derived from unshipped code fail closed.

## Extraction Handoff and Open Productization Constraints

A reusable GitHub adapter can extract the neutral contracts first, then supply GitHub ports and provider adapters
without importing self-hosting policy. The handoff must preserve immutable receipt/ledger parsing, exclusive trigger
windows, source-pinned evidence, exact-head waiting, finding settlement, event tombstones, and add-before-remove repair.

The repository implementation does not settle the public package's installation, configuration, provider-discovery,
team-role, webhook/service, environment-provisioning, branch-protection, or upgrade surfaces. Productization must also
decide how projects declare provider identities and capabilities, verify repository-wide provider configuration,
store durable host state, expose diagnostics, and migrate existing ledgers. Those choices cannot weaken the neutral
contracts or treat this repository's policy order and source ids as defaults.

---
