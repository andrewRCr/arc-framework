import { describe, expect, it } from "vitest";

import {
  acquireLocusEvidence,
  type LocusEvidenceIO,
} from "../../../src/lib/locus/evidence.js";
import { deriveLocusRecordId } from "../../../src/lib/locus/path-identity.js";
import type { LocusRecordV1 } from "../../../src/lib/locus/schema/index.js";
import { classifyTeardownOccupancy } from "../../../src/lib/work-unit/teardown-occupancy.js";

const TARGET = "/repo-wt";
const DIGEST = deriveLocusRecordId(TARGET, "posix").digest;
const ANCHOR = {
  kind: "process",
  pid: 123,
  startToken: "start",
  inspector: "test",
  selector: "vitest",
} as const;

function record(options: { path?: string; lease?: boolean; subject?: string } = {}): LocusRecordV1 {
  const checkoutPath = options.path ?? TARGET;
  const digest = deriveLocusRecordId(checkoutPath, "posix").digest;
  return {
    schemaVersion: 1,
    recordId: `sha256:${digest}`,
    checkoutPath,
    role: {
      kind: "work-unit",
      subject: { kind: "work-unit", key: options.subject ?? "demo", claimId: null },
      establishedAt: "2026-07-21T00:00:00.000Z",
      parentCheckoutPath: null,
      dispatchId: null,
      originEntry: null,
      routingPlanDigest: null,
    },
    lease: options.lease === false ? null : {
      leaseId: "a".repeat(32),
      sessionHomePath: checkoutPath,
      anchor: ANCHOR,
      attachedAt: "2026-07-21T00:00:00.000Z",
      heartbeatAt: "2026-07-21T00:00:00.000Z",
    },
  };
}

function io(options: {
  recordKind?: "absent" | "valid" | "malformed" | "unsupported";
  liveness?: "live" | "dead" | "unknown";
  marker?: "current" | "absent" | "cross-identity" | "malformed";
  lock?: "absent" | "live" | "dead" | "unknown";
  duplicate?: boolean;
  subject?: string;
} = {}): LocusEvidenceIO {
  const recordKind = options.recordKind ?? "valid";
  const marker = options.marker ?? "current";
  const aliasDigest = deriveLocusRecordId("/alias", "posix").digest;
  return {
    scanWorktrees: async () => ({
      ok: true,
      worktrees: [
        { path: "/repo", head: "a".repeat(40), branch: "main", detached: false, primary: true },
        { path: TARGET, head: "b".repeat(40), branch: "feat/demo", detached: false, primary: false },
      ],
    }),
    listDirectory: async (path) => {
      if (path.endsWith("/.locks")) {
        return options.lock === undefined || options.lock === "absent" ? [] : [`locus-${DIGEST}.lock`];
      }
      if (!path.endsWith("/loci")) return [];
      if (recordKind === "absent") return [];
      return [
        `locus-${DIGEST}.json`,
        ...(options.duplicate === true ? [`locus-${aliasDigest}.json`] : []),
      ];
    },
    readText: async () => "",
    readRecord: async ({ expectedDigest }) => {
      if (recordKind === "malformed") return { kind: "malformed", message: "bad" };
      if (recordKind === "unsupported") return { kind: "unsupported", schemaVersion: 0 };
      const value = expectedDigest === aliasDigest ? record({ path: "/alias" }) : record({ subject: options.subject });
      return { kind: "valid", record: value, bytes: Buffer.from("record") };
    },
    readMarker: async (path) => {
      if (path !== TARGET || marker === "absent") return { kind: "absent" };
      if (marker === "malformed") return { kind: "malformed", message: "bad", path: `${path}/marker` };
      return {
        kind: "present",
        marker: {
          spawnedByArc: true,
          spawningIdentity: marker === "cross-identity" ? "someone-else" : "andrew",
          createdAt: "2026-07-21T00:00:00.000Z",
          wuName: "demo",
        },
      };
    },
    readLock: async () => options.lock === "unknown"
      ? { kind: "unknown" }
      : {
          kind: "valid",
          holder: { token: "b".repeat(32), anchor: ANCHOR, createdAt: "2026-07-21T00:00:00.000Z" },
          bytes: Buffer.from("lock"),
        },
    readIdentities: async () => ({ kind: "absent" }),
    canonicalPath: async (path) => path === "/alias" ? TARGET : path,
    inspectAnchor: async () => options.lock !== undefined && options.lock !== "absent"
      ? options.lock === "unknown" ? "unknown" : options.lock
      : options.liveness ?? "dead",
  };
}

async function decide(options: Parameters<typeof io>[0] = {}) {
  const evidence = await acquireLocusEvidence({ identity: "andrew", pathFlavor: "posix", io: io(options) });
  return classifyTeardownOccupancy({
    evidence,
    identity: "andrew",
    pathFlavor: "posix",
    canonicalPath: TARGET,
    subject: { kind: "work-unit", name: "demo" },
  });
}

describe("teardown locus occupancy", () => {
  it("suppresses a live lease and permits exact dead or absent generations", async () => {
    await expect(decide({ liveness: "live" })).resolves.toMatchObject({ kind: "suppress", reason: "lease-live" });
    await expect(decide({ liveness: "dead" })).resolves.toMatchObject({ kind: "clear", leaseState: "dead" });
    await expect(decide({ recordKind: "valid", marker: "current" })).resolves.toMatchObject({ kind: "clear" });
    await expect(decide({ recordKind: "absent", marker: "current" })).resolves.toEqual({
      kind: "clear",
      recordId: null,
      leaseId: null,
      leaseState: "absent",
      recordGeneration: null,
      lockGeneration: null,
      markerGeneration: expect.any(String),
    });
  });

  it.each([
    ["unknown lease", { liveness: "unknown" }, "state-unavailable"],
    ["malformed record", { recordKind: "malformed" }, "record-malformed"],
    ["legacy record", { recordKind: "unsupported" }, "legacy-record"],
    ["cross identity", { marker: "cross-identity" }, "cross-identity"],
    ["duplicate record", { duplicate: true }, "duplicate-locus"],
    ["markerless checkout", { recordKind: "absent", marker: "absent" }, "markerless"],
    ["unknown lock", { lock: "unknown" }, "lock-unknown"],
    ["live lock", { lock: "live" }, "lock-live"],
    ["wrong subject", { subject: "other" }, "subject-mismatch"],
  ] as const)("requires manual cleanup for %s", async (_label, options, reason) => {
    await expect(decide(options)).resolves.toMatchObject({ kind: "manual", reason });
  });
});
