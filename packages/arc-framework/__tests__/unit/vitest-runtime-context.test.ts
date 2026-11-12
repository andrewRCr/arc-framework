/** Own-key evidence routing refuses invalid values without preparation or fallback. */
import { randomUUID } from "node:crypto";
import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, type ProvidedContext } from "vitest";
import { ensureTestRuntime, PREPARED_RUNTIME_BUILD_KEY } from "../../src/lib/build-runtime-setup.js";
import { publishStagedBuild } from "../../src/lib/build-publication.js";
import { makeStagedBuildFixture } from "../helpers/staged-build-fixture.js";

it.each(["undefined", "null", "missing fields", "mismatched"])(
  "refuses present %s evidence without replacing qualified output", async (fault) => {
    const fixture = makeStagedBuildFixture();
    try {
      await publishStagedBuild(fixture.lease, fixture.staged, fixture.evidence, { checkCli: async () => {} });
      const stamp = join(fixture.packageRoot, "dist/dev-build-stamp.json");
      const previous = await readFile(stamp, "utf8");
      const value = fault === "undefined" ? undefined : fault === "null" ? null : fault === "missing fields" ? {}
        : { ...fixture.evidence, generation: randomUUID() };
      const provided = { [PREPARED_RUNTIME_BUILD_KEY]: value } as unknown as Partial<ProvidedContext>;
      await expect(ensureTestRuntime(fixture.packageRoot, provided)).rejects.toThrow(fault === "mismatched"
        ? "does not match" : "evidence is malformed");
      expect(await readFile(stamp, "utf8")).toBe(previous);
      for (const file of [".arc-build.lock", ".config-loads"]) {
        await expect(access(join(fixture.packageRoot, file))).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });
