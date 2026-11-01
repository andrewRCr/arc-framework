/** Public operations release abandoned readers before acquiring a replacement layout. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

afterEach(() => vi.unstubAllEnvs());
const provenance = { verb: "test-write", lifecycleAction: "update" };
interface TraceEvent { event: string; sid: string; argv?: string[] }
async function events(path: string): Promise<TraceEvent[]> {
  return (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as TraceEvent);
}
async function allReadersExited(path: string) {
  const trace = await events(path);
  const readers = trace.filter(({ event, argv }) => event === "start" && argv?.includes("cat-file") && argv.includes("--batch"));
  expect(readers.length).toBeGreaterThan(0);
  return readers.every((reader) => trace.some(({ event, sid }) => event === "exit" && sid === reader.sid));
}

it.each(["list", "write"] as const)("releases the vanished attempt before restarting %s", async (operation) => {
  const f = await createRefReadFixture();
  await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const seeded = success(await f.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
  const directory = join(f.root, ".git", "arc", "store");
  const path = join(f.root, "restart-trace.json");
  let moved = false, failed = false, exitedAtRestart: boolean | undefined;
  const store = createRefStore({ ...f.ports, rawExec: async (args, options) => {
    if (failed && !args.includes(`--git-dir=${directory}`) && exitedAtRestart === undefined) exitedAtRestart = await allReadersExited(path);
    if (!moved && args.includes("diff-tree")) {
      moved = true;
      await f.exec("git", ["fetch", directory, "refs/arc/*:refs/arc/*"]);
      await f.ports.fs.removeDirectory(directory);
    }
    try { return await f.ports.rawExec(args, options); }
    catch (error) { if (moved) failed = true; throw error; }
  } });
  vi.stubEnv("GIT_TRACE2_EVENT", path);
  const result = operation === "list" ? await store.list({ family: "work-item" }) : await store.write({
    action: "put", expected: seeded.version!, reference: seeded.reference,
    content: makeMetaFixture("alpha") + "\nAfter move.\n", placement: { kind: "active" }, provenance,
  });
  expect(result).toMatchObject({ status: "ok" });
  expect(failed).toBe(true);
  expect(exitedAtRestart).toBe(true);
  expect(await allReadersExited(path)).toBe(true);
  expect(success(await f.store.read({ reference: seeded.reference })).content)
    .toBe(makeMetaFixture("alpha") + (operation === "write" ? "\nAfter move.\n" : ""));
}, 30_000);

it("restarts a write when an existing reader answers missing from a departed store", async () => {
  const f = await createRefReadFixture();
  await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const seeded = success(await f.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
  const directory = join(f.root, ".git", "arc", "store");
  let exchanges = 0, missing = false, perReadFailed = false;
  const store = createRefStore({ ...f.ports, rawExec: async (args, options) => {
    if (args.includes("cat-file") && ++exchanges === 2) {
      await f.exec("git", ["fetch", directory, "refs/arc/*:refs/arc/*"]);
      await f.ports.fs.removeDirectory(directory);
    }
    const perRead = missing && !options?.batchReader && args.includes(`--git-dir=${directory}`)
      && args.includes("cat-file") && args.includes("--batch");
    let result: Awaited<ReturnType<typeof f.ports.rawExec>>;
    try { result = await f.ports.rawExec(args, options); }
    catch (error) { if (perRead) perReadFailed = true; throw error; }
    if (exchanges === 2 && args.includes("cat-file")) missing = Buffer.from(result.stdout).includes(Buffer.from(" missing\n"));
    return result;
  } });
  const result = await store.write({ action: "put", expected: seeded.version!, reference: seeded.reference,
    content: makeMetaFixture("alpha") + "\nAfter missing.\n", placement: { kind: "active" }, provenance });
  expect(missing).toBe(true);
  expect(perReadFailed).toBe(true);
  expect(result).toMatchObject({ status: "ok" });
  expect(success(await f.store.read({ reference: seeded.reference })).content).toBe(makeMetaFixture("alpha") + "\nAfter missing.\n");
}, 30_000);

it("does not start a confirmation process for an absent record in a present store", async () => {
  const f = await createRefReadFixture();
  await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const seeded = success(await f.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
  const path = join(f.root, "absent-trace.json");
  vi.stubEnv("GIT_TRACE2_EVENT", path);
  expect(await f.store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/companion", owner: seeded.reference.owner, key: "absent" }) }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const trace = await events(path);
  expect(trace.filter(({ event, argv }) => event === "start" && argv?.includes("cat-file"))).toHaveLength(1);
  expect(await allReadersExited(path)).toBe(true);
});
