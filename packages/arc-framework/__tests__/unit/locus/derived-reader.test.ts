/** Dormant worktree-first reader orchestration over injected evidence. */

import { posix } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LocusIdentityV1 } from "../../../src/lib/locus/schema/index.js";
import type { SubjectMetaIO } from "../../../src/lib/locus/subject-meta.js";
import { reduceCandidateDurableBaseline } from
  "../../../src/lib/work-unit/candidate-attestation.js";
import { projectEffectiveCandidateTarget } from
  "../../../src/lib/work-unit/candidate-effective-target.js";
import { deriveRecoveryLocusContext } from "../../../src/lib/recover/locus-context.js";
import {
  readDerivedLocusFrame,
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

function archivedMeta(root: string, key = "demo") {
  const archiveRoot = `${root}/.arc/completed/2026-q3/49_${key}`;
  return {
    kind: "read" as const,
    name: `meta-${key}.md`,
    path: `${archiveRoot}/meta-${key}.md`,
    text: `# Metadata: ${key}\n\n- **State:** \`Shipped\`\n- **Owner:** \`andrew\`\n- **Branch:** [none]\n- **Cohort:** [none]\n- **Task List:** \`tasks-${key}.md\`\n- **Current Workflow:** [none]\n- **Next Action:** Complete post-merge cleanup\n`,
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
    projectDeliveryCorrection: async () => ({ status: "none" }),
    projectCandidateTarget: async ({ record }) => {
      const baseline = reduceCandidateDurableBaseline(record);
      return projectEffectiveCandidateTarget({
        record,
        current: baseline.target,
        currentBase: record.attestation.baseRevision,
        projectApplicability: async () => {
          throw new Error("A durable target must not request applicability.");
        },
      });
    },
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

type ReaderOptions = Parameters<typeof readDerivedLocusRoster>[0];

function baseOptions(overrides: Partial<ReaderOptions> = {}) {
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
  beforeEach(() => {
    projectorInputs.length = 0;
  });

  it("selects the canonical entering WU and derives active context from that row", async () => {
    const canonicalized: string[] = [];
    const result = await readDerivedLocusFrame({
      ...baseOptions(),
      enteringCheckoutPath: "/repo/demo",
      canonicalizePath: async (path) => {
        canonicalized.push(path);
        return path;
      },
    });

    expect(canonicalized).toEqual(["/repo/demo"]);
    expect(result.entering).toMatchObject({
      kind: "selected",
      row: { kind: "work-unit", subject: { kind: "work-unit", key: "demo" } },
    });
    expect(result.active).toMatchObject({
      checkoutPath: "/repo/demo",
      subject: { kind: "work-unit", key: "demo" },
      context: { sessionType: "execution" },
    });
  });

  it("recovers integration context from the entering WU's exact archived meta", async () => {
    const path = "/repo/demo";
    const archived = archivedMeta(path);
    const files = new Map([
      [archived.path, archived.text],
      [`${path}/.arc/completed/2026-q3/49_demo/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[x]` **1.1 Do it**\n"],
    ]);
    const evidence = {
      checkoutPath: path,
      marker: {
        kind: "present" as const,
        marker: { spawnedByArc: true as const, createdFor: { kind: "work-unit" as const, name: "demo" } },
        generation: `sha256:${"a".repeat(64)}`,
      },
      metaRoots: [{ kind: "listed" as const, path: `${path}/.arc/active` }],
      metas: [],
      archivedMetaRoots: [{ kind: "listed" as const, path: `${path}/.arc/completed` }],
      archivedMetas: [archived],
    };

    const result = await readDerivedLocusFrame({
      ...baseOptions({
        checkouts: [evidence],
        subjectMetaIO: subjectIO(files),
      }),
      enteringCheckoutPath: path,
    });

    expect(result.entering).toMatchObject({
      kind: "selected",
      row: {
        kind: "work-unit",
        lifecycleLocation: "completed",
        context: {
          metaPath: ".arc/completed/2026-q3/49_demo/meta-demo.md",
          sessionType: "integration",
          workflow: "integrate-work-unit",
          taskCursor: { status: "no-open-task" },
        },
      },
    });
    expect(result.active?.context.loadSet.entries).toContainEqual({
      path: ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      readMode: { kind: "full" },
    });
    expect(deriveRecoveryLocusContext({
      state: result,
      identity: "andrew",
      workingMemoryPath: "/repo/.arc/user/andrew/WORKING-MEMORY.md",
      activeExtensions: [],
    })).toMatchObject({
      frame: {
        kind: "resolved",
        subject: { kind: "work-unit", key: "demo" },
        workflow: "integrate-work-unit",
        sessionType: "integration",
      },
      taskCursor: { status: "no-open-task" },
    });
  });

  it("refuses duplicate archived candidates instead of selecting an integration subject", async () => {
    const path = "/repo/demo";
    const first = archivedMeta(path);
    const second = {
      ...first,
      path: `${path}/.arc/completed/2026-q4/01_demo/meta-demo.md`,
    };
    const evidence = {
      checkoutPath: path,
      marker: {
        kind: "present" as const,
        marker: { spawnedByArc: true as const, createdFor: { kind: "work-unit" as const, name: "demo" } },
        generation: `sha256:${"a".repeat(64)}`,
      },
      metaRoots: [{ kind: "listed" as const, path: `${path}/.arc/active` }],
      metas: [],
      archivedMetaRoots: [{ kind: "listed" as const, path: `${path}/.arc/completed` }],
      archivedMetas: [first, second],
    };

    const result = await readDerivedLocusFrame({
      ...baseOptions({ checkouts: [evidence] }),
      enteringCheckoutPath: path,
    });

    expect(result.entering).toMatchObject({
      kind: "selected",
      row: {
        kind: "unresolved-checkout",
        context: null,
        diagnostics: [{
          code: "authority-evidence-unreadable",
          message: "Duplicate archived meta for demo",
        }],
      },
    });
    expect(result.active).toBeNull();
  });

  it("contains malformed siblings while preserving the exact entering-row result", async () => {
    const badPath = "/repo/bad";
    const options = baseOptions({
      topology: {
        ok: true,
        worktrees: [
          baseOptions().topology.worktrees[0]!,
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
    });

    const healthy = await readDerivedLocusFrame({ ...options, enteringCheckoutPath: "/repo/demo" });
    const unresolved = await readDerivedLocusFrame({ ...options, enteringCheckoutPath: badPath });

    expect(healthy.entering).toMatchObject({ kind: "selected", row: { kind: "work-unit" } });
    expect(healthy.active).toMatchObject({ subject: { key: "demo" } });
    expect(unresolved.entering).toMatchObject({
      kind: "selected",
      row: { kind: "unresolved-checkout", diagnostics: [{ code: "authority-evidence-unreadable" }] },
    });
    expect(unresolved.active).toBeNull();
  });

  it("contains sibling subject-context I/O failure but keeps entering-checkout failure strict", async () => {
    const badPath = "/repo/bad";
    const demo = meta("/repo/demo");
    const bad = meta(badPath, "bad");
    const files = new Map([
      [demo.path, demo.text],
      ["/repo/demo/.arc/active/tasks-demo.md", "## **Phase 1:** Demo\n\n### `[ ]` **1.1 Do it**\n"],
      [bad.path, bad.text],
    ]);
    const io = subjectIO(files);
    const subjectMetaIO: SubjectMetaIO = {
      ...io,
      readFile: async (path) => {
        if (path === `${badPath}/.arc/active/tasks-bad.md`) throw new Error("bad sibling task I/O");
        return io.readFile(path);
      },
    };
    const options = baseOptions({
      topology: {
        ok: true,
        worktrees: [
          baseOptions().topology.worktrees[0]!,
          { path: badPath, head: "b".repeat(40), branch: "feat/bad", detached: false, primary: false },
        ],
      },
      checkouts: [wuEvidence("/repo/demo"), wuEvidence(badPath, "bad")],
      subjectMetaIO,
    });

    const healthy = await readDerivedLocusFrame({ ...options, enteringCheckoutPath: "/repo/demo" });
    expect(healthy.entering).toMatchObject({ kind: "selected", row: { kind: "work-unit" } });
    expect(healthy.roster.find((row) => row.checkout.path === badPath)).toMatchObject({
      kind: "unresolved-checkout",
      diagnostics: [{ code: "subject-context-unavailable", message: "bad sibling task I/O" }],
    });
    await expect(readDerivedLocusFrame({ ...options, enteringCheckoutPath: badPath }))
      .rejects.toThrow("bad sibling task I/O");
  });

  it("forwards active extensions once into a stable rich WU context", async () => {
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
          healthy.topology.worktrees[0]!,
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
          baseOptions().topology.worktrees[0]!,
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

  it("does not project unrelated WU metas into a marker-selected transient", async () => {
    const path = "/repo/repair";
    const unrelated = meta(path, "other");
    const repair = identity("repair");
    const result = await readDerivedLocusRoster(baseOptions({
      topology: {
        ok: true,
        worktrees: [
          { path, head: "b".repeat(40), branch: "chore/repair", detached: false, primary: false },
        ],
      },
      checkouts: [{
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
        metaRoots: [{ kind: "listed", path: `${path}/.arc/active` }],
        metas: [unrelated],
      }],
      identities: {
        kind: "complete",
        tip: "c".repeat(40),
        objects: new Map(),
        records: new Map(),
        projections: new Map([["repair", repair]]),
        diagnostics: [],
      },
      subjectMetaIO: subjectIO(new Map()),
    }));

    expect(result.rows).toMatchObject([{
      kind: "transient",
      subject: { kind: "errand", key: "repair", claimId: "claim-repair" },
    }]);
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
