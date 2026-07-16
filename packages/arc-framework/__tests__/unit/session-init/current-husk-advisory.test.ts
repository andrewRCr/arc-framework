import { describe, expect, it } from "vitest";

import {
  deriveCurrentHuskAdvisory,
  resolveCurrentHuskAdvisory,
} from "../../../src/lib/session-init/current-husk-advisory.js";
import type { WorktreeMarkerReadResult } from "../../../src/lib/git/worktree-marker.js";

const stampedMarker: WorktreeMarkerReadResult = {
  kind: "present",
  marker: {
    spawnedByArc: true,
    wuName: "shipped-widget",
    spawningIdentity: "andrew",
    createdAt: "2026-07-14T00:00:00.000Z",
    husk: {
      sha: "abc123",
      at: "2026-07-14T01:00:00.000Z",
      subject: { kind: "work-unit", name: "shipped-widget" },
      branch: "feat/shipped-widget",
    },
  },
};

function derive(overrides: {
  branch?: string | null;
  head?: string;
  marker?: WorktreeMarkerReadResult;
} = {}) {
  return deriveCurrentHuskAdvisory({
    worktreePath: "/wt/shipped-widget",
    branch: overrides.branch ?? null,
    head: overrides.head ?? "abc123",
    marker: overrides.marker ?? stampedMarker,
  });
}

describe("deriveCurrentHuskAdvisory", () => {
  it("identifies a matching stamped completed work unit", () => {
    expect(derive()).toEqual({
      worktreePath: "/wt/shipped-widget",
      subject: { kind: "work-unit", name: "shipped-widget" },
      branch: "feat/shipped-widget",
      stamp: { kind: "legacy", authorization: "merged-preserved" },
    });
  });

  it("surfaces structurally decoded authorization, evidence, and remote proof without completion membership", () => {
    const digest = `sha256:${"a".repeat(64)}` as const;
    const result = derive({
      marker: {
        kind: "present",
        marker: {
          ...stampedMarker.marker,
          husk: {
            ...stampedMarker.marker.husk!,
            authorization: "discard-confirmed",
            remoteRef: { remote: "origin/feat/shipped-widget", oid: "abc123", disposition: "delete" },
            evidence: {
              kind: "receipt",
              receiptId: digest,
              transition: "abandon",
              expectedLifecycle: "nonexistent",
              resultDigest: digest,
            },
          },
        },
      },
    });

    expect(result?.stamp).toEqual({
      kind: "current",
      authorization: "discard-confirmed",
      remoteRef: { remote: "origin/feat/shipped-widget", oid: "abc123", disposition: "delete" },
      evidence: {
        kind: "receipt",
        receiptId: digest,
        transition: "abandon",
        expectedLifecycle: "nonexistent",
        resultDigest: digest,
      },
    });
  });

  it("falls back to ordinary detached guidance when known evidence does not revalidate", async () => {
    const digest = `sha256:${"a".repeat(64)}` as const;
    const marker: WorktreeMarkerReadResult = {
      kind: "present",
      marker: {
        ...stampedMarker.marker,
        husk: {
          ...stampedMarker.marker.husk!,
          authorization: "discard-confirmed",
          remoteRef: null,
          evidence: {
            kind: "receipt",
            receiptId: digest,
            transition: "abandon",
            expectedLifecycle: "nonexistent",
            resultDigest: digest,
          },
        },
      },
    };

    const result = await resolveCurrentHuskAdvisory({
      worktreePath: "/wt/shipped-widget",
      branch: null,
      head: "abc123",
      marker,
    }, async () => false);

    expect(result).toBeNull();
  });

  it("recognizes an unknown authorization as manual-only", () => {
    const digest = `sha256:${"b".repeat(64)}` as const;
    const result = derive({
      marker: {
        kind: "present",
        marker: {
          ...stampedMarker.marker,
          husk: {
            ...stampedMarker.marker.husk!,
            authorization: "future-policy",
            remoteRef: null,
            evidence: {
              kind: "receipt",
              receiptId: digest,
              transition: "abandon",
              expectedLifecycle: "nonexistent",
              resultDigest: digest,
            },
          },
        },
      },
    });

    expect(result?.stamp).toEqual({ kind: "manual-only", reason: "unknown-authorization" });
  });

  it.each([
    ["markerless", { marker: { kind: "absent" } satisfies WorktreeMarkerReadResult }],
    ["malformed", {
      marker: {
        kind: "malformed",
        path: "/wt/shipped-widget/.arc/system/.internal/worktree-marker.json",
        message: "invalid JSON",
      } satisfies WorktreeMarkerReadResult,
    }],
    ["moved HEAD", { head: "different" }],
    ["branched worktree", { branch: "feat/shipped-widget" }],
  ])("returns no advisory for a %s", (_label, overrides) => {
    expect(derive(overrides)).toBeNull();
  });

  it("returns no advisory for an unstamped marker", () => {
    expect(derive({
      marker: {
        kind: "present",
        marker: {
          spawnedByArc: true,
          wuName: "shipped-widget",
          spawningIdentity: "andrew",
          createdAt: "2026-07-14T00:00:00.000Z",
        },
      },
    })).toBeNull();
  });

  it("returns no advisory for a stamped non-WU subject", () => {
    expect(derive({
      marker: {
        kind: "present",
        marker: {
          spawnedByArc: true,
          createdFor: { kind: "branch", ref: "review/orphan" },
          spawningIdentity: "andrew",
          createdAt: "2026-07-14T00:00:00.000Z",
          husk: {
            sha: "abc123",
            at: "2026-07-14T01:00:00.000Z",
            subject: { kind: "branch", ref: "review/orphan" },
            branch: "review/orphan",
          },
        },
      },
    })).toBeNull();
  });
});
