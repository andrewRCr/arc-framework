/** Empty import cleanup keeps its ref discovery within the original two-stage process budget. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { keptPrefix } from "../helpers/store/import-transients.js";

const journal = "refs/arc/tmp/migrate/import-required";

it.each(["default", "separate"] as const)("reuses each cleanup inventory without extra journal discovery in %s", async layout => {
  const h = await importFixture(layout);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
  const state = async () => (await h.git("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const before = await state();
  expect(before).toContain("refs/arc/work/");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix, journal])).stdout).toBe("");
  const exec = h.ports.exec;
  let cleanupProcesses = 0;
  h.ports.exec = async (command, args, options) => {
    if (args.includes("for-each-ref") && args.some(arg => arg === keptPrefix || arg === journal)) cleanupProcesses++;
    return exec(command, args, options);
  };
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(await state()).toBe(before);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", keptPrefix, journal])).stdout).toBe("");
  expect(cleanupProcesses).toBe(2);
}, 60_000);
