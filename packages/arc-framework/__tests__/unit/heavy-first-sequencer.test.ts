import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import type { TestSpecification, Vitest } from "vitest/node";

import {
  HEAVY_FIRST_FILES,
  HeavyFirstSequencer,
  promoteHeavyFirst,
} from "../helpers/heavy-first-sequencer.js";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

interface Entry {
  readonly project: string;
  readonly file: string;
}

const identify = (entry: Entry): Entry => entry;

describe("promoteHeavyFirst", () => {
  it("moves listed files to the front of their project's run in list order", () => {
    const ordered: Entry[] = [
      { project: "e2e", file: "large.e2e.test.ts" },
      { project: "e2e", file: "slow-b.e2e.test.ts" },
      { project: "e2e", file: "medium.e2e.test.ts" },
      { project: "e2e", file: "slow-a.e2e.test.ts" },
    ];

    expect(promoteHeavyFirst(ordered, ["slow-a.e2e.test.ts", "slow-b.e2e.test.ts"], identify)).toEqual([
      { project: "e2e", file: "slow-a.e2e.test.ts" },
      { project: "e2e", file: "slow-b.e2e.test.ts" },
      { project: "e2e", file: "large.e2e.test.ts" },
      { project: "e2e", file: "medium.e2e.test.ts" },
    ]);
  });

  it("never moves a file across a project boundary", () => {
    const ordered: Entry[] = [
      { project: "e2e", file: "large.e2e.test.ts" },
      { project: "integration", file: "large.test.ts" },
      { project: "integration", file: "slow.test.ts" },
      { project: "unit", file: "small.test.ts" },
    ];

    expect(promoteHeavyFirst(ordered, ["slow.test.ts"], identify)).toEqual([
      { project: "e2e", file: "large.e2e.test.ts" },
      { project: "integration", file: "slow.test.ts" },
      { project: "integration", file: "large.test.ts" },
      { project: "unit", file: "small.test.ts" },
    ]);
  });

  it("keeps base order when no listed file is in the run", () => {
    const ordered: Entry[] = [
      { project: "unit", file: "b.test.ts" },
      { project: "unit", file: "a.test.ts" },
    ];

    expect(promoteHeavyFirst(ordered, HEAVY_FIRST_FILES, identify)).toEqual(ordered);
  });
});

describe("HeavyFirstSequencer", () => {
  it("starts a slow small file ahead of larger files when no results cache exists", async () => {
    const sizes = new Map([
      ["e2e:__tests__/e2e/large.e2e.test.ts", 9_000],
      ["e2e:__tests__/e2e/medium.e2e.test.ts", 5_000],
      ["e2e:__tests__/e2e/candidate-lineage.e2e.test.ts", 1_000],
    ]);
    const context = {
      config: { root: packageRoot },
      cache: {
        getFileTestResults: () => undefined,
        getFileStats: (key: string) => {
          const size = sizes.get(key);
          return size === undefined ? undefined : { size };
        },
      },
    } as unknown as Vitest;
    const project = { name: "e2e", config: { isolate: true, sequence: { groupOrder: 0 } } };
    const specification = (file: string): TestSpecification =>
      ({ project, moduleId: join(packageRoot, file) }) as unknown as TestSpecification;

    const sorted = await new HeavyFirstSequencer(context).sort([
      specification("__tests__/e2e/medium.e2e.test.ts"),
      specification("__tests__/e2e/candidate-lineage.e2e.test.ts"),
      specification("__tests__/e2e/large.e2e.test.ts"),
    ]);

    expect(sorted.map(({ moduleId }) => moduleId)).toEqual([
      join(packageRoot, "__tests__/e2e/candidate-lineage.e2e.test.ts"),
      join(packageRoot, "__tests__/e2e/large.e2e.test.ts"),
      join(packageRoot, "__tests__/e2e/medium.e2e.test.ts"),
    ]);
  });

  it("lists only files that exist", () => {
    for (const file of HEAVY_FIRST_FILES) expect(existsSync(join(packageRoot, file)), file).toBe(true);
  });
});
