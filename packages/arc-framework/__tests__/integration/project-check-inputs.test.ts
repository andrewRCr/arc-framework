/** Project check inputs cover the JavaScript roots and compiler configuration they examine. */
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { matchTreeInputs } from "../../src/lib/checks/matching.js";
import { readTypedProjectFile } from "../../src/lib/config/typed-file-reader.js";
import { gitExec, gitExecInput } from "../../src/lib/io-context.js";

const root = resolve(import.meta.dirname, "../../../..");
const projectChecks = ["typecheck", "typecheck:test", "lint:ts"];
const checkedJavaScript = [
  "packages/arc-framework/src/lib/git/repository-environment.mjs",
  "packages/arc-framework/__tests__/benchmarks/ref-host-credential.mjs",
  "packages/arc-framework/__tests__/fixtures/checks/runner-bad-protocol.mjs",
  "packages/arc-framework/__tests__/fixtures/checks/runner-disconnect.mjs",
  "packages/arc-framework/__tests__/fixtures/checks/runner-proxy.mjs",
];
const ownInputs = new Map<string, Set<string>>();
let compilerConfigs: string[];

async function trackedMatches(inputs: readonly string[]): Promise<string[]> {
  const result = await matchTreeInputs({ git: gitExec, gitInput: gitExecInput }, root, "HEAD", inputs);
  if (result.status !== "known") throw new Error("Unable to match project check inputs");
  return result.paths.map(({ path }) => path);
}

beforeAll(async () => {
  const declaration = await readTypedProjectFile(root, "check-declaration", CheckDeclarationSchema);
  if (declaration.status !== "valid") throw new Error(`Invalid project checks: ${declaration.status}`);
  for (const id of [...projectChecks, "lint:ts:file"]) {
    const check = declaration.value.checks[id];
    if (check === undefined) throw new Error(`Missing project check: ${id}`);
    ownInputs.set(id, new Set(await trackedMatches(check.inputs)));
  }
  compilerConfigs = await trackedMatches(["packages/arc-framework/tsconfig*.json"]);
});

describe.each([...projectChecks, "lint:ts:file"])("%s JavaScript input selection", (id) => {
  it.each(checkedJavaScript)("selects %s through its own inputs", (path) => {
    expect(ownInputs.get(id)?.has(path)).toBe(true);
  });
});

it.each(projectChecks)("%s includes every compiler config through its own inputs", (id) => {
  expect(compilerConfigs).toContain("packages/arc-framework/tsconfig.shard-rest.json");
  for (const path of compilerConfigs) expect(ownInputs.get(id)?.has(path), path).toBe(true);
});

it("keeps compiler JSON files out of focused lint operands", () => {
  for (const path of compilerConfigs) expect(ownInputs.get("lint:ts:file")?.has(path), path).toBe(false);
});
