/** Platform stat strategies retain native file observations and bound asynchronous work. */
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readStat, readStatSync } from "../../../../src/lib/store/projection/change-detection.js";
import { readProjectionStats } from "../../../../src/lib/store/projection/stat-observations.js";

let checkout: string;
beforeEach(async () => { checkout = await mkdtemp(join(tmpdir(), "arc-stat-observations-")); });
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

it.each(["linux", "darwin", "win32"] as const)("retains the same native files, links, and absence using %s", async platform => {
  await writeFile(join(checkout, "file.md"), "native bytes\n");
  await symlink(join(checkout, "file.md"), join(checkout, "link.md"), "file");
  const paths = ["file.md", "link.md", "missing.md"];
  let synchronous = 0, asynchronous = 0;
  const observed = await readProjectionStats(checkout, paths, { platform,
    read: async path => { asynchronous++; return readStat(path); },
    readSync: path => { synchronous++; return readStatSync(path); } });
  expect([...observed].sort()).toEqual((await Promise.all(paths.map(async path => [path, await readStat(join(checkout, path))] as const))).sort());
  expect({ synchronous, asynchronous }).toEqual(platform === "win32" ? { synchronous: 0, asynchronous: 3 } : { synchronous: 3, asynchronous: 0 });
  expect(await readFile(join(checkout, "file.md"), "utf8")).toBe("native bytes\n");
});

it("bounds Windows stat observations at 32 simultaneous native reads", async () => {
  const paths = Array.from({ length: 67 }, (_, i) => `${i}.md`);
  await Promise.all(paths.map(path => writeFile(join(checkout, path), path)));
  let release = (): void => undefined, active = 0, peak = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const batch = readProjectionStats(checkout, paths, { platform: "win32", read: async path => {
    active++; peak = Math.max(peak, active);
    try { await held; return await readStat(path); } finally { active--; }
  } });
  try { await vi.waitFor(() => expect(active).toBe(32)); }
  finally { release(); await batch; }
  expect(peak).toBe(32);
  expect((await batch).size).toBe(67);
  expect(active).toBe(0);
});

it("drains in-flight native reads before surfacing a worker failure", async () => {
  const files = ["denied.md", "held-one.md", "held-two.md"];
  await Promise.all(files.map(path => writeFile(join(checkout, path), path)));
  let release = (): void => undefined, waiting = 0, completed = 0, settled = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  const failure = Object.assign(new Error("stat denied"), { code: "EACCES" });
  const batch = readProjectionStats(checkout, files, { platform: "win32", read: async path => {
    if (path.endsWith("denied.md")) throw failure;
    waiting++;
    await held;
    const result = await readStat(path); completed++; return result;
  } }).then(() => { settled = true; return null; }, error => { settled = true; return error as unknown; });
  try {
    await vi.waitFor(() => expect(waiting).toBe(2));
    expect(settled).toBe(false);
  } finally { release(); }
  expect(await batch).toBe(failure);
  expect(completed).toBe(2);
});
