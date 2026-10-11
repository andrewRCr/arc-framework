import { describe, expect, it } from "vitest";

import { LineageRecordSchema, writeLineageRecord, type LineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import {
  TRANSITION_RECORD_NAMESPACE,
  resolveTransitionRecordPath,
  resolveTransitionRecordRelativePath,
  writeTransitionRecord,
  type TransitionRecordFs,
} from "../../../src/lib/work-unit/transition-record-store.js";

function record(): LineageRecord {
  return LineageRecordSchema.parse({
    schemaVersion: 2,
    origin: { name: "retired-origin" },
    kind: "rename",
    successors: [{ name: "replacement" }],
    incoming: [],
  });
}

function memoryFs() {
  const directories = new Set(["/repo", "/repo/.arc", "/repo/.arc/system", "/repo/.arc/system/.internal"]);
  const symlinks = new Set<string>();
  const files = new Map<string, string>();
  const fs: TransitionRecordFs = {
    lstat: async (path) => {
      if (symlinks.has(path)) return { isDirectory: () => false, isSymbolicLink: () => true };
      if (directories.has(path)) return { isDirectory: () => true, isSymbolicLink: () => false };
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    mkdir: async (path) => {
      if (directories.has(path)) throw Object.assign(new Error("occupied"), { code: "EEXIST" });
      directories.add(path);
    },
    writeFile: async (path, content) => {
      if (files.has(path)) throw Object.assign(new Error("occupied"), { code: "EEXIST" });
      files.set(path, content);
    },
  };
  return { fs, directories, symlinks, files };
}

describe("transition record store", () => {
  it("derives the exclusive path from the typed record origin", async () => {
    const memory = memoryFs();

    await writeTransitionRecord("/repo", record(), memory.fs);

    expect(memory.directories).toContain(`/repo/${TRANSITION_RECORD_NAMESPACE}`);
    expect([...memory.files]).toEqual([[
      `/repo/${TRANSITION_RECORD_NAMESPACE}/retired-origin.json`,
      writeLineageRecord(record()),
    ]]);
    expect(resolveTransitionRecordRelativePath("retired-origin")).toBe(
      `${TRANSITION_RECORD_NAMESPACE}/retired-origin.json`,
    );
    expect(resolveTransitionRecordPath("/repo", "retired-origin")).toBe(
      `/repo/${TRANSITION_RECORD_NAMESPACE}/retired-origin.json`,
    );
  });

  it("refuses invalid records before creating the namespace", async () => {
    const memory = memoryFs();
    const invalid = { ...record(), origin: { name: "../outside" } } as LineageRecord;

    await expect(writeTransitionRecord("/repo", invalid, memory.fs)).rejects.toThrow();

    expect(memory.directories).not.toContain(`/repo/${TRANSITION_RECORD_NAMESPACE}`);
    expect(memory.files).toEqual(new Map());
  });

  it("never replaces an occupied origin", async () => {
    const memory = memoryFs();
    await writeTransitionRecord("/repo", record(), memory.fs);

    await expect(writeTransitionRecord("/repo", record(), memory.fs)).rejects.toMatchObject({ code: "EEXIST" });

    expect([...memory.files.values()]).toEqual([writeLineageRecord(record())]);
  });

  it("refuses a symlinked parent before writing", async () => {
    const memory = memoryFs();
    memory.symlinks.add("/repo/.arc/system/.internal");
    memory.directories.delete("/repo/.arc/system/.internal");

    await expect(writeTransitionRecord("/repo", record(), memory.fs)).rejects.toThrow(/real directory/iu);

    expect(memory.files).toEqual(new Map());
  });
});
