/** Complete create-only pass entries and best-effort record faults. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { atomicCreateFile } from "../../../../src/lib/fs.js";
import { createCheckPassStore, type CheckPassRecord } from "../../../../src/lib/checks/record.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "arc-check-pass-"));
  directories.push(directory);
  const io = { directory: async () => directory, readFile: (path: string) => readFile(path, "utf8"), createFile: atomicCreateFile };
  return { directory, io, store: createCheckPassStore(io) };
}
function pass(output = "stored summary"): CheckPassRecord {
  return { schemaVersion: 1, id: "lint", key: "a".repeat(64), outcome: "passed", output };
}

it("publishes a successful execution and reads its stored summary", async () => {
  const { store } = await fixture();
  const record = pass();
  await store.put(record);
  expect(await store.get(record.key, record.id)).toEqual(record);
});

it("does not publish a failed execution", async () => {
  const { directory, store } = await fixture();
  const failed = { ...pass(), outcome: "failed" } as unknown as CheckPassRecord;
  await store.put(failed);
  await expect(readFile(join(directory, `${failed.key}.json`), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

it("keeps one complete entry when two writers publish the same key", async () => {
  const { store } = await fixture();
  const first = pass("first summary");
  const second = pass("second summary");
  await expect(Promise.all([store.put(first), store.put(second)])).resolves.toEqual([undefined, undefined]);
  const published = await store.get(first.key, first.id);
  expect([first, second]).toContainEqual(published);
  await store.put(pass("replacement"));
  expect(await store.get(first.key, first.id)).toEqual(published);
});

it("treats an unwritable record as an unavailable shortcut", async () => {
  const { io } = await fixture();
  const store = createCheckPassStore({ ...io, createFile: async () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); } });
  await expect(store.put(pass())).resolves.toBeUndefined();
  expect(await store.get(pass().key, "lint")).toBeNull();
});

it("treats an unreadable record as an unavailable shortcut", async () => {
  const { io } = await fixture();
  const store = createCheckPassStore({ ...io, readFile: async () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); } });
  await expect(store.get(pass().key, "lint")).resolves.toBeNull();
});

it("ignores malformed JSON in a pass entry", async () => {
  const { directory, store } = await fixture();
  await writeFile(join(directory, `${pass().key}.json`), "{broken");
  expect(await store.get(pass().key, "lint")).toBeNull();
});

it.each([
  { name: "wrong id", content: { ...pass(), id: "other" } },
  { name: "wrong key", content: { ...pass(), key: "b".repeat(64) } },
  { name: "failed outcome", content: { ...pass(), outcome: "failed" } },
  { name: "invalid payload", content: { ...pass(), output: false } },
])("ignores an entry with $name", async ({ content }) => {
  const { directory, store } = await fixture();
  await writeFile(join(directory, `${pass().key}.json`), JSON.stringify(content));
  expect(await store.get(pass().key, "lint")).toBeNull();
});
