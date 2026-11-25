/** Failed native tracking updates report the observed lock without hiding a repaired retry. */
import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "tracking.md" });
const state = "refs/arc/user/andrew/personal", tracking = "refs/arc-remotes/origin/user/andrew/personal";

beforeEach(() => { vi.stubEnv("FORCE_COLOR", undefined); });
afterEach(() => { vi.unstubAllEnvs(); });

async function blockedTracking(ageMs: number, retained = true) {
  const h = await refSyncFixture(), clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Before.\n", provenance: testProvenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const before = success(await h.a.store.read({ reference }));
  success(await h.a.store.write({ action: "put", reference, expected: before.version, content: "Incoming.\n", provenance: testProvenance }));
  success(await h.a.store.push());
  const lock = join(h.b.root, ".git", `${tracking}.lock`);
  let armed = true;
  const store = createRefStore({ ...h.b.ports, ...clock, exec: async (command, args, options) => {
    if (!armed || !args.includes("fetch")) return h.b.ports.exec(command, args, options);
    armed = false;
    await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "Retained tracking lock.\n");
    const then = new Date(clock.at().getTime() - ageMs);
    await utimes(lock, then, then);
    const at = args.indexOf("fetch");
    try {
      return await h.b.ports.exec(command, [...args.slice(0, at), "-c", "core.filesRefLockTimeout=0", ...args.slice(at)], options);
    } finally { if (!retained) await rm(lock); }
  } });
  return { ...h, store, lock, armed: () => armed };
}

it.each([0, 300_000])("names a %ims-old tracking lock and permits a repaired pull", async age => {
  const h = await blockedTracking(age);
  const result = success(await h.store.pull());
  expect(h.armed()).toBe(false);
  const notices = result.pulls.flatMap(({ notices }) => notices);
  expect(notices).toEqual([expect.objectContaining({ kind: "tracking-update-failed", ref: state,
    condition: expect.stringContaining(h.lock), remedy: { text: age > 120_000
      ? expect.stringMatching(/remove.*no Git process/iu) : expect.stringMatching(/^Retry/iu) } })]);
  const notice = notices[0];
  if (notice?.kind !== "tracking-update-failed") throw new Error("Expected a tracking update notice");
  expect(notice.condition).toContain(`${age}ms`);
  expect(await readFile(h.lock, "utf8")).toBe("Retained tracking lock.\n");
  expect(success(await h.b.store.read({ reference })).content).toBe("Before.\n");
  await rm(h.lock);
  expect(success(await h.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
  expect(success(await h.store.read({ reference })).content).toBe("Incoming.\n");
}, 20_000);

it("keeps the existing tracking notice when the native lock has already gone", async () => {
  const h = await blockedTracking(300_000, false);
  const result = success(await h.store.pull());
  expect(h.armed()).toBe(false);
  expect(result.pulls.flatMap(({ notices }) => notices)).toEqual([{
    kind: "tracking-update-failed", ref: state,
    condition: `Git could not update ${tracking} even though its fetched history does not diverge.`,
    remedy: { text: "Pull state again. If the update keeps failing, stop the holder or remove its stale Git ref lock, then retry." },
  }]);
  await expect(readFile(h.lock, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect(success(await h.b.store.read({ reference })).content).toBe("Before.\n");
  expect(success(await h.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
  expect(success(await h.store.read({ reference })).content).toBe("Incoming.\n");
}, 20_000);
