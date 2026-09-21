import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PRODUCTION_SCHEMA_IDS } from "../helpers/schema-artifact.js";

const packageRoot = resolve(import.meta.dirname, "../..");
const artifactPath = resolve(packageRoot, "dist/schemas/kernel.json");

describe("production schema artifact", () => {
  it("contains the complete composed schema family from the production build", () => {
    const bundle = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      schemas: Record<string, { $id?: string }>;
    };

    expect(Object.keys(bundle.schemas)).toEqual(PRODUCTION_SCHEMA_IDS);
    for (const [id, schema] of Object.entries(bundle.schemas)) {
      expect(schema.$id).toBe(`${id}.schema.json`);
    }
  });

  it("includes the generated schema bundle in the publishable package", () => {
    const packageState = mkdtempSync(join(tmpdir(), "arc-schema-package-state-"));
    const isolatedHome = join(packageState, "home");
    const isolatedCache = join(packageState, "npm-cache");
    mkdirSync(isolatedHome);
    try {
      const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
        cwd: packageRoot,
        encoding: "utf8",
        env: { ...process.env, HOME: isolatedHome, npm_config_cache: isolatedCache },
      });
      const report = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;

      expect(report[0]?.files.map(({ path }) => path)).toContain("dist/schemas/kernel.json");
      expect(existsSync(join(isolatedHome, ".npm"))).toBe(false);
      expect(existsSync(isolatedCache)).toBe(true);
    } finally {
      rmSync(packageState, { recursive: true, force: true });
    }
  });
});
