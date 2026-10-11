/** Structural integrity of the repository's own tracked transition records. */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { enumerateTransitionReferenceTransitions } from "../../src/lib/work-unit/reference-reconcile.js";
import { validateTransitionRecordEnumeration } from "../../src/lib/work-unit/transition-record-enumeration.js";
import { parseLineageRecord, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import {
  TRANSITION_RECORD_NAMESPACE,
  resolveTransitionRecordRelativePath,
} from "../../src/lib/work-unit/transition-record-store.js";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

async function readLiveRecords(): Promise<{ filename: string; content: Buffer }[]> {
  const directory = `${REPOSITORY_ROOT}${TRANSITION_RECORD_NAMESPACE}`;
  const filenames = (await readdir(directory)).sort();
  return Promise.all(filenames.map(async (filename) => ({
    filename,
    content: await readFile(`${directory}/${filename}`),
  })));
}

describe("live transition records", () => {
  it("stores each record canonically at its origin's path", async () => {
    const records = await readLiveRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const { filename, content } of records) {
      const text = content.toString("utf8");
      const record = parseLineageRecord(text);
      expect(record, filename).not.toBeNull();
      if (record === null) continue;
      expect(resolveTransitionRecordRelativePath(record.origin.name), filename)
        .toBe(`${TRANSITION_RECORD_NAMESPACE}/${filename}`);
      expect(writeLineageRecord(record), filename).toBe(text);
    }
  });

  it("enumerates as one namespace that projects to reference transitions", async () => {
    const enumeration = validateTransitionRecordEnumeration((await readLiveRecords()).map(
      ({ filename, content }) => ({ filename, mode: "100644", type: "blob", content }),
    ));
    expect(enumeration).toMatchObject({ status: "valid" });
    expect(enumerateTransitionReferenceTransitions(enumeration)).toMatchObject({ status: "valid" });
  });
});
