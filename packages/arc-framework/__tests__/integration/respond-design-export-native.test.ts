/** Native response composition stages only the one-way stored spec copy. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createRespondDependencies } from "../../src/scripts/review-gate/runtime/respond-composition.js";

it("replaces and stages the selected stored spec, then leaves a matching replay untouched", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native, path = ".arc/specs/example/spec-example.md";
  const primary = await h.reference.seedMeta("example");
  await h.reference.seed(recordReferences["work-item/spec"](primary.reference.owner), "# Stored specification\n");
  await mkdir(join(cwd, ".arc/specs/example"), { recursive: true });
  await writeFile(join(cwd, path), "# Hand-edited review copy\n");
  let mayStage = true;
  const dependencies = createRespondDependencies({ ...h.native, workItem: primary.reference.owner,
    exec: async (command, args, options) => {
      if (!mayStage && args[0] === "add") throw new Error("A matching replay attempted to stage");
      return exec(command, args, options);
    } });
  const before = await h.reference.store.version();
  expect(await dependencies.exportCandidateDesign?.("example")).toEqual({ path, overwritten: true });
  expect((await exec("git", ["show", `:${path}`], { cwd })).stdout).toBe("# Stored specification");
  expect((await exec("git", ["diff", "--cached", "--name-only"], { cwd })).stdout).toBe(path);
  expect(await readFile(join(cwd, path), "utf8")).toBe("# Stored specification\n");
  mayStage = false;
  expect(await dependencies.exportCandidateDesign?.("example")).toBeNull();
  expect(await h.reference.store.version()).toEqual(before);
}, 30_000);
