/** Complete locus-envelope reader coverage. */

import { describe, expect, it } from "vitest";

import type { LocusEvidenceIO } from "../../../src/lib/locus/evidence.js";
import { readLocusEnvelope, readLocusState } from "../../../src/lib/locus/reader.js";
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
