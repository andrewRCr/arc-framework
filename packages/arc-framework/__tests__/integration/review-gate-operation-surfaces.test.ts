import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SELF_HOSTING_EXECUTABLE_OPERATIONS } from "../../src/scripts/review-gate/runtime/operations.js";

const root = resolve(import.meta.dirname, "../../../..");
const scriptRoot = resolve(root, "packages/arc-framework/src/scripts/review-gate");

describe("review-gate executable operation surfaces", () => {
  it("maps every launcher and root npm command exactly once", async () => {
    const launchers = (await readdir(scriptRoot)).filter((name) => /^run-.*\.ts$/u.test(name)).sort();
    const mappedLaunchers = [...new Set(Object.values(SELF_HOSTING_EXECUTABLE_OPERATIONS)
      .map((operation) => operation.launcher))].sort();
    expect(mappedLaunchers).toEqual(launchers);
    for (const launcher of launchers) {
      const content = await readFile(resolve(scriptRoot, launcher), "utf8");
      const usedRegistryKeys = [...content.matchAll(/SELF_HOSTING_REVIEW_GATE\.([A-Za-z0-9_]+)/gu)]
        .map((match) => match[1]).sort();
      const mappedRegistryKeys = [...new Set(Object.values(SELF_HOSTING_EXECUTABLE_OPERATIONS)
        .filter((operation) => operation.launcher === launcher)
        .flatMap((operation) => operation.registryKeys))].sort();
      expect(mappedRegistryKeys).toEqual(usedRegistryKeys);
    }

    const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const reviewScripts = Object.entries(manifest.scripts).filter(([name]) => name.startsWith("review-gate:"));
    const mappedScripts = Object.values(SELF_HOSTING_EXECUTABLE_OPERATIONS)
      .flatMap((operation) => operation.npmScript === null ? [] : [operation.npmScript]);
    expect(mappedScripts.sort()).toEqual(reviewScripts.map(([name]) => name).sort());
    for (const [name, command] of reviewScripts) {
      const operation = Object.values(SELF_HOSTING_EXECUTABLE_OPERATIONS)
        .find((candidate) => candidate.npmScript === name);
      expect(operation).toBeDefined();
      expect(command).toContain(operation?.launcher ?? "<missing>");
    }
  });

  it("maps every workflow and operator command without exporting a public operation", async () => {
    const workflowNames = (await readdir(resolve(root, ".github/workflows")))
      .filter((name) => /^review-gate.*\.yml$/u.test(name));
    const workflowTexts = await Promise.all(workflowNames.map(async (name) => ({
      path: `.github/workflows/${name}`,
      content: await readFile(resolve(root, ".github/workflows", name), "utf8"),
    })));
    for (const workflow of workflowTexts) {
      const launchers = [...workflow.content.matchAll(/review-gate\/(run-[a-z-]+\.ts)(?:\s+([a-z-]+))?/gu)];
      for (const match of launchers) {
        expect(Object.values(SELF_HOSTING_EXECUTABLE_OPERATIONS).some((operation) =>
          operation.launcher === match[1]
          && operation.argvPrefix[0] === (match[2] ?? undefined)
          && operation.workflows.some((path) => path === workflow.path))).toBe(true);
      }
      for (const match of workflow.content.matchAll(/npm run (review-gate:[a-z-]+)/gu)) {
        expect(Object.values(SELF_HOSTING_EXECUTABLE_OPERATIONS).some((operation) =>
          operation.npmScript === match[1]
          && operation.workflows.some((path) => path === workflow.path))).toBe(true);
      }
    }

    const operatorDocs = [
      ".github/review-gate.md",
      ".github/review-gate-attestation.md",
      ".arc/system/workflows/project/coordinate-pr-review.md",
    ];
    for (const path of operatorDocs) {
      const content = await readFile(resolve(root, path), "utf8");
      for (const match of content.matchAll(/npm run (review-gate:[a-z-]+)/gu)) {
        expect(Object.values(SELF_HOSTING_EXECUTABLE_OPERATIONS)
          .some((operation) => operation.npmScript === match[1] && operation.operatorDocs.includes(path))).toBe(true);
      }
    }

    const cli = await readFile(resolve(root, "packages/arc-framework/src/cli.ts"), "utf8");
    expect(cli).not.toMatch(/SELF_HOSTING_EXECUTABLE_OPERATIONS|review-gate:/u);
  });
});
