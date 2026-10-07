/** Runtime and development package contracts for the concurrency library. */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../../../../..");

describe("concurrency dependency boundary", () => {
  it("keeps the line merge runtime exact and property testing development-only", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    expect(manifest.dependencies["node-diff3"]).toBe("3.2.1");
    expect(manifest.devDependencies["fast-check"]).toBeDefined();
    expect(manifest.dependencies["fast-check"]).toBeUndefined();
    const dependency = JSON.parse(readFileSync(join(packageRoot, "../../node_modules/node-diff3/package.json"), "utf8"));
    expect(dependency.license).toBe("MIT");
    expect(dependency.dependencies ?? {}).toEqual({});
  });
});
