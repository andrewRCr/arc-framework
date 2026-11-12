/** Native configuration and inherited-input capture without a TypeScript program graph. */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureBuildConfiguration } from "../../src/lib/build-configuration.js";
import { makeBuildFixture, writeBuildFixtureFile } from "../helpers/build-fixture.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("native configuration controls", () => {
  it("captures inherited contents and a changed extends target", () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    writeBuildFixtureFile(join(root, "base.json"), '{"compilerOptions":{"strict":true}}');
    writeBuildFixtureFile(join(root, "other.json"), '{"compilerOptions":{"strict":false}}');
    writeBuildFixtureFile(join(packageRoot, "src/entry.ts"), "export {};\n");
    writeBuildFixtureFile(join(packageRoot, "tsconfig.json"), '{"extends":"../../base.json","include":["src"]}');
    const initial = captureBuildConfiguration(packageRoot);
    expect(initial["base.json"]).toMatch(/^[a-f0-9]{64}$/u);
    writeBuildFixtureFile(join(root, "base.json"), '{"compilerOptions":{"strict":false}}');
    expect(captureBuildConfiguration(packageRoot)["base.json"]).not.toBe(initial["base.json"]);
    writeBuildFixtureFile(join(packageRoot, "tsconfig.json"), '{"extends":"../../other.json","include":["src"]}');
    const changed = captureBuildConfiguration(packageRoot);
    expect(changed["other.json"]).toMatch(/^[a-f0-9]{64}$/u);
    expect(changed).not.toHaveProperty("base.json");
  });
});
