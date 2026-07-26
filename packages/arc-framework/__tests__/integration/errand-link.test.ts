/**
 * Integration tests for `linkErrandToInbox` — the composed core behind
 * `arc errand link`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  addBareRemote,
  makeGitExec,
  makeGitExecInput,
} from "../helpers/integration.js";
import {
  TransientIdentityRecordV3Schema,
  openErrand,
  linkErrandToInbox,
  linkOrdinaryErrandAtRuntime,
  ordinaryErrandTransform,
  readErrandRecord,
  readTransientIdentitySnapshot,
  transactTransientIdentities,
  type ErrandRecordIO,
  type OrdinaryErrandRecord,
} from "../../src/lib/errand/index.js";

const IDENTITY = "andrew";
const CREATED_AT = "2026-06-19T12:00:00.000Z";

function ioFor(dir: string): ErrandRecordIO {
  return { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity: IDENTITY };
}

describe("linkErrandToInbox", () => {
  let dir: string;
  let remoteDir: string;
  let io: ErrandRecordIO;

  beforeEach(async () => {
    dir = await createTempRepo();
    await makeCommit(dir, "init");
    remoteDir = await addBareRemote(dir);
    io = ioFor(dir);
  });

  afterEach(async () => {
    await Promise.all([dir, remoteDir].map(cleanupTempDir));
  });

  it("refuses to link a legacy description-origin record", async () => {
    await openErrand(io, { slug: "late-match", base: "main", createdAt: CREATED_AT });

    await expect(linkErrandToInbox(io, { slug: "late-match", originEntry: "Existing capture" }))
      .rejects.toMatchObject({ failure: { kind: "legacy-close-only", operation: "link" } });
    expect((await readErrandRecord(io, "late-match"))?.origin).toBe("description");
  });

  it("refuses even an otherwise-idempotent link on a legacy record", async () => {
    await openErrand(io, {
      slug: "adopted",
      base: "main",
      originEntry: "Existing capture",
      createdAt: CREATED_AT,
    });

    await expect(linkErrandToInbox(io, { slug: "adopted", originEntry: "Existing capture" }))
      .rejects.toMatchObject({ failure: { kind: "legacy-close-only", operation: "link" } });
    expect((await readErrandRecord(io, "adopted"))?.originEntry).toBe("Existing capture");
  });

  it("does not rewrite a legacy record when a different link is requested", async () => {
    await openErrand(io, {
      slug: "adopted",
      base: "main",
      originEntry: "Original capture",
      createdAt: CREATED_AT,
    });

    await expect(linkErrandToInbox(io, { slug: "adopted", originEntry: "Replacement capture" }))
      .rejects.toMatchObject({ failure: { kind: "legacy-close-only", operation: "link" } });
    expect((await readErrandRecord(io, "adopted"))?.originEntry).toBe("Original capture");
  });

  it("is a no-op when no record exists for the slug", async () => {
    expect(await linkErrandToInbox(io, { slug: "ghost", originEntry: "Existing capture" })).toEqual({
      kind: "no-record",
      slug: "ghost",
    });
  });

  it("adopts a remote-only v3 identity through complete-basis reconciliation", async () => {
    const record = TransientIdentityRecordV3Schema.parse({
      version: 3,
      kind: "errand",
      slug: "late-match",
      claimId: "0123456789abcdef0123456789abcdef",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      intent: "Late match",
      branch: "chore/late-match",
      state: "open",
      savedHead: null,
      changeRequest: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    }) as OrdinaryErrandRecord;
    expect(await transactTransientIdentities(io, {
      remote: "origin",
      message: "seed v3 errand",
      transform: ordinaryErrandTransform({ kind: "create", record }),
    })).toMatchObject({ kind: "applied" });
    await io.exec("git", ["update-ref", "-d", `refs/arc/user/${IDENTITY}/errands`]);

    const result = await linkOrdinaryErrandAtRuntime({
      slug: record.slug,
      inbox: {
        title: "Existing capture",
        sourceDigest: `sha256:${"b".repeat(64)}` as `sha256:${string}`,
        executeBound: false,
      },
      updatedAt: "2026-06-19T12:01:00.000Z",
      identity: IDENTITY,
      exec: io.exec,
      execInput: io.execInput,
    });

    expect(result).toMatchObject({
      outcome: "applied",
      originEntry: "Existing capture",
    });
    const snapshot = await readTransientIdentitySnapshot(io);
    expect(snapshot).toMatchObject({ kind: "complete" });
    if (snapshot.kind !== "complete") throw new Error("expected complete identity snapshot");
    expect(snapshot.records.get(record.slug)).toMatchObject({
      claimId: record.claimId,
      origin: "inbox",
      originEntry: "Existing capture",
    });
  });
});
