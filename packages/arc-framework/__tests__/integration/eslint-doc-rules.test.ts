/** Native enforcement of the exported-surface doc rules under the actual lint configuration. */

import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: packageRoot, overrideConfig: [tseslint.configs.disableTypeChecked] });
const docRules = ["jsdoc/require-jsdoc", "arc/module-doc-comment"];
const sourcePath = "src/lib/doc-fixture.ts";
const moduleDoc = "/** Reads fixture values. */\n\n";

async function docFindings(path: string, text: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(text, { filePath: resolve(packageRoot, path) });
  return (result?.messages ?? []).filter(({ ruleId }) => docRules.includes(ruleId ?? "")).map(({ ruleId }) => ruleId);
}

describe("exported-surface doc enforcement", () => {
  it.each([
    ["an exported function declaration", "export function read(): number { return 1; }\n"],
    ["an exported arrow function", "export const read = (): number => 1;\n"],
    ["an exported function expression", "export const read = function (): number { return 1; };\n"],
    ["a default-exported function", "export default function (): number { return 1; }\n"],
    ["a function exported by name", "function read(): number { return 1; }\nexport { read };\n"],
  ])("requires a doc block on %s", async (_name, text) => {
    expect(await docFindings(sourcePath, moduleDoc + text)).toEqual(["jsdoc/require-jsdoc"]);
  });

  it("accepts a documented export that carries no parameter or return tags", async () => {
    const text = `${moduleDoc}/** Reads the value. */\nexport function read(input: number): number { return input; }\n`;
    expect(await docFindings(sourcePath, text)).toEqual([]);
  });

  it("leaves module-private functions to the author", async () => {
    const text = `${moduleDoc}function read(): number { return 1; }\nexport const value = read();\n`;
    expect(await docFindings(sourcePath, text)).toEqual([]);
  });

  it("requires a file-level doc comment on a source module", async () => {
    expect(await docFindings(sourcePath, "export const value = 1;\n")).toEqual(["arc/module-doc-comment"]);
  });

  it("applies neither rule outside the source tree", async () => {
    const text = "export function read(): number { return 1; }\n";
    expect(await docFindings("__tests__/unit/doc-fixture.test.ts", text)).toEqual([]);
  });
});
