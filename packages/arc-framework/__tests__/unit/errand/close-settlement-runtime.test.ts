/** Replay of exact Errand checkout settlement after destructive boundary failures. */

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import {
  settleOrdinaryErrandCloseLocusAtRuntime,
  type CloseLocusSettlementRuntimeOptions,
} from "../../../src/lib/errand/close-settlement-runtime.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { deriveLocusRecordId } from "../../../src/lib/locus/path-identity.js";
import type { LocusAnchor, LocusRecordV1, LocusRowV1, LocusStateV1 } from "../../../src/lib/locus/schema/index.js";

const roots: string[] = [];
const CLAIM_ID = "c".repeat(32);
const LEASE_ID = "d".repeat(32);
const HEAD = "a".repeat(40);
const AT = "2026-07-20T12:00:00.000Z";
const ANCHOR: LocusAnchor = {
  kind: "process",
  pid: 42,
  startToken: "session-generation",
  inspector: "fixture",
  selector: "codex",
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function awaiting(): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    slug: "done",
    claimId: CLAIM_ID,
    createdAt: AT,
    updatedAt: AT,
    kind: "errand",
    purpose: "errand",
    intent: "done",
    branch: "chore/done",
    origin: "description",
    originEntry: null,
    state: "awaiting-merge",
    savedHead: null,
    changeRequest: {
      repositoryRef: "owner/repo",
      hostRef: "github.com",
      baseRef: "main",
      headRef: "chore/done",
      headSha: HEAD,
    },
  }) as OrdinaryErrandRecord;
}

async function removedCheckoutFixture(
  checkoutRegistered = false,
): Promise<{
  options: CloseLocusSettlementRuntimeOptions;
  recordPath: string;
  recordId: string;
  checkoutPath: string;
}> {
  const primary = await mkdtemp(join(tmpdir(), "arc-close-settlement-"));
  roots.push(primary);
  const removedCheckout = join(dirname(primary), `${basename(primary)}-removed`);
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  const checkoutIdentity = deriveLocusRecordId(removedCheckout, pathFlavor);
  const lociRoot = join(primary, ".arc", "user", "andrew", ".internal", "loci");
  const recordPath = join(lociRoot, `locus-${checkoutIdentity.digest}.json`);
  const persisted: LocusRecordV1 = {
    schemaVersion: 1,
    recordId: checkoutIdentity.recordId,
    checkoutPath: checkoutIdentity.normalizedPath,
    role: {
      kind: "errand",
      subject: { kind: "errand", key: "done", claimId: CLAIM_ID },
      establishedAt: AT,
      parentCheckoutPath: null,
      originEntry: null,
    },
    lease: {
      leaseId: LEASE_ID,
      sessionHomePath: checkoutIdentity.normalizedPath,
      anchor: ANCHOR,
      attachedAt: AT,
      heartbeatAt: AT,
    },
  };
  await mkdir(lociRoot, { recursive: true });
  await writeFile(recordPath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");

  const row: LocusRowV1 = {
    kind: "stale-record",
    checkoutPath: checkoutIdentity.normalizedPath,
    primary: null,
    recordId: checkoutIdentity.recordId,
    role: {
      kind: "errand",
      subject: { kind: "errand", key: "done", claimId: CLAIM_ID },
      parentCheckoutPath: null,
      originEntry: null,
    },
    identity: null,
    lease: {
      leaseId: LEASE_ID,
      state: "live",
      selfHeld: true,
      sessionHomePath: checkoutIdentity.normalizedPath,
      attachedAt: AT,
      heartbeatAt: AT,
    },
    frame: null,
    derived: null,
    diagnostics: [],
  };
  const state = {
    roster: { mode: "locus", ok: true, primaryPath: primary, rows: [row], diagnostics: [] },
    current: { kind: "none" },
    primaryAvailability: { kind: "free", checkoutPath: primary },
    inFlightIdentities: [],
    recovery: { kind: "none" },
    reconciliation: { kind: "clean" },
  } as LocusStateV1;
  const exec: GitExec = async (_command, args) => {
    if (args.join(" ") !== "worktree list --porcelain -z") {
      throw new Error(`Unexpected Git command: ${args.join(" ")}`);
    }
    const spawned = checkoutRegistered
      ? `worktree ${checkoutIdentity.normalizedPath}\0HEAD ${HEAD}\0branch refs/heads/chore/done\0\0`
      : "";
    return {
      stdout: `worktree ${primary}\0HEAD ${HEAD}\0branch refs/heads/main\0\0${spawned}`,
      stderr: "",
    };
  };
  const record = awaiting();
  if (record.state !== "awaiting-merge") throw new Error("expected awaiting Errand");
  return {
    recordPath,
    recordId: checkoutIdentity.recordId,
    checkoutPath: checkoutIdentity.normalizedPath,
    options: {
      authority: "removed-checkout",
      target: { record, changeRequest: record.changeRequest },
      state,
      row,
      currentCheckoutPath: primary,
      base: "main",
      identity: "andrew",
      postCreateScript: "",
      registeredHarnessDirs: "",
      anchor: ANCHOR,
      inspector: { kind: "fixture", inspect: async () => ({ kind: "absent" }) },
      pathFlavor,
      exec,
    },
  };
}

async function baseRetryFixture(): Promise<{
  options: CloseLocusSettlementRuntimeOptions;
  lockPath: string;
}> {
  const primary = await mkdtemp(join(tmpdir(), "arc-close-base-retry-"));
  roots.push(primary);
  await mkdir(join(primary, ".git"), { recursive: true });
  const record = awaiting();
  if (record.state !== "awaiting-merge") throw new Error("expected awaiting Errand");
  const state = {
    roster: {
      mode: "locus",
      ok: true,
      primaryPath: primary,
      rows: [{
        kind: "free-primary",
        checkoutPath: primary,
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
    },
    current: { kind: "none" },
    primaryAvailability: { kind: "free", checkoutPath: primary },
    inFlightIdentities: [],
    recovery: { kind: "none" },
    reconciliation: { kind: "clean" },
  } as LocusStateV1;
  const exec: GitExec = async (_command, args) => {
    const command = args.join(" ");
    if (command === "worktree list --porcelain -z") {
      return { stdout: `worktree ${primary}\0HEAD ${HEAD}\0branch refs/heads/main\0\0`, stderr: "" };
    }
    if (command === "status --porcelain") return { stdout: "", stderr: "" };
    if (command === "rev-parse --abbrev-ref HEAD") return { stdout: "main\n", stderr: "" };
    if (command === "rev-parse --git-path HEAD") {
      return { stdout: `${join(primary, ".git", "HEAD")}\n`, stderr: "" };
    }
    throw new Error(`Unexpected Git command: ${command}`);
  };
  return {
    lockPath: join(primary, ".git", "HEAD.lock"),
    options: {
      authority: "base-checkout",
      target: { record, changeRequest: record.changeRequest },
      state,
      row: null,
      currentCheckoutPath: primary,
      base: "main",
      identity: "andrew",
      postCreateScript: "",
      registeredHarnessDirs: "",
      anchor: ANCHOR,
      inspector: {
        kind: "fixture",
        inspect: async (pid) => ({
          kind: "present",
          pid,
          parentPid: 1,
          startToken: "close-holder-generation",
          commandIdentity: "node",
        }),
      },
      pathFlavor: process.platform === "win32" ? "windows" : "posix",
      exec,
    },
  };
}

describe("Errand close settlement runtime", () => {
  it("pops the exact self-held stale record after its spawned checkout was removed", async () => {
    const fixture = await removedCheckoutFixture();

    await expect(settleOrdinaryErrandCloseLocusAtRuntime(fixture.options)).resolves.toMatchObject({
      kind: "applied",
      recordId: fixture.recordId,
      sessionHomePath: fixture.checkoutPath,
    });
    await expect(access(fixture.recordPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves the stale record when its checkout path is registered again", async () => {
    const fixture = await removedCheckoutFixture(true);

    await expect(settleOrdinaryErrandCloseLocusAtRuntime(fixture.options)).resolves.toMatchObject({
      kind: "refused",
      reason: "role-conflict",
    });
    await expect(access(fixture.recordPath)).resolves.toBeUndefined();
  });

  it("reacquires primary checkout authority after the exact locus record was popped", async () => {
    const fixture = await baseRetryFixture();

    const result = await settleOrdinaryErrandCloseLocusAtRuntime(fixture.options);
    expect(result).toMatchObject({ kind: "idempotent", recordId: null });
    if (result.kind !== "idempotent" || result.guard === null) throw new Error("expected base retry guard");
    await expect(access(fixture.lockPath)).resolves.toBeUndefined();
    const acquired = await result.guard.acquire();
    if (acquired.kind !== "acquired") throw new Error("expected transferred base retry guard");
    await acquired.release();
    await expect(access(fixture.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
