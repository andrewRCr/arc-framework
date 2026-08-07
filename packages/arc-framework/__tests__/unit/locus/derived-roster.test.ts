/** Pure dormant checkout-row composition from authority-only evidence. */

import { describe, expect, it } from "vitest";

import type { TransientIdentitySnapshot } from "../../../src/lib/errand/identity-snapshot.js";
import type { RegisteredWorktree } from "../../../src/lib/git/worktree-roster.js";
import type { CompletedEvidenceRead } from "../../../src/lib/work-unit/completed-index.js";
import type { OccupancyMarker } from "../../../src/lib/locus/occupancy-marker.js";
import type { LocusIdentityV1 } from "../../../src/lib/locus/schema/index.js";
import type {
  ActiveMetaEvidence,
  DormantMarkerGenerationEvidence,
} from "../../../src/lib/locus/derived-lifecycle-evidence.js";
import { projectDerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";

const checkout: RegisteredWorktree = {
  path: "/repo/demo",
  head: "a".repeat(40),
  branch: "feat/demo",
  detached: false,
  primary: false,
};
const available: CompletedEvidenceRead = { status: "available", records: new Map() };
const identitiesAbsent: TransientIdentitySnapshot = { kind: "absent" };
const activeMeta: ActiveMetaEvidence = {
  kind: "present",
  location: "active",
  subject: { kind: "work-unit", key: "demo" },
  expectedTopology: { branch: "feat/demo", detached: false },
  metaRoot: { kind: "maintainer" },
  candidates: [],
};

function marker(value: OccupancyMarker): DormantMarkerGenerationEvidence {
  return { kind: "present", marker: value, generation: `sha256:${"b".repeat(64)}` };
}

function project(overrides: Partial<Parameters<typeof projectDerivedCheckoutRow>[0]> = {}) {
  return projectDerivedCheckoutRow({
    checkout,
    marker: { kind: "absent" },
    activeMeta: { kind: "absent" },
    completed: available,
    identities: identitiesAbsent,
    primarySafety: { kind: "error", message: "not primary" },
    ...overrides,
  });
}

function identitySnapshot(options: {
  key?: string;
  claimId?: string;
  branch?: string;
  diagnosticKey?: string;
} = {}): TransientIdentitySnapshot {
  const key = options.key ?? "repair";
  return {
    kind: "complete",
    tip: "c".repeat(40),
    objects: new Map(),
    records: new Map(),
    projections: new Map([[key, {
      kind: "errand",
      key,
      claimId: options.claimId ?? "claim-1",
      protection: "full",
      branch: options.branch ?? "chore/repair",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      state: "open",
      savedHead: null,
      changeRequest: null,
    }]]),
    diagnostics: options.diagnosticKey === undefined
      ? []
      : [{ kind: "malformed", key: options.diagnosticKey, message: "bad JSON" }],
  };
}

describe("dormant derived checkout rows", () => {
  it("derives active WUs from meta and parked WUs from marker plus non-membership", () => {
    expect(project({ activeMeta })).toMatchObject({
      kind: "work-unit",
      subject: { kind: "work-unit", key: "demo" },
      lifecycleLocation: "active",
    });
    expect(project({
      marker: marker({ spawnedByArc: true, createdFor: { kind: "work-unit", name: "demo" } }),
    })).toMatchObject({
      kind: "work-unit",
      lifecycleLocation: "parked",
      markerGeneration: `sha256:${"b".repeat(64)}`,
    });
  });

  it("derives retirement only when a marker-named WU has positive completed membership", () => {
    expect(project({
      marker: marker({ spawnedByArc: true, createdFor: { kind: "work-unit", name: "demo" } }),
      completed: {
        status: "available",
        records: new Map([["demo", { slug: "demo", completedAt: null, prUrl: null, prNumber: null }]]),
      },
    })).toMatchObject({ kind: "retired", subject: { kind: "work-unit", key: "demo" } });
    expect(project({
      marker: marker({ spawnedByArc: true, createdFor: { kind: "work-unit", name: "demo" } }),
      completed: { status: "unavailable", reason: "archive-tree-read-failed" },
    })).toMatchObject({ kind: "unresolved-checkout" });
  });

  it("unresolves marker/meta disagreement and branch or HEAD mismatch without retargeting", () => {
    expect(project({
      marker: marker({ spawnedByArc: true, createdFor: { kind: "work-unit", name: "other" } }),
      activeMeta,
    })).toMatchObject({ kind: "unresolved-checkout" });
    expect(project({
      activeMeta: { ...activeMeta, expectedTopology: { branch: "feat/elsewhere" } },
    })).toMatchObject({
      kind: "unresolved-checkout",
      subject: { kind: "work-unit", key: "demo" },
      diagnostics: [{ code: "topology-mismatch" }],
    });
    expect(project({
      checkout: { ...checkout, branch: null, detached: true },
      activeMeta,
    })).toMatchObject({
      kind: "unresolved-checkout",
      diagnostics: [{ code: "topology-mismatch" }],
    });

    const paused: LocusIdentityV1 = {
      kind: "errand",
      key: "repair",
      claimId: "claim-1",
      protection: "full",
      branch: "chore/repair",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      state: "paused",
      savedHead: "a".repeat(40),
      changeRequest: null,
    };
    expect(project({
      checkout: { ...checkout, branch: "chore/repair", head: "b".repeat(40) },
      marker: marker({
        spawnedByArc: true,
        createdFor: { kind: "errand", slug: "repair", claimId: "claim-1" },
        provisioning: "ready",
      }),
      identities: {
        kind: "complete",
        tip: "c".repeat(40),
        objects: new Map(),
        records: new Map(),
        projections: new Map([["repair", paused]]),
        diagnostics: [],
      },
    })).toMatchObject({
      kind: "unresolved-checkout",
      diagnostics: [{ code: "topology-mismatch" }],
    });
  });

  it("requires exact marker and identity agreement for identity-backed Errands", () => {
    const errandMarker = marker({
      spawnedByArc: true,
      createdFor: { kind: "errand", slug: "repair", claimId: "claim-1" },
      provisioning: "ready",
      parentCheckoutPath: "/repo",
    });
    expect(project({
      checkout: { ...checkout, branch: "chore/repair" },
      marker: errandMarker,
      identities: identitySnapshot({ diagnosticKey: "unrelated" }),
    })).toMatchObject({
      kind: "transient",
      subject: { kind: "errand", key: "repair", claimId: "claim-1" },
      parentCheckoutPath: "/repo",
    });
    expect(project({
      checkout: { ...checkout, branch: "chore/repair" },
      marker: errandMarker,
      identities: identitySnapshot({ claimId: "claim-2" }),
    })).toMatchObject({ kind: "unresolved-checkout" });
    expect(project({
      checkout: { ...checkout, branch: "chore/repair" },
      marker: errandMarker,
      identities: { kind: "error", stage: "tree", message: "identity tree unavailable" },
    })).toMatchObject({ kind: "unresolved-checkout" });

    expect(project({
      checkout: { ...checkout, path: "/repo", branch: "chore/repair", primary: true },
      marker: marker({
        spawnedByArc: false,
        createdFor: { kind: "errand", slug: "repair", claimId: "claim-1" },
        provisioning: "ready",
      }),
      identities: identitySnapshot(),
    })).toMatchObject({
      kind: "transient",
      subject: { kind: "errand", key: "repair", claimId: "claim-1" },
    });
  });

  it("derives direct and origin-bound partial Errands independently of identity availability", () => {
    expect(project({
      checkout: { ...checkout, path: "/repo", branch: "main", primary: true },
      marker: marker({
        spawnedByArc: false,
        createdFor: { kind: "partial-errand", slug: "repair", claimId: null },
        provisioning: "ready",
      }),
      identities: { kind: "error", stage: "tree", message: "identity tree unavailable" },
    })).toMatchObject({
      kind: "transient",
      subject: { kind: "partial-errand", key: "repair", claimId: null },
      origin: null,
    });

    expect(project({
      checkout: { ...checkout, path: "/repo", branch: "main", primary: true },
      marker: marker({
        spawnedByArc: false,
        createdFor: { kind: "partial-errand", slug: "repair", claimId: null },
        provisioning: "ready",
        originEntry: "Repair the index",
        originEntrySourceDigest: `sha256:${"d".repeat(64)}`,
      }),
      identities: { kind: "error", stage: "tree", message: "identity tree unavailable" },
    })).toMatchObject({
      kind: "transient",
      subject: { kind: "partial-errand", key: "repair", claimId: null },
      origin: {
        entry: "Repair the index",
        sourceDigest: `sha256:${"d".repeat(64)}`,
      },
    });
  });

  it("derives free primary and unmanaged topology only from their own evidence", () => {
    expect(project({
      checkout: { ...checkout, path: "/repo", branch: "main", primary: true },
      primarySafety: { kind: "complete", clean: true, onBase: true },
      identities: { kind: "error", stage: "tree", message: "identity tree unavailable" },
    })).toMatchObject({ kind: "free-primary" });
    expect(project()).toMatchObject({ kind: "unmanaged-checkout" });
    expect(project({
      checkout: { ...checkout, path: "/repo", branch: "main", primary: true },
      primarySafety: { kind: "complete", clean: false, onBase: true },
    })).toMatchObject({ kind: "unresolved-checkout" });
  });
});
