/** Self-hosting freshness requires current evidence independently of output timestamps. */
import { readFile, rm, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { buildOwnedArtifacts } from "../../src/lib/build-entry.js";
import { withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";
import { DEV_BUILD_STAMP_NAME } from "../../src/lib/build-evidence.js";
import { checkDevBuildStaleness, createDevCheckDeps, hashSourceInputs } from "../../src/lib/dev-check.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";
import { readBuildQualification } from "../../src/lib/build-qualification.js";

it.each(["absent", "malformed", "old"])("refuses %s qualification despite newer output and permits repaired freshness", async (fault) => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  const cli = join(packageRoot, "dist/cli.js");
  const stamp = join(packageRoot, "dist", DEV_BUILD_STAMP_NAME);
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "freshness repair" }, async (lease) => {
      await buildOwnedArtifacts(lease, "fast");
      if (fault === "absent") await rm(stamp);
      if (fault === "malformed") await writeFile(stamp, "{broken");
      if (fault === "old") await writeFile(stamp, JSON.stringify({ schemaVersion: 1,
        inputsHash: hashSourceInputs([join(packageRoot, "src/cli.ts")], packageRoot) }));
      const newer = new Date(Date.now() + 60_000);
      await utimes(cli, newer, newer);
      expect(checkDevBuildStaleness(createDevCheckDeps(cli)).kind).toBe("stale");
      await buildOwnedArtifacts(lease, "fast");
      expect(checkDevBuildStaleness(createDevCheckDeps(cli))).toEqual({ kind: "fresh" });
      expect(await readFile(cli, "utf8")).toContain("new-native-runtime");
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it("retains runtime freshness for schema-only content and refuses edited runtime", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  const cli = join(packageRoot, "dist/cli.js");
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "selective freshness" }, async (lease) => {
      await buildOwnedArtifacts(lease, "fast");
      const schema = join(packageRoot, "src/fixture-schema.json");
      const contents: unknown = JSON.parse(await readFile(schema, "utf8"));
      await writeFile(schema, JSON.stringify({ ...(contents as Record<string, unknown>), $comment: "schema changed" }));
      expect(checkDevBuildStaleness(createDevCheckDeps(cli))).toEqual({ kind: "fresh" });
      expect(readBuildQualification(packageRoot, "runtimeSchema").status).toBe("unqualified");
      await writeFile(join(packageRoot, "src/cli.ts"), 'export const marker = "edited-runtime";');
      expect(checkDevBuildStaleness(createDevCheckDeps(cli)).kind).toBe("stale");
      await buildOwnedArtifacts(lease, "fast");
      expect(checkDevBuildStaleness(createDevCheckDeps(cli))).toEqual({ kind: "fresh" });
      expect(JSON.parse(await readFile(join(packageRoot, "dist/schemas/kernel.json"), "utf8")))
        .toHaveProperty("$comment", "schema changed");
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
