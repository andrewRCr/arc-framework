/** Reading a checkout's projection index, and what a command makes of one it cannot use. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { PROJECTION_INDEX_FILE, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { encodeProjectionIndex, type ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";

const index: ProjectionIndex = {
  format: 1, state: null,
  projectedUnder: { view: { mode: "mine", pins: [] }, identity: SlugSchema.parse("andrew"), claim: null, layoutActive: "nested" },
  withheldCopies: [], tripwires: {}, ignoreFiles: null, entries: {},
};

let gitDir: string;
let location: ProjectionLocation;
beforeEach(async () => {
  gitDir = await mkdtemp(join(tmpdir(), "arc-projection-index-"));
  location = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, "arc-projection") };
  await mkdir(location.stateDir);
});
afterEach(async () => { await rm(gitDir, { recursive: true, force: true }); });

async function holdIndex(content: string): Promise<void> {
  await writeFile(join(location.stateDir, PROJECTION_INDEX_FILE), content);
}

describe("reading a checkout's index", () => {
  it.each([
    ["missing", undefined],
    ["unreadable", "{\"format\":1,"],
    ["unreadable", JSON.stringify({ format: 1 })],
    ["other-format", encodeProjectionIndex(index).replace("\"format\":1", "\"format\":0")],
    ["other-format", encodeProjectionIndex(index).replace("\"format\":1", "\"format\":2")],
  ] as const)("reads a checkout holding a projection as unusable, %s", async (cause, content) => {
    if (content !== undefined) await holdIndex(content);
    expect(await readProjectionIndex(location, true)).toEqual({ kind: "unusable", cause });
  });

  it("reads a checkout holding no projection and no index as no projection", async () => {
    expect(await readProjectionIndex(location, false)).toEqual({ kind: "no-projection" });
  });

  it("reads the index a checkout holding no projection still holds", async () => {
    await holdIndex(encodeProjectionIndex(index));
    expect(await readProjectionIndex(location, false)).toEqual({ kind: "index", index });
  });

  it("reads an index it cannot open as unusable, unreadable", async () => {
    await mkdir(join(location.stateDir, PROJECTION_INDEX_FILE));
    expect(await readProjectionIndex(location, true)).toEqual({ kind: "unusable", cause: "unreadable" });
  });
});
