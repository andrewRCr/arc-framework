/** Static preflight and operation remedy definitions for v3 decomposition refusals. */

/** Stable invariant and correction text for one refusal code. */
export interface V3PreflightRemedyDefinition {
  invariant: string;
  correction: string;
}

export const V3_PREFLIGHT_REMEDIES: Readonly<Record<string, V3PreflightRemedyDefinition>> = {
  "source-base-ref": {
    invariant: "The configured source base must resolve through one local branch ref.",
    correction: "Correct the source base ref, then re-run preflight",
  },
  "result-base-ref": {
    invariant: "The decomposition result base must resolve through one local branch ref.",
    correction: "Correct the result base ref, then re-run preflight",
  },
  "source-candidate-ref": {
    invariant: "Every source candidate must use a distinct local branch ref outside the base ref.",
    correction: "Correct the reported candidate ref, then re-run preflight",
  },
  "source-candidate-duplicate": {
    invariant: "Each local source-candidate ref may appear only once.",
    correction: "Remove the duplicate candidate ref, then re-run preflight",
  },
  "source-origin-duplicate": {
    invariant: "One committed tree may contain only one metadata record for the source origin.",
    correction: "Remove the duplicate source metadata record, then re-run preflight",
  },
  "source-self-identity": {
    invariant: "A started source metadata record must name the branch whose tree contains it.",
    correction: "Correct the source branch identity, then re-run preflight",
  },
  "source-ambiguous": {
    invariant: "Exactly one local branch may qualify as the decomposition source.",
    correction: "Resolve the competing source branches, then re-run preflight",
  },
  "source-predecessor": {
    invariant: "The origin must have one qualifying started source or configured-base predecessor.",
    correction: "Restore a qualifying source predecessor, then re-run preflight",
  },
  "source-artifact-duplicate": {
    invariant: "Each source artifact path may appear only once in the pinned inventory.",
    correction: "Remove the duplicate source artifact path, then re-run preflight",
  },
  "source-artifact-mode": {
    invariant: "Every source artifact must use a supported regular-file mode.",
    correction: "Correct the reported source artifact mode, then re-run preflight",
  },
  "planning-profile": {
    invariant: "Source metadata and stored artifacts must define one sanctioned planning profile.",
    correction: "Correct the reported planning-profile field or artifact, then re-run preflight",
  },
  "source-unit-duplicate": {
    invariant: "Every scanned source unit must have one unique canonical identity.",
    correction: "Resolve the duplicate source unit, then re-run preflight",
  },
  "incoming-edge": {
    invariant: "Every incoming dependency must carry unique canonical current targets.",
    correction: "Correct the reported incoming dependency, then re-run preflight",
  },
  "incoming-edge-duplicate": {
    invariant: "Each incoming dependency identity may appear only once.",
    correction: "Remove the duplicate incoming dependency, then re-run preflight",
  },
  "outgoing-edge-duplicate": {
    invariant: "Each outgoing dependency identity may appear only once.",
    correction: "Remove the duplicate outgoing dependency, then re-run preflight",
  },
  "machine-envelope": {
    invariant: "Preflight must produce one canonical self-authenticating machine envelope.",
    correction: "Correct the reported source facts, then re-run preflight",
  },
  "starter-map": {
    invariant: "The recorded starter map must remain canonical and machine-authenticating.",
    correction: "Replace it with a fresh preflight map and reauthor the cut",
  },
  "source-logical-branch": {
    invariant: "The authored map must remain bound to the preflight source branch.",
    correction: "The source branch changed; re-run preflight and reauthor the cut map",
  },
  "source-ref": {
    invariant: "The authored map must remain bound to the exact source ref.",
    correction: "The source ref changed; re-run preflight and reauthor the cut map",
  },
  "source-head": {
    invariant: "The authored map must remain bound to the exact source commit.",
    correction: "The source commit changed; re-run preflight and reauthor the cut map",
  },
  "result-ref": {
    invariant: "The authored map must remain bound to the exact result-base ref.",
    correction: "The result-base ref changed; re-run preflight and reauthor the cut map",
  },
  "result-head": {
    invariant: "The authored map must remain bound to the exact result-base commit.",
    correction: "The result-base commit changed; re-run preflight and reauthor the cut map",
  },
  "source-artifact-inventory": {
    invariant: "The authored map must remain bound to the complete pinned source-artifact inventory.",
    correction: "The source artifact inventory changed; re-run preflight and reauthor the cut map",
  },
  "source-units": {
    invariant: "The authored map must remain bound to the scanned source units.",
    correction: "The source units changed; re-run preflight and reauthor the cut map",
  },
  "incoming-edges": {
    invariant: "The authored map must remain bound to the pinned incoming dependencies.",
    correction: "The incoming dependencies changed; re-run preflight and reauthor the cut map",
  },
  "outgoing-edges": {
    invariant: "The authored map must remain bound to the pinned outgoing dependencies.",
    correction: "The outgoing dependencies changed; re-run preflight and reauthor the cut map",
  },
  "preflight-id": {
    invariant: "The authored map must retain the preflight identity derived from all machine facts.",
    correction: "Replace it with a fresh preflight map and reauthor the cut",
  },
  "completed-map": {
    invariant: "Execution requires one canonical completed map bound to the selected origin.",
    correction: "Generate a fresh preflight map and reauthor the completed map",
  },
  "source-identity": {
    invariant: "An extraction map must retain the source origin, logical branch, and ref together.",
    correction: "The source identity changed; re-run preflight and reauthor the extraction map",
  },
  "result-base": {
    invariant: "An extraction map must retain the exact result-base ref and commit.",
    correction: "The result base changed; re-run preflight and reauthor the extraction map",
  },
  "source-unit-ambiguous": {
    invariant: "Changed bytes under a repeated heading must be reauthored without guessing their allocation.",
    correction: "Re-run preflight and reauthor the repeated-heading source allocation",
  },
};

export const V3_GIT_PREFLIGHT_REMEDIES: Readonly<Record<string, V3PreflightRemedyDefinition>> = {
  "missing-base": {
    invariant: "The configured local base branch must exist before source discovery.",
    correction: "Restore the configured local base branch, then re-run preflight",
  },
  "malformed-ref-list": {
    invariant: "Git must enumerate local refs as complete ref-and-object pairs.",
    correction: "Repair the reported local ref enumeration, then re-run preflight",
  },
  "malformed-tree-entry": {
    invariant: "Git must enumerate each committed source-tree entry in the requested canonical shape.",
    correction: "Repair the reported committed-tree entry, then re-run preflight",
  },
  "missing-blob": {
    invariant: "Every enumerated source blob must be readable from its pinned commit.",
    correction: "Restore the reported Git object, then re-run preflight",
  },
  "invalid-meta-encoding": {
    invariant: "Every source metadata artifact must be valid UTF-8.",
    correction: "Convert the reported metadata artifact to UTF-8, then re-run preflight",
  },
  "invalid-origin-meta": {
    invariant: "The selected origin metadata must carry a valid lifecycle state.",
    correction: "Correct the reported origin metadata, then re-run preflight",
  },
  "unsupported-artifact": {
    invariant: "Every source artifact must be a supported regular-file Git blob.",
    correction: "Replace the reported source artifact with a supported regular file, then re-run preflight",
  },
};

export const V3_OPERATION_RETRY_REMEDIES: Readonly<Record<string, V3PreflightRemedyDefinition>> = {
  "base-moved": {
    invariant: "The result base must remain at the plan's authenticated commit.",
    correction: "Refresh the repository state, then retry the selected mode",
  },
  "partial-projection-dirty": {
    invariant: "Partial protection requires a clean index and worktree for every transform-owned path.",
    correction: "Clean the reported projection, then retry the selected mode",
  },
  "branch-exists-unregistered": {
    invariant: "A deterministic candidate branch must have one matching ARC worktree registration.",
    correction: "Remove or register the conflicting candidate, then retry the selected mode",
  },
  "registered-at-wrong-path": {
    invariant: "A candidate registration must use its deterministic branch and worktree path.",
    correction: "Correct the reported registration, then retry the selected mode",
  },
  "occupied-path": {
    invariant: "The deterministic candidate worktree must be unoccupied before decomposition claims it.",
    correction: "Release the reported worktree occupant, then retry the selected mode",
  },
  "duplicate-registration": {
    invariant: "A deterministic candidate may have only one worktree registration.",
    correction: "Remove the duplicate registration, then retry the selected mode",
  },
  "candidate-head-mismatch": {
    invariant: "The candidate branch and registration must both remain at the authenticated base head.",
    correction: "Restore or remove the mismatched candidate, then retry the selected mode",
  },
  "marker-mismatch": {
    invariant: "A reusable candidate worktree must retain ARC marker ownership.",
    correction: "Restore the candidate marker or remove the candidate, then retry the selected mode",
  },
  "concurrent-creation": {
    invariant: "Candidate creation must win one mutation-free ownership race.",
    correction: "Inspect the competing candidate, then retry the selected mode",
  },
  "recovery-required": {
    invariant: "A partially created candidate must be cleaned before decomposition can continue.",
    correction: "Clean the reported candidate, then retry the selected mode",
  },
  "occupation-failed": {
    invariant: "The result locus must be occupied without an unexpected adapter failure.",
    correction: "Correct the reported occupation failure, then retry the selected mode",
  },
  "repository-plan-drift": {
    invariant: "The repository plan must remain identical through operation revalidation.",
    correction: "Refresh the repository state, then retry the selected mode",
  },
  "partial-projection-drift": {
    invariant: "The partial base, index, and worktree must remain unchanged after occupation.",
    correction: "Clean the reported projection, then retry the selected mode",
  },
  "result-locus-unavailable": {
    invariant: "The occupied result locus must remain available through staged revalidation.",
    correction: "Restore the reported result locus, then retry the selected mode",
  },
  "post-occupation-revalidation-failed": {
    invariant: "Repository authority must be revalidated after result occupation.",
    correction: "Correct the reported revalidation failure, then retry the selected mode",
  },
  "partial-recovery-unavailable": {
    invariant: "Partial protection requires an exact restoration adapter before mutation.",
    correction: "Restore partial-recovery support, then retry the selected mode",
  },
  "partial-preimage-capture-failed": {
    invariant: "Partial protection must capture every transform-owned preimage before mutation.",
    correction: "Correct the reported preimage capture failure, then retry the selected mode",
  },
  "partial-preimage-set-mismatch": {
    invariant: "Partial recovery must capture exactly the plan's transform-owned paths.",
    correction: "Correct the partial preimage set, then retry the selected mode",
  },
  "post-stage-revalidation-failed": {
    invariant: "Repository authority must be revalidated after staging.",
    correction: "Correct the reported revalidation failure, then retry the selected mode",
  },
  "partial-restoration-failed": {
    invariant: "Every transform-owned partial mutation must restore to its captured preimage.",
    correction: "Restore the reported affected paths, then retry the selected mode",
  },
  "transition-record-projection-invalid": {
    invariant: "Retirement must project one valid transition record before staging history.",
    correction: "Correct the completed map, then retry the selected mode",
  },
  "transition-record-origin-occupied": {
    invariant: "Only one live transition may own an origin.",
    correction: "Resolve the existing origin transition, then retry the selected mode",
  },
  "transition-record-write-failed": {
    invariant: "Retirement must record its transition intent after materialization.",
    correction: "Correct the reported record write failure, then retry the selected mode",
  },
  "transition-record-rollback-failed": {
    invariant: "A refused retirement must roll back its staged transition record.",
    correction: "Restore the reported transition-record state, then retry the selected mode",
  },
  "path-conflict": {
    invariant: "Every planned path must still match its authenticated before or final state.",
    correction: "Resolve the reported path conflict, then retry the selected mode",
  },
  "missing-final-blob": {
    invariant: "Every planned final file must have its content-addressed blob.",
    correction: "Restore the reported final blob, then retry the selected mode",
  },
  "final-blob-mismatch": {
    invariant: "Every materialized blob must match its planned content digest.",
    correction: "Restore the reported final blob, then retry the selected mode",
  },
  "invalid-member-projection": {
    invariant: "Every new member must project exactly one metadata path.",
    correction: "Correct the reported member projection, then retry the selected mode",
  },
  "observe-failed": {
    invariant: "Every planned path must be observable before materialization.",
    correction: "Correct the reported path observation failure, then retry the selected mode",
  },
  "blob-read-failed": {
    invariant: "Every content-addressed final blob must be readable before materialization.",
    correction: "Correct the reported blob read failure, then retry the selected mode",
  },
  "apply-failed": {
    invariant: "Each final path must be written and staged atomically.",
    correction: "Correct the reported apply failure, then retry the selected mode",
  },
  "extraction-facts-missing": {
    invariant: "An extraction repository plan must retain its authenticated extraction facts.",
    correction: "Re-run preflight and reauthor the extraction map",
  },
  "source-ref-moved": {
    invariant: "The source ref must remain at the authenticated commit during repository planning.",
    correction: "Re-run preflight and reauthor the completed map",
  },
  "result-ref-moved": {
    invariant: "The result-base ref must remain at the authenticated commit during repository planning.",
    correction: "Re-run preflight and reauthor the completed map",
  },
};
