/** Explicit applicability and staged retirement of ref conformance assertions. */
import { KIND_REGISTRY, type FamilyId } from "../../../src/lib/store/index.js";
import type { FixtureDeclarations, SuiteItem } from "./fixture-contract.js";

export function refFamilyExclusions(families: readonly FamilyId[]): FixtureDeclarations["familyExclusions"] {
  const items = {
    5: "Every state ref is published in one Git transaction.",
    8: "Ref state versions cover every served family.",
    ...Object.fromEntries(([3, 7, 11, 12, 14, 17] satisfies SuiteItem[]).map((item) => [item,
      "Retired in Phase 8: the complete local write, history, lookup, and recovery engine."])),
  };
  const exclusions: FixtureDeclarations["familyExclusions"] = Object.fromEntries(families.map((family) => [family, { items, assertions: {} }]));
  const add = (family: FamilyId, name: string, reason: string): void => {
    const target = exclusions[family];
    if (target) (target.assertions ??= {})[name] = reason;
  };
  addSyncExclusions(families, add);
  const local = "Retired in Phase 8: local write rules and stored history are complete.";
  const moves = "Retired in Phase 8: lifecycle moves and generation handling are complete.";
  for (const name of ["machine-local-path:.internal/request.json", "machine-local-path:work-unit/.internal/checkpoint.json",
    "derived-status-root-write-and-batch-refusal", "derived-status-root-excluded-and-nested-basename-stored"]) add("personal", name, local);
  for (const name of ["lifecycle-location-filter", "UID-rename-and-generations", "rename-and-reopen-onto-live-slug",
    "companion-path-key-through-rename", "primary-role-transition-retains-generation-and-metadata",
    "primary-role-stale-absence-and-atomic-batch-guards", "primary-role-removal-retains-actual-historical-role"]) add("work-item", name, moves);
  add("cohort", "cohort-close-placement", moves);
  add("work-item", "batch-shared-ID-in-changes-and-history", local);
  add("work-item", "primary-role-reopen-sync-and-current-side-conflicts", "Retired in Phase 11: reopen and synchronization preserve the current primary role.");
  for (const kind of ["work-item/meta", "work-item/record"]) {
    for (const name of ["primary-placement-move-to-completed", "primary-create-at-completed"]) add("work-item", `${name}:${kind}`, moves);
    add("work-item", `primary-links-create-retain-replace-clear:${kind}`, "Retired in Phase 8: lookup by linked ref is complete.");
  }
  for (const kind of Object.values(KIND_REGISTRY)) {
    if (!families.includes(kind.family)) continue;
    add(kind.family, `unrelated-write-keeps-scoped-changes:${kind.id}`, local);
    if (kind.merge === "single-writer") add(kind.family, `${kind.id}: rejecting-content-and-repaired-creation`, local);
    if (kind.writerRule === "create-only") add(kind.family, `create-only-update:${kind.id}`, local);
  }
  for (const kind of ["project-inbox/inbox", "project-inbox/routing-receipt", "project-registry/identity",
    "project-registry/counter", "lineage/transition", "lineage/conflict-record"] as const) {
    add(KIND_REGISTRY[kind].family, `diagnostic-key-mismatch:${kind}`, "The fixed-ref generic fixture has no admitted second owner coordinate for this kind.");
  }
  return exclusions;
}

function addSyncExclusions(families: readonly FamilyId[], add: (family: FamilyId, name: string, reason: string) => void): void {
  const reason = "Retired in Phase 11: pull and push implement synchronization.";
  for (const family of families) {
    if (Object.values(KIND_REGISTRY).some((kind) => kind.family === family && !kind.id.endsWith("/conflict-record"))) {
      add(family, "pull-merges-without-publishing", reason);
    }
  }
  for (const state of ["down", "contended", "refusing"]) add("work-item", `remote-${state}-with-success-after-repair`, reason);
  add("work-item", "no-remote-is-an-independent-state", reason);
  add("personal", "no-identity-holds-every-identity-family-while-project-publishes", reason);
  for (const kind of Object.values(KIND_REGISTRY)) {
    if (!families.includes(kind.family)) continue;
    add(kind.family, `publish-and-noop-family-coverage:${kind.id}`, reason);
    if (!["create-only", "write-once"].includes(kind.writerRule)) {
      add(kind.family, `remote-movement-reconciles-by-mechanism:${kind.id}`, reason);
      if (kind.merge === "single-writer") {
        for (const name of ["single-writer-sync-keeps-remote-and-stores-local-conflict", "single-writer-sync-preserves-local-removal",
          "single-writer-sync-preserves-remote-removal"]) add(kind.family, `${name}:${kind.id}`, reason);
      }
    }
    if (kind.merge !== "single-writer") add(kind.family, `concurrent-sync-merges-and-preserves-both-side-labels:${kind.id}`, reason);
  }
}
