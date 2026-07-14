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
  openErrand,
  linkErrandToInbox,
  readErrandRecord,
  type ErrandRecordIO,
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

  it("turns a description-origin record into an inbox-origin record and pushes it", async () => {
    await openErrand(io, { slug: "late-match", base: "main", createdAt: CREATED_AT });

    const result = await linkErrandToInbox(io, { slug: "late-match", originEntry: "Existing capture" });

    expect(result).toMatchObject({ kind: "linked", changed: true, push: { kind: "pushed" } });
    expect(await readErrandRecord(io, "late-match")).toEqual({
      version: 2,
      slug: "late-match",
      origin: "inbox",
      intent: "late-match",
      branch: "chore/late-match",
      createdAt: CREATED_AT,
      originEntry: "Existing capture",
      returnBranch: "main",
    });
  });

  it("is idempotent when already linked to the same capture", async () => {
    await openErrand(io, {
      slug: "adopted",
      base: "main",
      originEntry: "Existing capture",
      createdAt: CREATED_AT,
    });

    const result = await linkErrandToInbox(io, { slug: "adopted", originEntry: "Existing capture" });

    expect(result).toMatchObject({ kind: "linked", changed: false });
    expect((await readErrandRecord(io, "adopted"))?.originEntry).toBe("Existing capture");
  });

  it("refuses to change an existing inbox link", async () => {
    await openErrand(io, {
      slug: "adopted",
      base: "main",
      originEntry: "Original capture",
      createdAt: CREATED_AT,
    });

    const result = await linkErrandToInbox(io, { slug: "adopted", originEntry: "Replacement capture" });

    expect(result).toMatchObject({ kind: "link-conflict", requestedEntry: "Replacement capture" });
    expect((await readErrandRecord(io, "adopted"))?.originEntry).toBe("Original capture");
  });

  it("is a no-op when no record exists for the slug", async () => {
    expect(await linkErrandToInbox(io, { slug: "ghost", originEntry: "Existing capture" })).toEqual({
      kind: "no-record",
      slug: "ghost",
    });
  });
});
