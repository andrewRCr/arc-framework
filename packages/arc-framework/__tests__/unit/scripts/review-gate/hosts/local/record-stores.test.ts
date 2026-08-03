import { describe, expect, it } from "vitest";

import {
  LocalApprovedDispositionRecordStore,
} from "../../../../../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import type {
  GitCommonStatePublisher,
} from "../../../../../../src/lib/git-common-state.js";
import {
  RepositoryLocalReviewSourceStore,
} from "../../../../../../src/scripts/review-gate/hosts/local/source-store.js";

function publisher(raw: string): GitCommonStatePublisher {
  return {
    read: async () => raw,
    update: async (_namespace, _recordName, update) => (await update(raw)).result,
  };
}

describe("local review record stores", () => {
  it.each([
    ["source", () => new RepositoryLocalReviewSourceStore(publisher("{")).readSource("source.json")],
    ["disposition", () => new LocalApprovedDispositionRecordStore(publisher("{"))
      .readDispositionRecord("operation-1")],
  ])("classifies malformed durable %s records as corrupt state", async (_kind, read) => {
    await expect(read()).rejects.toMatchObject({ code: "corrupt-state" });
  });
});
