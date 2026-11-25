/** Public declarations hide the third-party merge implementation. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("exports text and contract types without exposing the dependency's types", () => {
  const path = resolve(import.meta.dirname,"../../../../../src/lib/store/concurrency/line-merge.ts");
  const emitted = ts.transpileDeclaration(readFileSync(path,"utf8"), {
    compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.NodeNext},fileName:path,
  });
  expect(emitted.outputText).not.toContain("node-diff3");
  expect(emitted.outputText).not.toContain("diff3Merge");
});
