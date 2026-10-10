/** Freshness follows qualified evidence and producer roles without native generation. */
import { readFile, rm, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { DEV_BUILD_STAMP_NAME } from "../../src/lib/build-evidence.js";
import { checkDevBuildStaleness, createDevCheckDeps, hashSourceInputs, runDevBuildGuard } from "../../src/lib/dev-check.js";
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

function guardDiagnostics(cli: string) {
  const messages: string[] = [];
  let exitCode: number | undefined;
  const eligible = runDevBuildGuard({ commandPath: "arc base merge" }, {
    token: undefined, readHolder: () => "absent", now: () => Date.now(),
    freshness: createDevCheckDeps(cli),
    writeStderr: (message) => { messages.push(message); },
    exit: (code) => { exitCode = code; },
  });
  return { eligible, stderr: messages.join(""), exitCode };
}

it.each(["inventory", "installation", "read"])(
  "reports the concrete %s qualification failure and admits repaired evidence",
  async (fault) => {
    const { root, packageRoot } = await qualifiedFixture();
    const cli = join(packageRoot, "dist/cli.js");
    const stamp = join(packageRoot, "dist", DEV_BUILD_STAMP_NAME);
    const installedLock = join(root, "node_modules/.package-lock.json");
    const addedSource = join(packageRoot, "src/added.ts");
    const originalStamp = await readFile(stamp, "utf8");
    const originalLock = await readFile(installedLock, "utf8");
    try {
      if (fault === "inventory") await writeFile(addedSource, "export {};\n");
      if (fault === "installation") {
        await writeFile(installedLock, JSON.stringify({ lockfileVersion: 3, packages: {} }));
      }
      if (fault === "read") await rm(stamp);
      const refused = guardDiagnostics(cli);
      expect(refused.eligible).toBe(false);
      expect(refused.exitCode).toBe(1);
      expect(refused.stderr).toContain("error: arc dev build is stale (");
      expect(refused.stderr).toContain(
        "Refusing `arc base merge` against stale dist; run `npm run build:fast`, then retry.",
      );
      if (fault === "inventory") expect(refused.stderr).toContain("Build input identity does not match.");
      if (fault === "installation") {
        expect(refused.stderr).toContain("Build installation evidence unavailable:");
        expect(refused.stderr).toContain("Missing or unusable npm installed resolution metadata");
        expect(refused.stderr).toContain("run npm ci, then npm run build:fast.");
      }
      if (fault === "read") {
        expect(refused.stderr).toContain("ENOENT");
        expect(refused.stderr).toContain(stamp);
      }
      await rm(addedSource, { force: true });
      await writeFile(installedLock, originalLock);
      await writeFile(stamp, originalStamp);
      expect(guardDiagnostics(cli)).toEqual({ eligible: true, stderr: "", exitCode: undefined });
    } finally { await rm(root, { recursive: true, force: true }); }
  },
);
