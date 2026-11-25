/** The separate layout's per-change conformance cases: one for each operation path through its repository selection
 * and binding — local writes, batches, and reads; saved-state, history, and changes reads; planted faults; push and
 * pull; each sync failure and its remedy; and maintenance. Layout code keys on the operation and the selected
 * repository, never on a kind, content, or ref name, so one case per path reaches it. */
import type { ConformanceRuns } from "./fixture-contract.js";

export const separatePerChangeSubset: NonNullable<ConformanceRuns["subset"]> = {
  1: [
    "work-item: primary-role-reopen-sync-and-current-side-conflicts",
    "work-item: primary-role-transition-retains-generation-and-metadata",
    "cohort: cohort-close-placement",
    "personal: round-trip:personal/document",
  ],
  2: [
    "work-item: stale-writer:work-item/meta",
    "work-item: stale-removal:work-item/meta",
  ],
  3: [
    "personal: pull-hunk-base-version:shared:personal/document",
    "personal: pull-hunk-base-version:absent:personal/document",
    "personal: same-entry-current-and-stored-labelled-conflict:personal/inbox",
    "work-item: stale-base-clash-conflict-record:work-item/draft",
  ],
  4: [
    "work-item: batch-mixed-atomic-write-and-removal",
    "work-item: batch-shared-ID-in-changes-and-history",
    "personal: atomic-read-observations",
  ],
  6: [
    "work-item: unrelated-write-keeps-record-bound:work-item/meta",
    "personal: unrelated-write-keeps-scoped-changes:personal/document",
  ],
  7: [
    "work-item: saved-state-reads-and-changes:work-item/meta",
    "personal: earlier-state-keeps-prior-bytes:personal/document",
  ],
  9: [
    "personal: all-readable-records-and-one-diagnostic-per-bad-entry",
    "work-item: unreadable-family:work-item/meta",
    "work-item: empty-family-is-absent",
    "personal: no-identity-is-absent",
    "work-item: lifecycle-location-filter",
  ],
  10: [
    "work-item: newer-format-refusal-with-remedy:work-item/meta",
  ],
  11: [
    "work-item: history-newest-first-versions:work-item/meta",
    "personal: history-caller-and-owner-provenance:personal/document",
  ],
  12: [
    "lineage: terminal-alias-lookup-only:read:synced",
    "lineage: terminal-alias-lookup-only:saved-read:local",
    "work-item: commit-exact-SHA-before-copy-key-and-all-task-captures",
  ],
  13: [
    "work-item: reopen-read:work-item/meta",
  ],
  14: [
    "command-line-capacity",
    "unreachable",
    "refused",
    "retries-exhausted",
    "namespace-corrupt",
    "state-unresolvable",
  ],
  16: [
    "work-item: maintain-measurements",
    "work-item: remote-down-with-success-after-repair",
    "work-item: remote-contended-with-success-after-repair",
    "work-item: remote-refusing-with-success-after-repair",
    "work-item: no-remote-is-an-independent-state",
    "personal: no-identity-holds-every-identity-family-while-project-publishes",
    "work-item: pull-merges-without-publishing",
    "personal: pull-merges-without-publishing",
    "work-item: publish-and-noop-family-coverage:work-item/meta",
    "work-item: remote-movement-reconciles-by-mechanism:work-item/meta",
    "personal: concurrent-sync-merges-and-preserves-both-side-labels:personal/document",
    "work-item: single-writer-sync-keeps-remote-and-stores-local-conflict:work-item/meta",
    "work-item: single-writer-sync-preserves-local-removal:work-item/meta",
    "work-item: single-writer-sync-preserves-remote-removal:work-item/meta",
  ],
  17: [
    "work-item: write-check-before-and-after-cover-the-whole-batch",
    "personal: stale-write-check-receives-merged-stored-content",
  ],
};
