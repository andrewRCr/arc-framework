/** Prebuilt CI refusals preserve output until an authorized local preflight repairs it. */
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runBuildCommand } from "../../src/lib/build-command.js";
import { readBuildQualification } from "../../src/lib/build-qualification.js";
import { downloadCiBuild, isolateCiInstallation, runCiPreflight } from "../helpers/ci-build-fixture.js";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

let producer: Awaited<ReturnType<typeof makeVitestRuntimeFixture>>;
beforeAll(async () => {
  producer = await makeVitestRuntimeFixture();
  await runBuildCommand(producer.packageRoot, ["fast"]);
}, 30_000);
afterAll(async () => { await rm(producer.root, { recursive: true, force: true }); });
const skip = { CI: "1", ARC_E2E_SKIP_BUILD: "1" };

it.each(["missing CLI", "malformed evidence", "CLI input", "schema input", "manifest", "installation metadata"])(
  "qualification refuses %s without generating or mutating transferred output", async (fault) => {
    const consumer = await downloadCiBuild(producer.packageRoot, "integration");
    try {
      const installation = await isolateCiInstallation(consumer.root);
      expect(readBuildQualification(consumer.packageRoot, "runtimeMetafile").status).toBe("qualified");
      if (fault === "missing CLI") await rm(join(consumer.packageRoot, "dist/cli.js"));
      if (fault === "malformed evidence") await writeFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "broken");
      if (fault === "CLI input" || fault === "schema input") {
        const input = join(consumer.packageRoot, fault === "CLI input" ? "src/cli.ts" : "src/fixture-schema.json");
        await writeFile(input, await readFile(input, "utf8") + "\n");
      }
      if (fault === "manifest") {
        const file = join(consumer.root, "package.json");
        await writeFile(file, await readFile(file, "utf8") + "\n");
      }
      if (fault === "installation metadata") await writeFile(installation.file, installation.original + "\n");
      const stamp = await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8");
      const refused = readBuildQualification(consumer.packageRoot, "runtimeMetafile");
      expect(refused).toMatchObject({ status: "unqualified", reason: expect.any(String) });
      expect(await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8")).toBe(stamp);
      await expect(readFile(join(consumer.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(consumer.root, { recursive: true, force: true }); }
  }, 60_000,
);

it.each(["missing", "malformed", "empty"])("qualification requires installation repair for %s npm evidence", async (fault) => {
  const consumer = await downloadCiBuild(producer.packageRoot, "integration");
  try {
    const installation = await isolateCiInstallation(consumer.root);
    if (fault === "missing") await rm(installation.file);
    else await writeFile(installation.file, fault === "malformed" ? "broken" : '{"lockfileVersion":3,"packages":{}}');
    const stamp = await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8");
    const refused = readBuildQualification(consumer.packageRoot, "runtimeMetafile");
    expect(refused).toMatchObject({ status: "unqualified" });
    if (refused.status !== "unqualified") throw new Error("Invalid installation unexpectedly qualified");
    expect(refused.reason).toContain("npm ci");
    expect(await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8")).toBe(stamp);
    await expect(readFile(join(consumer.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(installation.file, installation.original);
    expect(readBuildQualification(consumer.packageRoot, "runtimeMetafile").status).toBe("qualified");
  } finally { await rm(consumer.root, { recursive: true, force: true }); }
}, 60_000);

it.each(["missing CLI"])(
  "refuses %s without generation and resumes after local preflight", async (fault) => {
    const consumer = await downloadCiBuild(producer.packageRoot, "integration");
    try {
      const installation = await isolateCiInstallation(consumer.root);
      expect(readBuildQualification(consumer.packageRoot, "runtimeMetafile").status).toBe("qualified");
      if (fault === "missing CLI") await rm(join(consumer.packageRoot, "dist/cli.js"));
      if (fault === "malformed evidence") await writeFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "broken");
      if (fault === "CLI input" || fault === "schema input") {
        const input = join(consumer.packageRoot, fault === "CLI input" ? "src/cli.ts" : "src/fixture-schema.json");
        await writeFile(input, await readFile(input, "utf8") + "\n");
      }
      if (fault === "manifest") {
        const file = join(consumer.root, "package.json");
        await writeFile(file, await readFile(file, "utf8") + "\n");
      }
      if (fault === "installation metadata") await writeFile(installation.file, installation.original + "\n");
      const stamp = await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8");
      const refused = await runVitestControllerFixture(consumer.packageRoot, ["integration"], skip);
      expect(refused.code, refused.stderr).toBe(1);
      expect(refused.stderr).toContain("ARC_E2E_SKIP_BUILD=1");
      expect(refused.stderr).toContain("download matching qualified build artifacts");
      expect(await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8")).toBe(stamp);
      await expect(readFile(join(consumer.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
      const prepared = await runCiPreflight(consumer, "integration");
      expect(prepared.code, prepared.stderr).toBe(0);
      const qualification = readBuildQualification(consumer.packageRoot, "runtimeMetafile");
      expect(qualification.status).toBe("qualified");
      const loads = await readFile(join(consumer.packageRoot, ".config-loads"), "utf8");
      const repaired = await runVitestControllerFixture(consumer.packageRoot, ["integration"], skip);
      expect(repaired.code, repaired.stderr).toBe(0);
      expect(await readFile(join(consumer.packageRoot, ".config-loads"), "utf8")).toBe(loads);
      expect(readBuildQualification(consumer.packageRoot, "runtimeMetafile")).toEqual(qualification);
    } finally { await rm(consumer.root, { recursive: true, force: true }); }
  }, 60_000,
);

it.each(["missing"])("requires installation repair for %s npm evidence before preflight can resume", async (fault) => {
  const consumer = await downloadCiBuild(producer.packageRoot, "integration");
  try {
    const installation = await isolateCiInstallation(consumer.root);
    if (fault === "missing") await rm(installation.file);
    else await writeFile(installation.file, fault === "malformed" ? "broken" : '{"lockfileVersion":3,"packages":{}}');
    const stamp = await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8");
    const refused = await runVitestControllerFixture(consumer.packageRoot, ["integration"], skip);
    expect(refused.code, refused.stderr).toBe(1);
    expect(refused.stderr).toContain("npm ci");
    const preflight = await runCiPreflight(consumer, "integration");
    expect(preflight.code, preflight.stderr).toBe(1);
    expect(preflight.stderr).toContain("Build installation evidence unavailable");
    expect(preflight.stderr).toContain("npm ci");
    expect(await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8")).toBe(stamp);
    await expect(readFile(join(consumer.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(installation.file, installation.original);
    const prepared = await runCiPreflight(consumer, "integration");
    expect(prepared.code, prepared.stderr).toBe(0);
    const repaired = await runVitestControllerFixture(consumer.packageRoot, ["integration"], skip);
    expect(repaired.code, repaired.stderr).toBe(0);
    expect(await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8")).toBe(stamp);
    await expect(readFile(join(consumer.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(consumer.root, { recursive: true, force: true }); }
}, 60_000);

it.skipIf(process.env.ARC_TEST_ALTERNATE_NODE === undefined)("repairs a real producer Node mismatch in the consuming runtime", async () => {
  const alternate = process.env.ARC_TEST_ALTERNATE_NODE;
  if (alternate === undefined) throw new Error("Provide an alternate supported Node executable");
  const other = await makeVitestRuntimeFixture();
  let consumer: Awaited<ReturnType<typeof makeVitestRuntimeFixture>> | undefined;
  try {
    const execute = promisify(execFile);
    const version = await execute(alternate, ["--version"]);
    expect(version.stdout.trim()).not.toBe(process.version);
    await execute(alternate, ["--import", "tsx", "src/scripts/run-build.ts", "fast"],
      { cwd: other.packageRoot, env: { ...process.env, ARC_E2E_SKIP_BUILD: "" }, timeout: 30_000 });
    consumer = await downloadCiBuild(other.packageRoot, "integration");
    const original = await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8");
    const refused = await runVitestControllerFixture(consumer.packageRoot, ["integration"], skip);
    expect(refused.code, refused.stderr).toBe(1);
    expect(refused.stderr).toContain("Build input identity does not match");
    expect(await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8")).toBe(original);
    const prepared = await runCiPreflight(consumer, "integration");
    expect(prepared.code, prepared.stderr).toBe(0);
    const loads = await readFile(join(consumer.packageRoot, ".config-loads"), "utf8");
    const repaired = await runVitestControllerFixture(consumer.packageRoot, ["integration"], skip);
    expect(repaired.code, repaired.stderr).toBe(0);
    expect(await readFile(join(consumer.packageRoot, ".config-loads"), "utf8")).toBe(loads);
    expect(await readFile(join(consumer.packageRoot, "dist/dev-build-stamp.json"), "utf8")).not.toBe(original);
  } finally {
    if (consumer !== undefined) await rm(consumer.root, { recursive: true, force: true });
    await rm(other.root, { recursive: true, force: true });
  }
}, 60_000);
