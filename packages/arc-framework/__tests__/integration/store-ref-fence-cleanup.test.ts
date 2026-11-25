/** Failed fence setup must release its scratch copy of the source store. */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runFenceOverRepository } from "../helpers/store/fence-repository.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed } from "../helpers/store/suite-tools.js";

afterEach(() => vi.unstubAllEnvs());

async function sourceWithScratch() {
  const source = await createRefFixture();
  const present = await seed(source, source.reference("personal/document", "present"));
  const scratch = join(source.root, "fence-scratch");
  await mkdir(scratch);
  for (const key of ["TMPDIR", "TEMP", "TMP"]) vi.stubEnv(key, scratch);
  return { source, present, scratch };
}

it("removes the copied store when the planned edit names an absent record", async () => {
  const { source, scratch } = await sourceWithScratch();
  const reference = source.reference("personal/document", "absent");
  await expect(runFenceOverRepository(source.root, [
    { kind: "edit", reference, edit: content => content },
  ], "test-user")).rejects.toThrow("The edited record is unreadable: The record is not present");
  expect(await readdir(scratch)).toEqual([]);
});

it("removes the scratch repository if Git fails during copy setup", async () => {
  const { source, present, scratch } = await sourceWithScratch();
  vi.stubEnv("GIT_AUTHOR_DATE", "invalid-date");
  await expect(runFenceOverRepository(source.root, [
    { kind: "edit", reference: present.reference, edit: content => content },
  ], "test-user")).rejects.toThrow(/invalid date/u);
  expect(await readdir(scratch)).toEqual([]);
});

it("removes the copied store and projection if the edit fails during a case", async () => {
  const { source, present, scratch } = await sourceWithScratch();
  let edits = 0;
  await expect(runFenceOverRepository(source.root, [
    { kind: "edit", reference: present.reference, edit: content => {
      if (++edits === 2) throw new Error("Cannot prepare the edit.");
      return `${content}\nEdit.\n`;
    } },
  ], "test-user")).rejects.toThrow("Cannot prepare the edit.");
  expect(await readdir(scratch)).toEqual([]);
});
