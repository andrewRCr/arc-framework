/** Freshness follows qualified evidence and producer roles without native generation. */
import { readFile, rm, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { DEV_BUILD_STAMP_NAME } from "../../src/lib/build-evidence.js";
import { checkDevBuildStaleness, createDevCheckDeps, hashSourceInputs } from "../../src/lib/dev-check.js";
import { readBuildQualification } from "../../src/lib/build-qualification.js";
import { publishStagedBuild } from "../../src/lib/build-publication.js";
import { makeStagedBuildFixture } from "../helpers/staged-build-fixture.js";

async function qualifiedFixture() {
  const fixture = makeStagedBuildFixture();
  await publishStagedBuild(fixture.lease, fixture.staged, fixture.evidence, { checkCli: async () => {} });
  return fixture;
}

it.each(["absent", "malformed", "old"])("refuses %s qualification despite newer output and accepts restored evidence", async (fault) => {
  const { root, packageRoot } = await qualifiedFixture();
  const cli = join(packageRoot, "dist/cli.js");
  const stamp = join(packageRoot, "dist", DEV_BUILD_STAMP_NAME);
  const original = await readFile(stamp, "utf8");
  try {
    if (fault === "absent") await rm(stamp);
    if (fault === "malformed") await writeFile(stamp, "{broken");
    if (fault === "old") await writeFile(stamp, JSON.stringify({ schemaVersion: 1,
      inputsHash: hashSourceInputs([join(packageRoot, "src/cli.ts")], packageRoot) }));
    const newer = new Date(Date.now() + 60_000);
    await utimes(cli, newer, newer);
    expect(checkDevBuildStaleness(createDevCheckDeps(cli)).kind).toBe("stale");
    await writeFile(stamp, original);
    expect(checkDevBuildStaleness(createDevCheckDeps(cli))).toEqual({ kind: "fresh" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("retains schema-only freshness and refuses runtime changes without generation", async () => {
  const { root, packageRoot, staged } = await qualifiedFixture();
  const cli = join(packageRoot, "dist/cli.js");
  const schema = join(root, staged.graphs.schema[0]!);
  const runtime = join(root, staged.graphs.cli[0]!);
  const originalSchema = await readFile(schema, "utf8");
  const originalRuntime = await readFile(runtime, "utf8");
  try {
    await writeFile(schema, originalSchema + "\n// schema changed\n");
    expect(checkDevBuildStaleness(createDevCheckDeps(cli))).toEqual({ kind: "fresh" });
    expect(readBuildQualification(packageRoot, "runtimeSchema").status).toBe("unqualified");
    await writeFile(runtime, originalRuntime + "\n// runtime changed\n");
    expect(checkDevBuildStaleness(createDevCheckDeps(cli)).kind).toBe("stale");
    await writeFile(schema, originalSchema);
    await writeFile(runtime, originalRuntime);
    expect(checkDevBuildStaleness(createDevCheckDeps(cli))).toEqual({ kind: "fresh" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
