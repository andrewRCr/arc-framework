/** Stored designs export as one-way copies without changing their authoritative records. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { exportWorkUnitSpec } from "../../../src/lib/work-unit/design-export.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";

it("writes the stored spec as a review copy without mutating the store", async () => {
  const h = createReviewHarness();
  const primary = await h.seedMeta("example");
  await h.seed(recordReferences["work-item/spec"](primary.reference.owner), "# Stored design\n");
  const cwd = await mkdtemp(join(tmpdir(), "arc-design-export-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const version = await h.store.version();
  expect(await exportWorkUnitSpec({ cwd, workUnit: "example", store: h.store, owner: primary.reference.owner,
    trackDesignDocs: "specs", exec: async () => ({ stdout: "" }) })).toEqual({
    path: ".arc/specs/example/spec-example.md", overwritten: false,
  });
  expect(await readFile(join(cwd, ".arc/specs/example/spec-example.md"), "utf8")).toBe("# Stored design\n");
  expect(await h.store.version()).toEqual(version);
});

it.each(["none", "in-repo"] as const)("exports nothing under %s", async mode => {
  const h = createReviewHarness(), primary = await h.seedMeta("example");
  await h.seed(recordReferences["work-item/spec"](primary.reference.owner), "# Stored design\n");
  const cwd = await mkdtemp(join(tmpdir(), "arc-design-disabled-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const exec = async () => ({ stdout: "" });
  const store = mode === "in-repo" ? createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec })) : h.store;
  expect(await exportWorkUnitSpec({ cwd, workUnit: "example", store, owner: primary.reference.owner,
    trackDesignDocs: mode === "none" ? "none" : "specs", exec: async () => ({ stdout: "" }) })).toBeNull();
  await expect(readFile(join(cwd, ".arc/specs/example/spec-example.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

it.each([false, true])("restores the prior copy after staging fails, existing: %s", async existing => {
  const h = createReviewHarness(), primary = await h.seedMeta("example");
  await h.seed(recordReferences["work-item/spec"](primary.reference.owner), "# Stored design\n");
  const cwd = await mkdtemp(join(tmpdir(), "arc-design-retry-")), folder = join(cwd, ".arc/specs/example");
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const path = join(folder, "spec-example.md");
  if (existing) { await mkdir(folder, { recursive: true }); await writeFile(path, "# Local copy\n"); }
  const input = { cwd, workUnit: "example", store: h.store, owner: primary.reference.owner, trackDesignDocs: "specs" };
  await expect(exportWorkUnitSpec({ ...input, exec: async () => { throw new Error("Git index unavailable"); } }))
    .rejects.toThrow("Git index unavailable");
  if (existing) expect(await readFile(path, "utf8")).toBe("# Local copy\n");
  else await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect(await exportWorkUnitSpec({ ...input, exec: async () => ({ stdout: "" }) })).toMatchObject({ overwritten: existing });
  expect(await readFile(path, "utf8")).toBe("# Stored design\n");
});
