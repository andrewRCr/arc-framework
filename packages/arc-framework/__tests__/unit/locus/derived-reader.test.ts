/** Dormant worktree-first reader orchestration over injected evidence. */

import { posix } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { LocusIdentityV1 } from "../../../src/lib/locus/schema/index.js";
import type { SubjectMetaIO } from "../../../src/lib/locus/subject-meta.js";
import {
  readDerivedLocusRoster,
  type DormantCheckoutReadEvidence,
} from "../../../src/lib/locus/derived-reader.js";

const projectorInputs = vi.hoisted(() => [] as Array<{ activeExtensions?: readonly string[] }>);

vi.mock("../../../src/lib/locus/subject-meta.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/locus/subject-meta.js")>();
  return {
    ...actual,
    async projectCheckoutSubjectMeta(options: Parameters<typeof actual.projectCheckoutSubjectMeta>[0]) {
      projectorInputs.push(options);
      return actual.projectCheckoutSubjectMeta(options);
    },
  };
});

function meta(root: string, key = "demo") {
  return {
    kind: "read" as const,
    name: `meta-${key}.md`,
    path: `${root}/.arc/active/meta-${key}.md`,
    text: `# Metadata: ${key}\n\n- **State:** \`Active\`\n- **Owner:** \`andrew\`\n- **Branch:** \`feat/${key}\`\n- **Cohort:** [none]\n- **Task List:** \`tasks-${key}.md\`\n- **Current Workflow:** [none]\n- **Next Action:** Continue\n`,
  };
}

function subjectIO(files: ReadonlyMap<string, string>): SubjectMetaIO {
  return {
    readFile: async (path) => {
      const content = files.get(path);
      if (content === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return content;
    },
    pathExists: async (path) => files.has(path),
    realpath: async (path) => posix.normalize(path),
    lstat: async () => ({ isSymbolicLink: () => false }),
  };
}

function identity(key: string, claimId = `claim-${key}`): LocusIdentityV1 {
  return {
    kind: "errand",
    key,
    claimId,
    protection: "full",
    branch: `chore/${key}`,
    purpose: "errand",
    origin: "description",
    originEntry: null,
    state: "open",
    savedHead: null,
    changeRequest: null,
  };
}

function wuEvidence(path: string, key = "demo"): DormantCheckoutReadEvidence {
  const candidate = meta(path, key);
  return {
    checkoutPath: path,
    marker: {
      kind: "present",
      marker: { spawnedByArc: true, createdFor: { kind: "work-unit", name: key } },
      generation: `sha256:${"a".repeat(64)}`,
    },
    metaRoots: [{ kind: "listed", path: `${path}/.arc/active` }],
    metas: [candidate],
  };
}

function baseOptions(overrides: Record<string, unknown> = {}) {
  const path = "/repo/demo";
  const candidate = meta(path);
  const files = new Map([
    [candidate.path, candidate.text],
    [`${path}/.arc/active/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[ ]` **1.1 Do it**\n"],
  ]);
  return {
    identity: "andrew",
    activeExtensions: [] as readonly string[],
    topology: {
      ok: true as const,
      worktrees: [{
        path,
        head: "a".repeat(40),
        branch: "feat/demo",
        detached: false,
        primary: false,
      }],
    },
    checkouts: [wuEvidence(path)],
    completed: { status: "available" as const, records: new Map() },
    identities: { kind: "absent" as const },
    primarySafety: { kind: "error" as const, message: "not primary" },
    canonicalizePath: async (value: string) => value,
    subjectMetaIO: subjectIO(files),
    ...overrides,
  };
}

describe("dormant derived roster reader", () => {
  it("forwards active extensions once into a stable rich WU context", async () => {
    projectorInputs.length = 0;
    const activeExtensions = ["release-notes", "security-review"] as const;
    const result = await readDerivedLocusRoster(baseOptions({ activeExtensions }));

    expect(projectorInputs).toHaveLength(1);
    expect(projectorInputs[0]?.activeExtensions).toBe(activeExtensions);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      kind: "work-unit",
      subject: { kind: "work-unit", key: "demo" },
      context: {
        kind: "resolved",
        sessionType: "execution",
        taskCursor: { status: "found" },
      },
    });
  });

  it("canonicalizes each registered path once and localizes a malformed sibling", async () => {
    const canonicalized: string[] = [];
    const healthy = baseOptions();
    const baseline = await readDerivedLocusRoster(healthy);
    const badPath = "/repo/bad";
    const withSibling = await readDerivedLocusRoster(baseOptions({
      topology: {
        ok: true,
        worktrees: [
          healthy.topology.worktrees[0],
          { path: badPath, head: "b".repeat(40), branch: "feat/bad", detached: false, primary: false },
        ],
      },
      checkouts: [
        wuEvidence("/repo/demo"),
        {
          checkoutPath: badPath,
          marker: { kind: "malformed", reason: "invalid marker" },
          metaRoots: [],
          metas: [],
        },
      ],
      canonicalizePath: async (path: string) => {
        canonicalized.push(path);
        return path;
      },
    }));

    expect(canonicalized).toEqual(["/repo/demo", badPath]);
    expect(withSibling.rows.find((row) => row.checkout.path === "/repo/demo"))
      .toEqual(baseline.rows[0]);
    expect(withSibling.rows.find((row) => row.checkout.path === badPath))
      .toMatchObject({ kind: "unresolved-checkout" });
  });

  it("contains identity root failure to discovery and identity-backed rows", async () => {
    const path = "/repo/repair";
    const result = await readDerivedLocusRoster(baseOptions({
      topology: {
        ok: true,
        worktrees: [
          baseOptions().topology.worktrees[0],
          { path, head: "b".repeat(40), branch: "chore/repair", detached: false, primary: false },
        ],
      },
      checkouts: [
        wuEvidence("/repo/demo"),
        {
          checkoutPath: path,
          marker: {
            kind: "present",
            marker: {
              spawnedByArc: true,
              createdFor: { kind: "errand", slug: "repair", claimId: "claim-repair" },
              provisioning: "ready",
            },
            generation: `sha256:${"b".repeat(64)}`,
          },
          metaRoots: [],
          metas: [],
        },
      ],
      identities: { kind: "error", stage: "tree", message: "identity tree unavailable" },
    }));

    expect(result.rows.find((row) => row.checkout.path === "/repo/demo"))
      .toMatchObject({ kind: "work-unit" });
    expect(result.rows.find((row) => row.checkout.path === path))
      .toMatchObject({ kind: "unresolved-checkout" });
    expect(result.identityDiscovery).toEqual({
      kind: "error",
      stage: "tree",
      message: "identity tree unavailable",
    });
  });

  it("keeps orphan identities on discovery and unrelated diagnostics off healthy rows", async () => {
    const orphan = identity("orphan");
    const result = await readDerivedLocusRoster(baseOptions({
      identities: {
        kind: "complete",
        tip: "c".repeat(40),
        objects: new Map(),
        records: new Map(),
        projections: new Map([["orphan", orphan]]),
        diagnostics: [{ kind: "malformed", key: "unrelated", message: "bad JSON" }],
      },
    }));

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ kind: "work-unit", diagnostics: [] });
    expect(result.identityDiscovery).toEqual({
      kind: "complete",
      identities: [orphan],
      diagnostics: [{ kind: "malformed", key: "unrelated", message: "bad JSON" }],
    });
  });
});
