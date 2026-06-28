import { describe, expect, it } from "vitest";

import { auditLoadSetManifest } from "../../../src/lib/load-set/audit.js";
import type { LoadSetManifest } from "../../../src/lib/load-set/types.js";

function manifest(paths: readonly string[]): LoadSetManifest {
  return {
    entries: paths.map((path) => ({
      path,
      readMode: { kind: "full" },
    })),
  };
}

const BASELINE = {
  entries: [
    {
      path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md",
      readMode: { kind: "full" },
    },
    {
      path: ".arc/reference/QUICK-REFERENCE.md",
      readMode: {
        kind: "partial-section",
        heading: "Environment & Path Context",
      },
    },
    {
      path: ".arc/active/tasks-compaction-recovery.md",
      readMode: { kind: "partial-strategic" },
    },
  ],
} satisfies LoadSetManifest;

describe("auditLoadSetManifest", () => {
  it("returns a clean verdict when the fresh load-set matches the seed baseline", () => {
    expect(auditLoadSetManifest({ baseline: BASELINE, fresh: BASELINE })).toEqual({
      status: "match",
      diverged: false,
      diff: {
        membership: {
          added: [],
          removed: [],
        },
        readModeChanges: [],
        pathDrifts: [],
      },
    });
  });

  it("flags membership additions and removals", () => {
    const result = auditLoadSetManifest({
      baseline: manifest(["kept.md", "removed.md", "retained.md"]),
      fresh: manifest(["kept.md", "retained.md", "added.md"]),
    });

    expect(result.status).toBe("diverged");
    expect(result.diff.membership.added).toEqual([
      {
        path: "added.md",
        readMode: { kind: "full" },
      },
    ]);
    expect(result.diff.membership.removed).toEqual([
      {
        path: "removed.md",
        readMode: { kind: "full" },
      },
    ]);
  });

  it("flags read-mode changes on retained paths", () => {
    const result = auditLoadSetManifest({
      baseline: BASELINE,
      fresh: {
        entries: BASELINE.entries.map((entry) => entry.path === ".arc/reference/QUICK-REFERENCE.md"
          ? {
            ...entry,
            readMode: { kind: "full" },
          }
          : entry),
      },
    });

    expect(result.status).toBe("diverged");
    expect(result.diff.readModeChanges).toEqual([
      {
        path: ".arc/reference/QUICK-REFERENCE.md",
        expected: {
          kind: "partial-section",
          heading: "Environment & Path Context",
        },
        actual: { kind: "full" },
      },
    ]);
  });

  it("flags same-slot path drift separately from membership changes", () => {
    const result = auditLoadSetManifest({
      baseline: manifest(["universal.md", ".arc/active/meta-before.md", "workflow.md"]),
      fresh: manifest(["universal.md", ".arc/active/meta-after.md", "workflow.md"]),
    });

    expect(result.status).toBe("diverged");
    expect(result.diff.pathDrifts).toEqual([
      {
        index: 1,
        expected: {
          path: ".arc/active/meta-before.md",
          readMode: { kind: "full" },
        },
        actual: {
          path: ".arc/active/meta-after.md",
          readMode: { kind: "full" },
        },
      },
    ]);
    expect(result.diff.membership).toEqual({
      added: [],
      removed: [],
    });
  });

  it("returns a structured diff renderable by the recovery workflow", () => {
    const result = auditLoadSetManifest({
      baseline: BASELINE,
      fresh: {
        entries: [
          BASELINE.entries[0]!,
          {
            path: ".arc/reference/QUICK-REFERENCE.md",
            readMode: { kind: "full" },
          },
          {
            path: ".arc/active/tasks-renamed.md",
            readMode: { kind: "partial-strategic" },
          },
          {
            path: ".arc/system/extensions/post-context-load.md",
            readMode: { kind: "full" },
          },
        ],
      },
    });

    expect(result).toMatchObject({
      status: "diverged",
      diverged: true,
      diff: {
        membership: {
          added: [
            {
              path: ".arc/system/extensions/post-context-load.md",
            },
          ],
          removed: [],
        },
        readModeChanges: [
          {
            path: ".arc/reference/QUICK-REFERENCE.md",
          },
        ],
        pathDrifts: [
          {
            index: 2,
            expected: {
              path: ".arc/active/tasks-compaction-recovery.md",
            },
            actual: {
              path: ".arc/active/tasks-renamed.md",
            },
          },
        ],
      },
    });
  });
});
