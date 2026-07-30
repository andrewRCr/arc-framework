/** Complete locus-envelope reader coverage. */

import { describe, expect, it } from "vitest";

import type { LocusEvidenceIO } from "../../../src/lib/locus/evidence.js";
import { readLocusEnvelope, readLocusState } from "../../../src/lib/locus/reader.js";
import { MAX_LOCUS_OPAQUE_CHARS } from "../../../src/lib/locus/schema/limits.js";
import type { LocusRecordV1 } from "../../../src/lib/locus/schema/index.js";
import type { SubjectMetaIO } from "../../../src/lib/locus/subject-meta.js";

function evidenceIO(overrides: Partial<LocusEvidenceIO> = {}): LocusEvidenceIO {
  return {
    scanWorktrees: async () => ({
      ok: true,
      worktrees: [{
        path: "/repo",
        head: "a".repeat(40),
        branch: "main",
        detached: false,
        primary: true,
      }],
    }),
    listDirectory: async () => [],
    readText: async () => "",
    readRecord: async () => ({ kind: "absent" }),
    readMarker: async () => ({ kind: "absent" }),
    readLock: async () => ({ kind: "unknown" }),
    readIdentities: async () => ({ kind: "absent" }),
    canonicalPath: async (path) => path,
    inspectAnchor: async () => "unknown",
    ...overrides,
  };
}

const subjectMetaIO: SubjectMetaIO = {
  readFile: async () => { throw new Error("unexpected read"); },
  pathExists: async () => false,
  realpath: async (path) => path,
  lstat: async () => ({ isSymbolicLink: () => false }),
};

function workUnitMeta(subjectKey: string, branch: string): string {
  return `# Metadata: ${subjectKey}

- **State:** \`Active\`
- **Owner:** \`andrew\`
- **Branch:** \`${branch}\`
- **Cohort:** [none]
- **Task List:** [none]
- **Current Workflow:** [none]
- **Next Action:** Continue
`;
}

describe("readLocusEnvelope", () => {
  it("treats never-created record and identity roots as an empty first-use roster", async () => {
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });

    const result = await readLocusEnvelope({
      identity: "andrew",
      pathFlavor: "posix",
      evidenceIO: evidenceIO({ listDirectory: async () => { throw missing; } }),
      subjectMetaIO,
    });

    expect(result).toEqual({
      mode: "locus",
      ok: true,
      primaryPath: "/repo",
      rows: [{
        kind: "free-primary",
        checkoutPath: "/repo",
        primary: true,
        recordId: null,
        role: null,
        identity: null,
        lease: null,
        frame: null,
        derived: null,
        diagnostics: [],
      }],
      diagnostics: [],
    });
  });

  it.each([
    {
      code: "identity-missing" as const,
      identity: null,
      io: evidenceIO(),
    },
    {
      code: "git-topology-unavailable" as const,
      identity: "andrew",
      io: evidenceIO({ scanWorktrees: async () => ({ ok: false, message: "topology failed" }) }),
    },
    {
      code: "record-root-unavailable" as const,
      identity: "andrew",
      io: evidenceIO({ listDirectory: async () => { throw new Error("record root failed"); } }),
    },
    {
      code: "identity-root-unavailable" as const,
      identity: "andrew",
      io: evidenceIO({
        readIdentities: async () => ({ kind: "error", stage: "tip", message: "identity root failed" }),
      }),
    },
  ])("returns a validated $code envelope", async ({ code, identity, io }) => {
    const result = await readLocusEnvelope({
      identity,
      pathFlavor: "posix",
      evidenceIO: io,
      subjectMetaIO,
    });

    expect(result).toMatchObject({ mode: "locus", ok: false, error: { code } });
  });

  it.each([
    ["empty", "", "git-topology-unavailable"],
    [
      "oversized",
      "x".repeat(MAX_LOCUS_OPAQUE_CHARS + 1),
      "x".repeat(MAX_LOCUS_OPAQUE_CHARS),
    ],
  ])("normalizes an %s acquisition error into a validated envelope", async (_case, message, expected) => {
    const result = await readLocusEnvelope({
      identity: "andrew",
      pathFlavor: "posix",
      evidenceIO: evidenceIO({ scanWorktrees: async () => ({ ok: false, message }) }),
      subjectMetaIO,
    });

    expect(result).toEqual({
      mode: "locus",
      ok: false,
      error: { code: "git-topology-unavailable", message: expected },
    });
  });

  it("does not change the observed record or refresh its heartbeat", async () => {
    const digest = "1".repeat(64);
    const record: LocusRecordV1 = {
      schemaVersion: 1,
      recordId: `sha256:${digest}`,
      checkoutPath: "/repo",
      role: {
        kind: "errand",
        subject: { kind: "partial-errand", key: "local", claimId: null },
        establishedAt: "2026-07-20T00:00:00.000Z",
        parentCheckoutPath: null,
        originEntry: null,
      },
      lease: {
        leaseId: "2".repeat(32),
        sessionHomePath: "/repo",
        anchor: {
          kind: "process",
          pid: 12,
          startToken: "start",
          inspector: "test",
          selector: "codex",
        },
        attachedAt: "2026-07-20T00:00:00.000Z",
        heartbeatAt: "2026-07-20T00:01:00.000Z",
      },
    };
    const before = structuredClone(record);

    const result = await readLocusEnvelope({
      identity: "andrew",
      pathFlavor: "posix",
      evidenceIO: evidenceIO({
        listDirectory: async (path) => path.endsWith("/loci")
          ? [`locus-${digest}.json`, ".locks"]
          : [],
        readRecord: async () => ({ kind: "valid", record, bytes: Buffer.from("record") }),
        inspectAnchor: async () => "live",
      }),
      subjectMetaIO,
    });

    expect(result).toMatchObject({
      ok: true,
      rows: [{ lease: { heartbeatAt: "2026-07-20T00:01:00.000Z" } }],
    });
    expect(record).toEqual(before);
  });

  it("bounds subject-meta projection across a high-cardinality roster", async () => {
    const subjects = Array.from({ length: 12 }, (_, offset) => {
      const index = offset + 1;
      const key = `wu-${index}`;
      const branch = `feat/${key}`;
      const path = `/repo-${key}`;
      const digest = index.toString(16).padStart(64, "0");
      const record: LocusRecordV1 = {
        schemaVersion: 1,
        recordId: `sha256:${digest}`,
        checkoutPath: path,
        role: {
          kind: "work-unit",
          subject: { kind: "work-unit", key, claimId: null },
          establishedAt: "2026-07-20T00:00:00.000Z",
          parentCheckoutPath: null,
          originEntry: null,
        },
        lease: null,
      };
      return { key, branch, path, digest, record };
    });
    let active = 0;
    let maximum = 0;
    const boundedSubjectMetaIO: SubjectMetaIO = {
      readFile: async (path) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        active -= 1;
        const subject = subjects.find((candidate) =>
          path === `${candidate.path}/.arc/active/meta-${candidate.key}.md`);
        if (subject === undefined) throw new Error(`unexpected meta read: ${path}`);
        return workUnitMeta(subject.key, subject.branch);
      },
      pathExists: async () => false,
      realpath: async (path) => path,
      lstat: async () => ({ isSymbolicLink: () => false }),
    };
    const options = {
      identity: "andrew",
      pathFlavor: "posix" as const,
      concurrency: 2,
      subjectMetaIO: boundedSubjectMetaIO,
      evidenceIO: evidenceIO({
        scanWorktrees: async () => ({
          ok: true,
          worktrees: [
            { path: "/repo", head: "a".repeat(40), branch: "main", detached: false, primary: true },
            ...subjects.map((subject) => ({
              path: subject.path,
              head: "b".repeat(40),
              branch: subject.branch,
              detached: false,
              primary: false,
            })),
          ],
        }),
        listDirectory: async (path) => {
          if (path.endsWith("/.locks")) return [];
          if (path.endsWith("/loci")) {
            return [...subjects.map((subject) => `locus-${subject.digest}.json`), ".locks"];
          }
          const subject = subjects.find((candidate) =>
            path === `${candidate.path}/.arc/active`);
          return subject === undefined ? [] : [`meta-${subject.key}.md`];
        },
        readText: async (path) => {
          const subject = subjects.find((candidate) =>
            path === `${candidate.path}/.arc/active/meta-${candidate.key}.md`);
          if (subject === undefined) throw new Error(`unexpected evidence read: ${path}`);
          return workUnitMeta(subject.key, subject.branch);
        },
        readRecord: async ({ expectedDigest }) => {
          const subject = subjects.find((candidate) => candidate.digest === expectedDigest);
          return subject === undefined
            ? { kind: "absent" }
            : { kind: "valid", record: subject.record, bytes: Buffer.from(subject.digest) };
        },
        readMarker: async (path) => {
          const subject = subjects.find((candidate) => candidate.path === path);
          return subject === undefined
            ? { kind: "absent" }
            : {
                kind: "present",
                marker: {
                  spawnedByArc: true,
                  wuName: subject.key,
                  createdFor: { kind: "work-unit", name: subject.key },
                  spawningIdentity: "andrew",
                  createdAt: "2026-07-20T00:00:00.000Z",
                },
              };
        },
      }),
    };

    const result = await readLocusEnvelope(options);

    expect(result).toMatchObject({ ok: true, rows: expect.any(Array) });
    expect(maximum).toBe(2);
  });
});

describe("readLocusState", () => {
  it("derives free-primary allocation state from the same bounded evidence", async () => {
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
    const result = await readLocusState({
      identity: "andrew",
      pathFlavor: "posix",
      evidenceIO: evidenceIO({ listDirectory: async () => { throw missing; } }),
      subjectMetaIO,
      identityGlobalUserDir: "/repo/.arc/user/andrew",
      enteringAnchor: {
        kind: "process",
        pid: 42,
        startToken: "start",
        inspector: "fixture",
        selector: "codex",
      },
      readPrimarySafety: async () => ({ kind: "complete", clean: true, onBase: true, branch: "main" }),
    });

    expect(result).toMatchObject({
      current: { kind: "none" },
      primaryAvailability: { kind: "free", checkoutPath: "/repo" },
      recovery: { kind: "none" },
      reconciliation: { kind: "clean" },
    });
  });

  it("reads a complete conservative snapshot from an unverifiable entering anchor", async () => {
    // The probe adapters pass an acquired unverifiable anchor straight through rather than treating
    // it as a failure, so this arm must yield a usable snapshot: no lease anchor can equal it, which
    // is what makes `current` conservatively none.
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
    const result = await readLocusState({
      identity: "andrew",
      pathFlavor: "posix",
      evidenceIO: evidenceIO({ listDirectory: async () => { throw missing; } }),
      subjectMetaIO,
      identityGlobalUserDir: "/repo/.arc/user/andrew",
      enteringAnchor: { kind: "unverifiable", reason: "Unrecognized process boundary: sh" },
      readPrimarySafety: async () => ({ kind: "complete", clean: true, onBase: true, branch: "main" }),
    });

    expect(result).toMatchObject({
      current: { kind: "none" },
      primaryAvailability: { kind: "free", checkoutPath: "/repo" },
      recovery: { kind: "none" },
      reconciliation: { kind: "clean" },
    });
    expect(result.roster.ok).toBe(true);
  });
});
