/** Inject a setup failure into the nested lifecycle suite while leaving its teardown intact. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, vi } from "vitest";
import * as helpers from "./helpers.js";

const createRepo = helpers.createTempRepo;
beforeEach(() => {
  vi.spyOn(helpers, "createTempRepo").mockImplementationOnce(async (prefix) => {
    if (process.env.ARC_TEST_FAIL_REPO === "1") throw new Error("fixture repo unavailable");
    const repo = await createRepo(prefix);
    await writeFile(join(repo, ".arc-init.lock"), "held by test\n");
    return repo;
  });
});
