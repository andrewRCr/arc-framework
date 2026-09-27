/** Static remedy definitions for v3 extraction finish refusals. */

import type { V3PreflightRemedyDefinition } from "./decompose-v3-remedy-definitions.js";

export const V3_FINISH_REMEDIES: Readonly<Record<string, V3PreflightRemedyDefinition>> = {
  "invalid": {
    invariant: "Extraction finish requires one valid completed extraction map for the invoked origin.",
    correction: "Correct the completed extraction map, then retry finish",
  },
  "destination-plan-state": {
    invariant: "Every extraction destination plan must end in a regular file.",
    correction: "Correct the reported destination plan, then retry finish",
  },
  "destination-missing": {
    invariant: "Every extraction destination must be present on the live base.",
    correction: "Land the reported destination, then retry finish",
  },
  "destination-object-kind": {
    invariant: "Every landed extraction destination must remain a regular Git blob.",
    correction: "Restore the reported destination as a regular file, then retry finish",
  },
  "destination-mode": {
    invariant: "Every landed extraction destination must retain its planned file mode.",
    correction: "Restore the reported destination mode, then retry finish",
  },
  "destination-bytes": {
    invariant: "Every byte-exact extraction destination must retain its planned content.",
    correction: "Restore the reported destination content, then retry finish",
  },
  "destination-scan": {
    invariant: "Every authored extraction destination must remain scannable Markdown.",
    correction: "Correct the reported destination document, then retry finish",
  },
  "destination-locator": {
    invariant: "Every authored extraction locator must remain resolvable in its destination.",
    correction: "Restore the reported destination content, then retry finish",
  },
  "destination-meta": {
    invariant: "Every landed member metadata record must retain its extraction-owned fields.",
    correction: "Restore the reported metadata fields, then retry finish",
  },
  "dependency-claim": {
    invariant: "Every landed dependency recipient must retain its authored target set.",
    correction: "Restore the reported dependency claim, then retry finish",
  },
  "topology-claim": {
    invariant: "Every landed topology document must retain its authored placement claim.",
    correction: "Restore the reported topology claim, then retry finish",
  },
  "roadmap-current-render": {
    invariant: "The live ROADMAP must match the projection of the landed extraction result.",
    correction: "Restore the projected ROADMAP, then retry finish",
  },
  "destination-plan-empty": {
    invariant: "Extraction finish requires at least one landed destination.",
    correction: "Land the extraction result, then retry finish",
  },
  "origin": {
    invariant: "The finish invocation origin must match the completed extraction map.",
    correction: "Use the map's authenticated origin, then retry finish",
  },
  "base-ref-mismatch": {
    invariant: "The completed map result ref must match the configured base branch.",
    correction: "Use the configured result base, then retry finish",
  },
  "source-detached": {
    invariant: "Extraction finish must run on the authenticated source branch.",
    correction: "Switch to the source branch, then retry finish",
  },
  "source-branch": {
    invariant: "Extraction finish must run on the logical branch recorded by the map.",
    correction: "Switch to the reported source branch, then retry finish",
  },
  "base-missing": {
    invariant: "The configured result-base ref must exist during finish.",
    correction: "Restore the configured base branch, then retry finish",
  },
  "base-not-descendant": {
    invariant: "The live result base must descend from the extraction plan's authenticated base.",
    correction: "Land the extraction result on a descendant base, then retry finish",
  },
  "base-ancestry-unavailable": {
    invariant: "Extraction finish must determine whether the live result base descends from its authenticated base.",
    correction: "Restore the reported Git ancestry probe, then retry finish",
  },
  "source-tree-unreadable": {
    invariant: "Finish must read the complete authenticated source tree.",
    correction: "Restore the reported Git tree, then retry finish",
  },
  "result-base-tree-unreadable": {
    invariant: "Finish must read the extraction plan's original result-base tree.",
    correction: "Restore the reported Git tree, then retry finish",
  },
  "base-tree-unreadable": {
    invariant: "Finish must read the complete live result-base tree.",
    correction: "Restore the reported Git tree, then retry finish",
  },
  "result-base-roadmap-unreadable": {
    invariant: "Finish must read the original result-base ROADMAP.",
    correction: "Restore the reported ROADMAP, then retry finish",
  },
  "destination-proof-failed": {
    invariant: "Extraction destination proof must complete without an adapter failure.",
    correction: "Correct the reported proof failure, then retry finish",
  },
  "source-dirt-read": {
    invariant: "Finish must inspect source-directory dirt before mutation.",
    correction: "Correct the reported Git status read, then retry finish",
  },
  "source-index-dirty": {
    invariant: "The source index may differ only at paths owned by the thinning plan.",
    correction: "Clean the reported source index changes, then retry finish",
  },
  "source-worktree-dirty": {
    invariant: "The source worktree may differ only at paths owned by the thinning plan.",
    correction: "Clean the reported source worktree changes, then retry finish",
  },
  "source-untracked": {
    invariant: "The source directory must contain no untracked path outside the thinning plan.",
    correction: "Move or remove the reported untracked path, then retry finish",
  },
  "apply-authority": {
    invariant: "Finish apply requires the exact authority emitted by the current preview.",
    correction: "Preview again and retry apply with the current authority",
  },
  "source-plan-empty": {
    invariant: "Source thinning requires at least one authenticated source path.",
    correction: "Correct the extraction map, then retry finish",
  },
  "source-plan-paths": {
    invariant: "Source thinning paths must be unique and canonically ordered.",
    correction: "Rebuild the source plan, then retry finish",
  },
  "source-preimage-capture": {
    invariant: "Finish must capture every source index and worktree preimage before mutation.",
    correction: "Correct the reported capture failure, then retry finish",
  },
  "source-preimage-set": {
    invariant: "The captured source preimages must exactly match the thinning plan paths.",
    correction: "Correct the reported preimage set, then retry finish",
  },
  "source-index-preimage": {
    invariant: "Each source index path must match its planned before or after state.",
    correction: "Restore the reported index path, then retry finish",
  },
  "source-worktree-preimage": {
    invariant: "Each source worktree path must match its planned before or after state.",
    correction: "Restore the reported worktree path, then retry finish",
  },
  "source-preimage-raced": {
    invariant: "Captured source preimages must remain unchanged through authorization.",
    correction: "Stabilize the reported source path, then retry finish",
  },
  "source-before-apply": {
    invariant: "Source and base authority must be revalidated immediately before apply.",
    correction: "Stabilize the repository authority, then retry finish",
  },
  "source-raced": {
    invariant: "The source branch, ref, and head must remain identical through finish proof.",
    correction: "Stabilize the source branch, then retry finish",
  },
  "base-raced": {
    invariant: "The live result-base head must remain identical through finish proof.",
    correction: "Stabilize the result base, then retry finish",
  },
  "source-apply-failed": {
    invariant: "Each source thinning mutation must apply and stage atomically.",
    correction: "Correct the reported apply failure, then retry finish",
  },
  "source-restoration-failed": {
    invariant: "A refused source mutation must restore its exact captured preimage.",
    correction: "Restore the reported source residue, then retry finish",
  },
  "source-final-capture": {
    invariant: "Finish must capture final source states after mutation.",
    correction: "Correct the reported final capture failure, then retry finish",
  },
  "source-final-state": {
    invariant: "Every applied source path must match its planned final state.",
    correction: "Restore the reported source path, then retry finish",
  },
  "source-inventory": {
    invariant: "Source thinning requires the authenticated source-artifact inventory.",
    correction: "Re-run preflight and reauthor the extraction map",
  },
  "source-missing": {
    invariant: "Every source path in the thinning plan must remain present.",
    correction: "Restore the reported source path, then re-run preflight",
  },
  "source-object": {
    invariant: "Every source path in the thinning plan must remain a regular Git blob.",
    correction: "Restore the reported source file, then re-run preflight",
  },
  "source-mode": {
    invariant: "Every source path in the thinning plan must retain its authenticated mode.",
    correction: "Restore the reported source mode, then re-run preflight",
  },
  "source-bytes": {
    invariant: "Every source path in the thinning plan must retain its authenticated bytes.",
    correction: "Re-run preflight and reauthor the extraction map",
  },
  "source-range": {
    invariant: "Scanned source units must cover each artifact with contiguous byte ranges.",
    correction: "Re-run preflight and reauthor the extraction map",
  },
  "source-allocation": {
    invariant: "Every scanned source unit must have exactly one completed allocation.",
    correction: "Correct the source allocations, then retry finish",
  },
  "source-unit": {
    invariant: "Every rescanned source unit must match its authenticated identity and bytes.",
    correction: "Re-run preflight and reauthor the extraction map",
  },
};
