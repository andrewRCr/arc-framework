/** Native enforcement of the source complexity limit under the actual lint configuration. */

import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: packageRoot, overrideConfig: [tseslint.configs.disableTypeChecked] });
const complexityRules = ["complexity", "sonarjs/cognitive-complexity"];
const moduleDoc = "/** Reads fixture values. */\n\n";

const guards = Array.from({ length: 20 }, (_, index) => `value.f${index} === undefined`).join(" || ");
const flatGuardChain = `${moduleDoc}/** Accepts a record only when every field is present. */
export function complete(value: Record<string, unknown>): boolean {
  if (${guards}) return false;
  return true;
}
`;
const nestedBranches = `${moduleDoc}/** Totals the cells by a nested rule. */
export function total(rows: number[][]): number {
  let sum = 0;
  for (const row of rows) {
    for (const cell of row) {
      if (cell > 0) {
        if (cell % 2 === 0) {
          sum += cell > 100 ? 2 : 1;
        } else if (cell % 3 === 0) {
          sum -= cell;
        } else {
          sum += 1;
        }
      } else if (cell < -10) {
        sum -= 1;
      }
    }
  }
  return sum;
}
`;

async function complexityFindings(path: string, text: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(text, { filePath: resolve(packageRoot, path) });
  return (result?.messages ?? []).filter(({ ruleId }) => complexityRules.includes(ruleId ?? "")).map(({ ruleId }) => ruleId);
}

describe("source complexity enforcement", () => {
  it("accepts a long flat guard chain that reads as one condition", async () => {
    expect(await complexityFindings("src/lib/complexity-fixture.ts", flatGuardChain)).toEqual([]);
  });

  it("rejects nested branching whose nesting makes it hard to follow", async () => {
    expect(await complexityFindings("src/lib/complexity-fixture.ts", nestedBranches))
      .toEqual(["sonarjs/cognitive-complexity"]);
  });

  it("leaves test files to the file-length limit", async () => {
    expect(await complexityFindings("__tests__/unit/complexity-fixture.test.ts", nestedBranches)).toEqual([]);
  });
});
