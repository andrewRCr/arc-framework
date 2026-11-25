/** Copied-store rehearsals preserve Git's hash algorithm through edit preparation. */
import { afterEach, expect, it, vi } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { gitBlobId } from "../../src/lib/store/projection/blob-id.js";
import * as writeBack from "../../src/lib/store/projection/write-back.js";
import { cohortDoc } from "../helpers/store/cohort-rule-input.js";
import { runFenceOverRepository } from "../helpers/store/fence-repository.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { success } from "../helpers/store/suite-tools.js";

afterEach(() => vi.unstubAllEnvs());

it.each(["sha1", "sha256"] as const)("rehearses an edit from a %s store when Git defaults to SHA-1", async format => {
  vi.stubEnv("GIT_DEFAULT_HASH", "sha1");
  const source = await createRefReadFixture("files", undefined, format);
  const group = success(await source.store.write({
    action: "put", reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "group" } }),
    content: cohortDoc("group").content, expected: null, provenance: { verb: "seed", lifecycleAction: "test" },
  }));

  const preparation = vi.spyOn(writeBack, "prepareWriteBack");
  try {
    const reports = await runFenceOverRepository(source.root, [
      { kind: "edit", reference: group.reference, edit: content => `${content}\nThe register row closes.\n` },
    ], "andrew");
    expect(reports).toMatchObject([
      { change: "edit cohort/document:group", outcome: { kind: "refused" } },
      { change: "an unrelated write", outcome: { kind: "admitted" } },
    ]);
    expect(preparation).toHaveBeenCalled();
    for (const [context, request] of preparation.mock.calls) {
      expect(context.format).toBe(format);
      expect(request.entry.base.blob).toBe(gitBlobId(cohortDoc("group").content, format));
    }
  } finally {
    preparation.mockRestore();
  }
}, 120_000);
