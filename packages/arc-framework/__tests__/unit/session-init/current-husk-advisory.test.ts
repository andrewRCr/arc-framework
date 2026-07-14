import { describe, expect, it } from "vitest";

import {
  deriveCurrentHuskAdvisory,
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
  completed?: ReadonlySet<string>;
} = {}) {
  return deriveCurrentHuskAdvisory({
    worktreePath: "/wt/shipped-widget",
    branch: overrides.branch ?? null,
    head: overrides.head ?? "abc123",
    marker: overrides.marker ?? stampedMarker,
    completed: overrides.completed ?? new Set(["shipped-widget"]),
  });
}

describe("deriveCurrentHuskAdvisory", () => {
  it("identifies a matching stamped completed work unit", () => {
    expect(derive()).toEqual({
      worktreePath: "/wt/shipped-widget",
      subject: { kind: "work-unit", name: "shipped-widget" },
    });
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
    ["non-completed WU", { completed: new Set<string>() }],
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
