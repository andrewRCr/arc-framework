/** First-writer identity claims over real competing local and remote refs. */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TransientIdentityRecordV3Schema,
  groomClaimConflictResolver,
  groomClaimTransform,
  housekeepClaimConflictResolver,
  housekeepClaimTransform,
  pinGroomOpenedBaseHead,
  readTransientIdentitySnapshot,
  rollbackIdentityClaim,
  transactTransientIdentities,
  type ErrandRecordIO,
  type GroomIdentityRecord,
  type HousekeepIdentityRecord,
} from "../../src/lib/errand/index.js";
import {
  addBareRemote,
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
  makeGitExecInput,
} from "../helpers/integration.js";

const identity = "andrew";
const createdAt = "2026-07-20T00:00:00.000Z";
const digest = `sha256:${"d".repeat(64)}`;

function ioFor(dir: string): ErrandRecordIO {
  return { identity, exec: makeGitExec(dir), execInput: makeGitExecInput(dir) };
}

function groom(
  claimId: string,
  openedBaseHead: string,
  overrides: Record<string, unknown> = {},
): GroomIdentityRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    kind: "groom",
    slug: "groom-alpha",
    claimId,
    anchorStub: "alpha",
    members: ["alpha", "beta"],
    openedBaseHead,
    protection: "full",
    branch: "chore/groom-alpha",
    state: "open",
    changeRequest: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }) as GroomIdentityRecord;
}

function housekeep(slug: string, claimId: string, dispatchId: string): HousekeepIdentityRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    kind: "errand",
    slug,
    claimId,
    purpose: "housekeep-routing",
    branch: `chore/${slug}`,
    routingLane: "auto",
    dispatchId,
    routingPlanDigest: digest,
    state: "open",
    savedHead: null,
    changeRequest: null,
    createdAt,
    updatedAt: createdAt,
  }) as HousekeepIdentityRecord;
}

describe("identity claim races", () => {
  let dir: string;
  let remoteDir: string;
  let initialHead: string;
  const siblings: string[] = [];

  beforeEach(async () => {
    dir = await createTempRepo();
    initialHead = await makeCommit(dir, "init");
    remoteDir = await addBareRemote(dir);
  });

  afterEach(async () => {
    await Promise.all([dir, remoteDir, ...siblings].map(cleanupTempDir));
    siblings.length = 0;
  });

  async function sibling(): Promise<string> {
    const value = await createTempRepo();
    siblings.push(value);
    await execFileAsync("git", ["remote", "add", "origin", remoteDir], { cwd: value });
    return value;
  }

  it("pins the freshly fetched remote base rather than an unpushed local head", async () => {
    await makeCommit(dir, "local base drift");
    await expect(pinGroomOpenedBaseHead(makeGitExec(dir), {
      remote: "origin",
      baseRef: "main",
    })).resolves.toMatchObject({ kind: "pinned", head: initialHead });

    const { stdout } = await execFileAsync(
      "git",
      ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/groom-base"],
      { cwd: dir },
    );
    expect(stdout).toBe("");
  });

  it("adopts the published exact-set groom winner and its pinned base", async () => {
    const loser = groom("1".repeat(32), "a".repeat(40));
    const winner = groom("2".repeat(32), "b".repeat(40));
    await transactTransientIdentities(ioFor(dir), {
      remote: null,
      message: "write local groom claimant",
      transform: groomClaimTransform(loser),
    });
    const peer = await sibling();
    await transactTransientIdentities(ioFor(peer), {
      remote: "origin",
      message: "publish groom winner",
      transform: groomClaimTransform(winner),
    });

    const outcome = await transactTransientIdentities(ioFor(dir), {
      remote: "origin",
      message: "adopt groom winner",
      transform: groomClaimTransform(loser),
      resolveConflict: groomClaimConflictResolver(loser),
    });
    if (outcome.kind === "error") throw new Error(`${outcome.stage}: ${outcome.message}`);
    expect(outcome).toMatchObject({
      kind: "idempotent",
      value: { kind: "resume", record: { claimId: winner.claimId, openedBaseHead: winner.openedBaseHead } },
    });
  });

  it("preserves disjoint groom claims created concurrently", async () => {
    const local = groom("8".repeat(32), "a".repeat(40), { members: ["alpha"] });
    const remote = groom("9".repeat(32), "b".repeat(40), {
      slug: "groom-gamma",
      anchorStub: "gamma",
      members: ["gamma"],
      branch: "chore/groom-gamma",
    });
    await transactTransientIdentities(ioFor(dir), {
      remote: null,
      message: "write disjoint local groom claim",
      transform: groomClaimTransform(local),
    });
    const peer = await sibling();
    await transactTransientIdentities(ioFor(peer), {
      remote: "origin",
      message: "publish disjoint remote groom claim",
      transform: groomClaimTransform(remote),
    });

    await expect(transactTransientIdentities(ioFor(dir), {
      remote: "origin",
      message: "reconcile disjoint groom claims",
      transform: groomClaimTransform(local),
      resolveConflict: groomClaimConflictResolver(local),
    })).resolves.toMatchObject({ kind: "idempotent" });
    const snapshot = await readTransientIdentitySnapshot(ioFor(dir));
    if (snapshot.kind !== "complete") throw new Error("expected complete identity snapshot");
    expect([...snapshot.records.keys()].sort()).toEqual([local.slug, remote.slug].sort());
  });

  it("collapses different-slug same-plan housekeep claimants to one stable dispatch", async () => {
    const loser = housekeep("route-local", "3".repeat(32), "dispatch-local");
    const winner = housekeep("route-remote", "4".repeat(32), "dispatch-remote");
    await transactTransientIdentities(ioFor(dir), {
      remote: null,
      message: "write local routing claimant",
      transform: housekeepClaimTransform(loser),
    });
    const peer = await sibling();
    await transactTransientIdentities(ioFor(peer), {
      remote: "origin",
      message: "publish routing winner",
      transform: housekeepClaimTransform(winner),
    });

    const outcome = await transactTransientIdentities(ioFor(dir), {
      remote: "origin",
      message: "adopt routing winner",
      transform: housekeepClaimTransform(loser),
      resolveConflict: housekeepClaimConflictResolver(loser),
    });
    if (outcome.kind === "error") throw new Error(`${outcome.stage}: ${outcome.message}`);
    expect(outcome).toMatchObject({
      kind: "applied",
      value: { kind: "resume", record: { slug: winner.slug, dispatchId: winner.dispatchId } },
    });
    const snapshot = await readTransientIdentitySnapshot(ioFor(dir));
    if (snapshot.kind !== "complete") throw new Error("expected complete identity snapshot");
    expect([...snapshot.records.keys()]).toEqual([winner.slug]);
  });

  it("adopts the published same-slug housekeep winner only for the validated plan", async () => {
    const loser = housekeep("route-inbox", "6".repeat(32), "dispatch-local");
    const winner = housekeep("route-inbox", "7".repeat(32), "dispatch-remote");
    await transactTransientIdentities(ioFor(dir), {
      remote: null,
      message: "write same-slug local claimant",
      transform: housekeepClaimTransform(loser),
    });
    const peer = await sibling();
    await transactTransientIdentities(ioFor(peer), {
      remote: "origin",
      message: "publish same-slug routing winner",
      transform: housekeepClaimTransform(winner),
    });

    await expect(transactTransientIdentities(ioFor(dir), {
      remote: "origin",
      message: "adopt same-slug routing winner",
      transform: housekeepClaimTransform(loser),
      resolveConflict: housekeepClaimConflictResolver(loser),
    })).resolves.toMatchObject({
      kind: "idempotent",
      value: { kind: "resume", record: { claimId: winner.claimId, dispatchId: winner.dispatchId } },
    });
  });

  it("surfaces failed allocation rollback as explicit recovery work", async () => {
    const expected = groom("5".repeat(32), "e".repeat(40));
    await transactTransientIdentities(ioFor(dir), {
      remote: "origin",
      message: "publish allocation claim",
      transform: groomClaimTransform(expected),
    });
    await execFileAsync("git", ["remote", "set-url", "origin", `${remoteDir}-unreachable`], { cwd: dir });

    await expect(rollbackIdentityClaim(ioFor(dir), {
      remote: "origin",
      message: "rollback failed allocation",
      expected,
    })).resolves.toMatchObject({
      kind: "recovery-required",
      record: { claimId: expected.claimId },
      actions: ["resume", "abandon"],
      cause: { kind: "error", stage: "fetch" },
    });

    await execFileAsync("git", ["remote", "set-url", "origin", remoteDir], { cwd: dir });
    await expect(rollbackIdentityClaim(ioFor(dir), {
      remote: "origin",
      message: "retry allocation rollback",
      expected,
    })).resolves.toMatchObject({ kind: "retired" });
  });
});
