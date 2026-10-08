/** Prebuilt preparation decides artifact faults and repaired reuse without native generation. */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ensureOwnedRuntimeArtifacts } from "../../src/lib/build-entry.js";
import { publishStagedBuild } from "../../src/lib/build-publication.js";
import { DEV_BUILD_STAMP_NAME } from "../../src/lib/build-evidence.js";
import { readBuildQualification } from "../../src/lib/build-qualification.js";
import { makeStagedBuildFixture } from "../helpers/staged-build-fixture.js";

async function qualifiedFixture(mode: "fast" | "full" = "fast") {
  const fixture = makeStagedBuildFixture(mode);
  await publishStagedBuild(fixture.lease, fixture.staged, fixture.evidence, { checkCli: async () => {} });
  return fixture;
}

it("qualifies runtime and metafile output without a bundled document", async () => {
  const { root, packageRoot, staged, evidence } = makeStagedBuildFixture();
  try {
    await cp(staged.directory, join(packageRoot, "dist"), { recursive: true });
    await rm(join(packageRoot, "dist/schemas"), { recursive: true, force: true });
    await writeFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), JSON.stringify(evidence));
    expect(readBuildQualification(packageRoot, "runtimeMetafile")).toEqual({ status: "qualified", evidence });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("reuses qualified prebuilt output without requesting generation", async () => {
  const { root, lease, evidence } = await qualifiedFixture("full");
  try {
    expect(await ensureOwnedRuntimeArtifacts(lease, { ARC_E2E_SKIP_BUILD: "1" })).toEqual(evidence);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each(["missing CLI", "old evidence", "edited runtime"])(
  "refuses %s with generation disabled and reuses repaired output", async (fault) => {
    const { root, packageRoot, lease, evidence } = await qualifiedFixture();
    const stamp = join(packageRoot, "dist", DEV_BUILD_STAMP_NAME);
    const file = join(packageRoot, fault === "missing CLI" ? "dist/cli.js"
      : fault === "old evidence" ? `dist/${DEV_BUILD_STAMP_NAME}` : "src/cli.ts");
    const original = await readFile(file, "utf8");
    try {
      if (fault.startsWith("missing")) await rm(file);
      else if (fault === "old evidence") await writeFile(file, JSON.stringify({ ...evidence, schemaVersion: 1 }));
      else await writeFile(file, original + "\n// edited runtime\n");
      const refusedStamp = await readFile(stamp, "utf8");
      expect(readBuildQualification(packageRoot, "runtimeMetafile").status).toBe("unqualified");
      await expect(ensureOwnedRuntimeArtifacts(lease, { ARC_E2E_SKIP_BUILD: "1" }))
        .rejects.toThrow("Generation is disabled by ARC_E2E_SKIP_BUILD=1");
      expect(await readFile(stamp, "utf8")).toBe(refusedStamp);
      await writeFile(file, original);
      expect(await ensureOwnedRuntimeArtifacts(lease, { ARC_E2E_SKIP_BUILD: "1" })).toEqual(evidence);
    } finally { await rm(root, { recursive: true, force: true }); }
  },
);

it.each(["missing", "empty", "directory"])("refuses %s metadata and reuses repaired prebuilt output", async (fault) => {
  const { root, packageRoot, lease, evidence } = await qualifiedFixture("full");
  const metafile = join(packageRoot, "dist/metafile-esm.json");
  const original = await readFile(metafile, "utf8");
  try {
    if (fault === "empty") await writeFile(metafile, "");
    else {
      await rm(metafile);
      if (fault === "directory") await mkdir(metafile);
    }
    expect(readBuildQualification(packageRoot, "runtime").status).toBe("qualified");
    expect(readBuildQualification(packageRoot, "runtimeMetafile").status).toBe("unqualified");
    expect(readBuildQualification(packageRoot, "full").status).toBe("unqualified");
    await expect(ensureOwnedRuntimeArtifacts(lease, { ARC_E2E_SKIP_BUILD: "1" })).rejects.toThrow("metafile-esm.json");
    expect(JSON.parse(await readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
    if (fault === "directory") await rm(metafile, { recursive: true });
    await writeFile(metafile, original);
    expect(await ensureOwnedRuntimeArtifacts(lease, { ARC_E2E_SKIP_BUILD: "1" })).toEqual(evidence);
  } finally { await rm(root, { recursive: true, force: true }); }
});
