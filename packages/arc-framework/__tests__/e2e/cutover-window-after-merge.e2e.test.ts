/** Source CLI comparisons and confirmations retain late changes at exact held tips. */
import { resolve } from "node:path";
import { execa } from "execa";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { importWindowFixture } from "../helpers/cutover-window/import.js";
import { finishFixtureFlip } from "../helpers/cutover-window/after-merge.js";
import { checkFixture } from "../helpers/cutover-window/check.js";

const repository = resolve(import.meta.dirname, "../../../..");
const entry = resolve(import.meta.dirname, "../../src/scripts/cutover-window/main.ts");
function sourceWindow(root: string, operation: string, args: readonly string[] = []) {
  return execa(process.execPath, ["--import", "tsx", entry, operation, "--repo", root, "--json", ...args],
    { cwd: repository, reject: false, env: { FORCE_COLOR: undefined, NO_COLOR: "1" } });
}

it("confirms exactly the moved range listed by the source command", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await h.git("git", ["checkout", "feat/alpha"]);
  await h.git("git", ["commit", "--allow-empty", "-m", "Late branch edit"]);
  await h.git("git", ["checkout", "main"]);
  const compared = await sourceWindow(h.root, "compare", ["--branch", "feat/alpha"]);
  expect(compared.exitCode, compared.stderr).toBe(0);
  const ranges = (JSON.parse(compared.stdout) as { data: { ranges: { side: string; tip: string }[] } }).data.ranges;
  expect(ranges).toHaveLength(1);
  const tips = ranges.flatMap(range => [`--${range.side}-tip`, range.tip]);
  const confirmed = await sourceWindow(h.root, "confirm", ["feat/alpha", ...tips]);
  expect(confirmed.exitCode, confirmed.stderr).toBe(0);
  expect((await h.git("git", ["rev-parse", "refs/arc-window/confirmed/local/feat/alpha"])).stdout.trim()).toBe(ranges[0]?.tip);
}, 60_000);

it("closes the real imported hold through the source CLI while preserving every store ref", async () => {
  const h = await windowFixture();
  await importWindowFixture(h, true);
  await finishFixtureFlip(h);
  const compared = await sourceWindow(h.root, "compare", ["--branch", "feat/alpha"]);
  expect(compared.exitCode, compared.stderr).toBe(0);
  const store = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  expect(store.length).toBeGreaterThan(0);
  const closed = await sourceWindow(h.root, "close");
  expect(closed.exitCode, closed.stderr).toBe(0);
  expect(JSON.parse(closed.stdout)).toMatchObject({ operation: "close", status: "passed", findings: [] });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout).toBe("");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(store);
}, 60_000);
