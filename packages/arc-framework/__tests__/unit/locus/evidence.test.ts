/** Bounded acquisition of topology and locus authority evidence. */

import { describe, expect, it } from "vitest";

import {
  acquireLocusEvidence,
  type LocusEvidenceIO,
} from "../../../src/lib/locus/evidence.js";
import type { LocusLockHolder } from "../../../src/lib/locus/lock.js";
import type { LocusIdentityV1, LocusRecordV1 } from "../../../src/lib/locus/schema/index.js";

const PROCESS_ANCHOR = {
  kind: "process",
  pid: 123,
  startToken: "start",
  inspector: "test",
  selector: "codex",
} as const;

function record(digest: string): LocusRecordV1 {
  return {
    schemaVersion: 1,
    recordId: `sha256:${digest}`,
    checkoutPath: "/stale",
    role: {
      kind: "work-unit",
      subject: { kind: "work-unit", key: "demo", claimId: null },
      establishedAt: "2026-07-20T00:00:00.000Z",
      parentCheckoutPath: null,
      originEntry: null,
    },
    lease: {
      leaseId: "0".repeat(32),
      sessionHomePath: "/stale",
      anchor: PROCESS_ANCHOR,
      attachedAt: "2026-07-20T00:00:00.000Z",
      heartbeatAt: "2026-07-20T00:00:00.000Z",
    },
  };
}

function io(overrides: Partial<LocusEvidenceIO> = {}): LocusEvidenceIO {
  return {
    scanWorktrees: async () => ({
      ok: true,
      worktrees: [
        { path: "/repo", head: "a".repeat(40), branch: "main", detached: false, primary: true },
        { path: "/repo-wt", head: "b".repeat(40), branch: "chore/demo", detached: false, primary: false },
      ],
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

describe("locus evidence acquisition", () => {
  it("fails closed for missing identity, topology failure, and unreadable authority roots", async () => {
    await expect(acquireLocusEvidence({ identity: null, pathFlavor: "posix", io: io() }))
      .resolves.toEqual({ kind: "error", code: "identity-missing", message: expect.any(String) });
    await expect(acquireLocusEvidence({
      identity: "andrew",
      pathFlavor: "posix",
      io: io({ scanWorktrees: async () => ({ ok: false, message: "topology failed" }) }),
    })).resolves.toMatchObject({ kind: "error", code: "git-topology-unavailable" });
    await expect(acquireLocusEvidence({
      identity: "andrew",
      pathFlavor: "posix",
      io: io({ listDirectory: async () => { throw new Error("permission denied"); } }),
    })).resolves.toMatchObject({ kind: "error", code: "record-root-unavailable" });
    await expect(acquireLocusEvidence({
      identity: "andrew",
      pathFlavor: "posix",
      io: io({ readIdentities: async () => ({ kind: "error", stage: "tip", message: "broken ref" }) }),
    })).resolves.toMatchObject({ kind: "error", code: "identity-root-unavailable" });
  });

  it("treats never-created record, lock, and identity roots as complete empty snapshots", async () => {
    const absent = Object.assign(new Error("missing"), { code: "ENOENT" });
    const result = await acquireLocusEvidence({
      identity: "andrew",
      pathFlavor: "posix",
      io: io({ listDirectory: async () => { throw absent; } }),
    });
    expect(result).toMatchObject({
      kind: "complete",
      root: { primaryPath: "/repo" },
      checkouts: [{ worktree: { path: "/repo" } }, { worktree: { path: "/repo-wt" } }],
      records: [],
      locks: [],
      identities: { kind: "absent" },
    });
  });

  it("preserves partial checkout, record, lock, and identity diagnostics", async () => {
    const result = await acquireLocusEvidence({
      identity: "andrew",
      pathFlavor: "posix",
      io: io({
        listDirectory: async (path) => path.endsWith("/.locks")
          ? ["locus-bad.lock"]
          : path.endsWith("/loci") ? ["locus-bad.json", ".locks"] : ["meta-demo.md"],
        readMarker: async (path) => path === "/repo-wt"
          ? { kind: "malformed", message: "bad marker", path: "/repo-wt/marker" }
          : { kind: "absent" },
        canonicalPath: async (path) => {
          if (path === "/repo-wt") throw new Error("canonical failure");
          return path;
        },
        readIdentities: async () => ({
          kind: "complete",
          tip: "c".repeat(40),
          objects: new Map(),
          records: new Map(),
          projections: new Map(),
          diagnostics: [{ kind: "malformed", key: "bad", message: "invalid" }],
        }),
      }),
    });
    expect(result).toMatchObject({
      kind: "complete",
      checkouts: expect.arrayContaining([
        expect.objectContaining({
          worktree: expect.objectContaining({ path: "/repo-wt" }),
          canonical: expect.objectContaining({ kind: "error" }),
          marker: expect.objectContaining({ kind: "malformed" }),
        }),
      ]),
      recordEntries: [{ kind: "unexpected", name: "locus-bad.json" }],
      lockEntries: [{ kind: "unexpected", name: "locus-bad.lock" }],
      identities: { kind: "complete", diagnostics: [{ kind: "malformed", key: "bad" }] },
    });
  });

  it("honors the fixed concurrency cap across independent evidence chains", async () => {
    let active = 0;
    let maximum = 0;
    const canonicalPath = async (path: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return path;
    };
    await acquireLocusEvidence({
      identity: "andrew",
      pathFlavor: "posix",
      concurrency: 2,
      io: io({ canonicalPath }),
    });
    expect(maximum).toBe(2);
  });

  it("contains an unreadable checkout metadata root to that checkout", async () => {
    const result = await acquireLocusEvidence({
      identity: "andrew",
      pathFlavor: "posix",
      io: io({
        listDirectory: async (path) => {
          if (path.endsWith("/loci") || path.endsWith("/.locks")) return [];
          if (path.startsWith("/repo-wt/")) throw new Error("meta root denied");
          return [];
        },
      }),
    });
    expect(result).toMatchObject({
      kind: "complete",
      checkouts: [
        expect.objectContaining({
          worktree: expect.objectContaining({ path: "/repo" }),
          metaRoots: expect.arrayContaining([expect.objectContaining({ kind: "listed" })]),
        }),
        expect.objectContaining({
          worktree: expect.objectContaining({ path: "/repo-wt" }),
          metaRoots: expect.arrayContaining([
            expect.objectContaining({ kind: "error", message: "meta root denied" }),
          ]),
        }),
      ],
    });
  });

  it("retains stale records, malformed record generations, and orphan lock evidence", async () => {
    const staleDigest = "1".repeat(64);
    const malformedDigest = "2".repeat(64);
    const lockDigest = "3".repeat(64);
    const holder: LocusLockHolder = {
      token: "4".repeat(32),
      anchor: PROCESS_ANCHOR,
      createdAt: "2026-07-20T00:00:00.000Z",
    };
    const result = await acquireLocusEvidence({
      identity: "andrew",
      pathFlavor: "posix",
      io: io({
        listDirectory: async (path) => path.endsWith("/.locks")
          ? [`locus-${lockDigest}.lock`]
          : path.endsWith("/loci")
            ? [`locus-${staleDigest}.json`, `locus-${malformedDigest}.json`, ".locks"]
            : [],
        readRecord: async ({ expectedDigest }) => expectedDigest === staleDigest
          ? { kind: "valid", record: record(staleDigest), bytes: Buffer.from("stale") }
          : { kind: "malformed", message: "bad record" },
        readLock: async () => ({ kind: "valid", holder, bytes: Buffer.from("lock") }),
        inspectAnchor: async () => "dead",
      }),
    });
    expect(result).toMatchObject({
      kind: "complete",
      records: expect.arrayContaining([
        expect.objectContaining({ digest: staleDigest, result: expect.objectContaining({ kind: "valid" }), liveness: "dead" }),
        expect.objectContaining({ digest: malformedDigest, result: expect.objectContaining({ kind: "malformed" }) }),
      ]),
      locks: [expect.objectContaining({
        digest: lockDigest,
        result: expect.objectContaining({ kind: "valid" }),
        liveness: "dead",
      })],
    });
  });

  it("keeps complete identity-only tails when no checkout record exists", async () => {
    const identity: LocusIdentityV1 = {
      kind: "errand",
      key: "solo",
      claimId: "5".repeat(32),
      protection: "full",
      branch: "chore/solo",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      state: "open",
      savedHead: null,
      changeRequest: null,
    };
    const result = await acquireLocusEvidence({
      identity: "andrew",
      pathFlavor: "posix",
      io: io({
        readIdentities: async () => ({
          kind: "complete",
          tip: "6".repeat(40),
          objects: new Map([["solo", "7".repeat(40)]]),
          records: new Map(),
          projections: new Map([["solo", identity]]),
          diagnostics: [],
        }),
      }),
    });
    expect(result).toMatchObject({
      kind: "complete",
      records: [],
      identities: { kind: "complete", projections: new Map([["solo", identity]]) },
    });
  });
});
