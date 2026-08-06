/** Bounded evidence projections for the dormant derived-locus reader. */

import { describe, expect, it } from "vitest";

import type { TransientIdentitySnapshot } from "../../../src/lib/errand/identity-snapshot.js";
import type { OccupancyMarker } from "../../../src/lib/locus/occupancy-marker.js";
import {
  projectActiveMetaEvidence,
  projectIdentityAuthority,
  projectMarkerAuthority,
  projectWorkUnitLifecycle,
  type ActiveMetaEvidence,
  type DormantMarkerGenerationEvidence,
} from "../../../src/lib/locus/derived-lifecycle-evidence.js";

function meta(key: string, owner = "andrew", branch = `feat/${key}`) {
  return {
    kind: "read" as const,
    name: `meta-${key}.md`,
    path: `/repo/.arc/active/meta-${key}.md`,
    text: `# Metadata: ${key}\n\n- **State:** \`Active\`\n- **Owner:** \`${owner}\`\n- **Branch:** \`${branch}\`\n- **Task List:** \`tasks-${key}.md\`\n- **Current Workflow:** [none]\n- **Next Action:** Continue\n`,
  };
}

function marker(occupancy: OccupancyMarker): DormantMarkerGenerationEvidence {
  return { kind: "present", marker: occupancy, generation: `sha256:${"a".repeat(64)}` };
}

const workUnitMarker: OccupancyMarker = {
  spawnedByArc: true,
  createdFor: { kind: "work-unit", name: "demo" },
};

describe("active-meta lifecycle evidence", () => {
  it("selects one exact owner-eligible active meta without branch inference", () => {
    expect(projectActiveMetaEvidence({
      cwd: "/repo",
      identity: "andrew",
      candidates: [meta("demo")],
      metaRoots: [{ kind: "listed", path: "/repo/.arc/active" }],
    })).toMatchObject({
      kind: "present",
      location: "active",
      subject: { kind: "work-unit", key: "demo" },
      expectedTopology: { branch: "feat/demo", detached: false },
      metaRoot: { kind: "maintainer" },
    });
  });

  it("keeps absence, unreadability, duplication, and conflict distinct", () => {
    const base = { cwd: "/repo", identity: "andrew" };
    expect(projectActiveMetaEvidence({ ...base, candidates: [], metaRoots: [] }))
      .toEqual({ kind: "absent" });
    expect(projectActiveMetaEvidence({
      ...base,
      candidates: [],
      metaRoots: [{ kind: "error", path: "/repo/.arc/active", message: "permission denied" }],
    })).toMatchObject({ kind: "unreadable" });
    expect(projectActiveMetaEvidence({
      ...base,
      candidates: [meta("demo"), { ...meta("demo"), path: "/repo/.arc/user/andrew/active/meta-demo.md" }],
      metaRoots: [],
    })).toMatchObject({ kind: "duplicate", subjectKey: "demo" });
    expect(projectActiveMetaEvidence({
      ...base,
      candidates: [meta("demo"), meta("other")],
      metaRoots: [],
    })).toMatchObject({ kind: "conflicting" });
    expect(projectActiveMetaEvidence({
      ...base,
      candidates: [
        meta("demo"),
        { ...meta("demo", "andrew", "feat/demo-alt"), path: "/repo/.arc/user/andrew/active/meta-demo.md" },
      ],
      metaRoots: [],
    })).toMatchObject({ kind: "conflicting" });
  });

  it("contains owner-eligible metas outside the marker-selected subject", () => {
    expect(projectActiveMetaEvidence({
      cwd: "/repo",
      identity: "andrew",
      expectedSubjectKey: "demo",
      candidates: [
        meta("demo"),
        meta("other"),
        {
          kind: "error",
          name: "meta-broken.md",
          path: "/repo/.arc/active/meta-broken.md",
          message: "permission denied",
        },
      ],
      metaRoots: [],
    })).toMatchObject({
      kind: "present",
      subject: { kind: "work-unit", key: "demo" },
    });
    expect(projectActiveMetaEvidence({
      cwd: "/repo",
      identity: "andrew",
      expectedSubjectKey: "demo",
      candidates: [{
        kind: "error",
        name: "meta-demo.md",
        path: "/repo/.arc/active/meta-demo.md",
        message: "permission denied",
      }],
      metaRoots: [],
    })).toEqual({
      kind: "unreadable",
      path: ".arc/active/meta-demo.md",
      reason: "permission denied",
    });
  });

  it("rejects an exact marker-selected meta owned by another identity", () => {
    expect(projectActiveMetaEvidence({
      cwd: "/repo",
      identity: "andrew",
      expectedSubjectKey: "demo",
      candidates: [meta("demo", "someone-else")],
      metaRoots: [],
    })).toMatchObject({ kind: "conflicting" });
  });
});

describe("bounded authority projections", () => {
  it("retires a marker-named WU only from positive completed membership", () => {
    const absent: ActiveMetaEvidence = { kind: "absent" };
    const positive = projectWorkUnitLifecycle({
      activeMeta: absent,
      markerSubject: { kind: "work-unit", key: "demo" },
      completed: {
        status: "partial",
        records: new Map([["demo", { slug: "demo", completedAt: null, prUrl: null, prNumber: null }]]),
        unreadableMetaPaths: [".arc/completed/2026-Q3/01_demo/meta-demo.md"],
      },
    });
    expect(positive).toMatchObject({ kind: "present", state: "retired", subject: { key: "demo" } });

    expect(projectWorkUnitLifecycle({
      activeMeta: absent,
      markerSubject: { kind: "work-unit", key: "demo" },
      completed: { status: "available", records: new Map() },
    })).toEqual({ kind: "absent" });
    expect(projectWorkUnitLifecycle({
      activeMeta: absent,
      markerSubject: { kind: "work-unit", key: "demo" },
      completed: { status: "unavailable", reason: "archive-tree-read-failed" },
    })).toMatchObject({ kind: "unreadable" });
  });

  it("projects marker topology and accepts direct or origin-bound partial Errands", () => {
    expect(projectMarkerAuthority(marker(workUnitMarker), { primary: false })).toMatchObject({
      kind: "present",
      subject: { kind: "work-unit", key: "demo" },
    });
    expect(projectMarkerAuthority(marker(workUnitMarker), { primary: true }))
      .toEqual({ kind: "unreadable", reason: "Marker spawn provenance conflicts with physical topology" });
    expect(projectMarkerAuthority(marker({
      spawnedByArc: true,
      createdFor: { kind: "errand", slug: "repair", claimId: "claim-1" },
      provisioning: "pending",
    }), { primary: false })).toEqual({
      kind: "unreadable",
      reason: "Transient occupancy marker is not ready",
    });
    expect(projectMarkerAuthority(marker({
      spawnedByArc: false,
      createdFor: { kind: "partial-errand", slug: "repair", claimId: null },
      provisioning: "ready",
    }), { primary: true })).toMatchObject({
      kind: "present",
      subject: { kind: "partial-errand", key: "repair", claimId: null },
    });
    expect(projectMarkerAuthority(marker({
      spawnedByArc: false,
      createdFor: { kind: "partial-errand", slug: "repair", claimId: null },
      provisioning: "ready",
      originEntry: "Repair the index",
      originEntrySourceDigest: `sha256:${"b".repeat(64)}`,
    }), { primary: true })).toMatchObject({
      kind: "present",
      subject: { kind: "partial-errand", key: "repair", claimId: null },
    });
  });

  it("localizes identity snapshot failures and unrelated entry diagnostics", () => {
    const identity = {
      kind: "errand" as const,
      key: "repair",
      claimId: "claim-1",
      protection: "full" as const,
      branch: "chore/repair",
      purpose: "errand" as const,
      origin: "description" as const,
      originEntry: null,
      state: "open" as const,
      savedHead: null,
      changeRequest: null,
    };
    const subject = { kind: "errand" as const, key: "repair", claimId: "claim-1" };
    const complete: TransientIdentitySnapshot = {
      kind: "complete",
      tip: "a".repeat(40),
      objects: new Map(),
      records: new Map(),
      projections: new Map([["repair", identity]]),
      diagnostics: [{ kind: "malformed", key: "unrelated", message: "bad JSON" }],
    };
    expect(projectIdentityAuthority(complete, subject)).toMatchObject({
      kind: "present",
      subject,
      expectedTopology: { branch: "chore/repair", detached: false },
    });
    expect(projectIdentityAuthority({ kind: "absent" }, subject)).toEqual({
      kind: "unreadable",
      reason: "Transient identity snapshot is absent",
    });
    expect(projectIdentityAuthority({ kind: "error", stage: "tree", message: "bad tree" }, subject))
      .toEqual({ kind: "unreadable", reason: "bad tree" });
    expect(projectIdentityAuthority({
      ...complete,
      projections: new Map(),
      diagnostics: [{ kind: "malformed", key: "repair", message: "bad JSON" }],
    }, subject)).toEqual({
      kind: "unreadable",
      reason: "Transient identity entry is malformed: bad JSON",
    });
  });
});
