/**
 * Unit tests for the errand record (de)serialization — the blob form an errand
 * record round-trips through, independent of the orphan state-ref it lives in.
 */

import { describe, it, expect, vi } from "vitest";

import {
  serializeErrandRecord,
  deserializeErrandRecord,
  listErrandRecordsResult,
  type ErrandRecord,
} from "../../src/lib/errand/index.js";
import type { ExecResult, GitExec } from "../../src/lib/git/exec.js";

const inboxRecord: ErrandRecord = {
  version: 1,
  slug: "drain-inbox",
  origin: "inbox",
  intent: "Route the six pending USER-INBOX captures to their homes",
  branch: "chore/drain-inbox",
  createdAt: "2026-06-19T12:00:00.000Z",
  originEntry: "drain-inbox",
};

const descriptionRecord: ErrandRecord = {
  version: 1,
  slug: "fix-typo-readme",
  origin: "description",
  intent: "Fix the broken anchor in the README quick-start",
  branch: "fix/fix-typo-readme",
  createdAt: "2026-06-19T13:30:00.000Z",
};

const returnableRecord: ErrandRecord = {
  version: 2,
  slug: "fix-from-wu",
  origin: "description",
  intent: "Fix an issue beside active WU work",
  branch: "fix/fix-from-wu",
  createdAt: "2026-07-14T12:00:00.000Z",
  returnBranch: "feat/active-wu",
};

describe("errand record (de)serialization", () => {
  it("round-trips an inbox-originated record with no field loss", () => {
    const restored = deserializeErrandRecord(serializeErrandRecord(inboxRecord));
    expect(restored).toEqual(inboxRecord);
  });

  it("round-trips a free-description record with no field loss", () => {
    const restored = deserializeErrandRecord(serializeErrandRecord(descriptionRecord));
    expect(restored).toEqual(descriptionRecord);
  });

  it("round-trips a v2 record carrying its pre-open return branch", () => {
    const restored = deserializeErrandRecord(serializeErrandRecord(returnableRecord));
    expect(restored).toEqual(returnableRecord);
  });

  it("continues to accept legacy v1 records without a return branch", () => {
    const restored = deserializeErrandRecord(JSON.stringify(descriptionRecord));
    expect(restored).toEqual(descriptionRecord);
    expect(restored).not.toHaveProperty("returnBranch");
  });

  it("carries the origin field uniformly across both origins", () => {
    expect(deserializeErrandRecord(serializeErrandRecord(inboxRecord))?.origin).toBe("inbox");
    expect(
      deserializeErrandRecord(serializeErrandRecord(descriptionRecord))?.origin,
    ).toBe("description");
  });

  it("omits the inbox back-pointer for a free-description record", () => {
    const restored = deserializeErrandRecord(serializeErrandRecord(descriptionRecord));
    expect(restored).not.toHaveProperty("originEntry");
  });

  it("serializes byte-stably so a re-write of the same record is idempotent", () => {
    const once = serializeErrandRecord(inboxRecord);
    const twice = serializeErrandRecord(deserializeErrandRecord(once)!);
    expect(twice).toBe(once);
  });

  it("returns null for a malformed blob rather than throwing", () => {
    expect(deserializeErrandRecord("not json")).toBeNull();
    expect(deserializeErrandRecord("{}")).toBeNull();
    expect(deserializeErrandRecord(JSON.stringify({ ...inboxRecord, slug: "" }))).toBeNull();
  });

  it("rejects an inbox-origin record missing its back-pointer", () => {
    const blob = JSON.stringify({
      version: 1,
      slug: "x",
      origin: "inbox",
      intent: "i",
      branch: "chore/x",
      createdAt: "2026-06-19T12:00:00.000Z",
    });
    expect(deserializeErrandRecord(blob)).toBeNull();
  });

  it("rejects a free-description record carrying an inbox back-pointer", () => {
    expect(
      deserializeErrandRecord(JSON.stringify({ ...descriptionRecord, originEntry: "x" })),
    ).toBeNull();
  });
});

describe("errand record listing", () => {
  it("reports an incomplete read when a listed record blob cannot be read", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (args[0] === "ls-tree") {
        return {
          stdout: `100644 blob ${"a".repeat(40)}\tbroken-record\n`,
          stderr: "",
        };
      }
      if (args[0] === "cat-file") throw new Error("fatal: object unavailable");
      throw new Error(`unexpected git ${args.join(" ")}`);
    });

    const result = await listErrandRecordsResult({ exec, identity: "andrew" });

    expect(result.records).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.warnings).toEqual([
      expect.stringContaining("broken-record"),
    ]);
  });
});
