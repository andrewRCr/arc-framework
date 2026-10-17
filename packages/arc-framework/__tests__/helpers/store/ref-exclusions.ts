/** Permanent applicability and remaining synchronization exclusions for ref conformance. */
import { KIND_REGISTRY, type FamilyId } from "../../../src/lib/store/index.js";
import type { FixtureDeclarations } from "./fixture-contract.js";

export function refFamilyExclusions(families: readonly FamilyId[]): FixtureDeclarations["familyExclusions"] {
  const items = { 5: "Every state ref is published in one Git transaction.", 8: "Ref state versions cover every served family." };
  const exclusions: FixtureDeclarations["familyExclusions"] = Object.fromEntries(families.map((family) => [family, { items, assertions: {} }]));
  const add = (family: FamilyId, name: string, reason: string): void => {
    const target = exclusions[family];
    if (target) (target.assertions ??= {})[name] = reason;
  };
  addSyncExclusions(families, add);
  const sync = "Retired in Phase 11: synchronization and remote recovery are complete.";
  for (const family of families) for (const name of ["unreachable", "refused", "retries-exhausted"]) add(family, name, sync);
  for (const base of ["shared", "absent"]) add("personal", `pull-hunk-base-version:${base}:personal/document`, sync);
  add("work-item", "primary-role-reopen-sync-and-current-side-conflicts", sync);
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
