/** Native lint coverage for completed Git failure proofs in the ref backend. */

import { resolve } from "node:path";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { refCompletedFailureRule } from "../../eslint/ref-completed-failure.js";

const packageRoot = resolve(import.meta.dirname, "../..");
const fixturePath = resolve(packageRoot, "src/lib/store/ref/fixture.ts");
const ruleId = "arc/ref-completed-failure";
const engine = new ESLint({
  cwd: packageRoot,
  overrideConfigFile: true,
  overrideConfig: [{
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { globalReturn: true } } },
    plugins: { arc: { rules: { "ref-completed-failure": refCompletedFailureRule } } },
    rules: { [ruleId]: "error" },
  }],
});

async function lint(source: string): Promise<ESLint.LintResult> {
  const [result] = await engine.lintText(source, { filePath: fixturePath });
  if (result === undefined) throw new Error("Expected the fixture to be linted");
  expect(result.fatalErrorCount).toBe(0);
  return result;
}

const canonicalImport = 'import { isCompletedGitFailure } from "../../git/process-error.js";\n';

const safe = [
  'const code = error.exitCode; if (isCompletedGitFailure(error) && code === 1) return null;',
  'const { exitCode: code } = error; if (!isCompletedGitFailure(error)) throw error; if (code === 1) return null;',
  'const code = error.exitCode; throw new Error(String(code));',
  'const { exitCode: code } = error; return { status: "failed", exitCode: code };',
  'const code = error.exitCode; { const code = 2; if (code === 1) return null; }',

  'throw new Error(String(error.exitCode));',
  'return { status: "failed", exitCode: error.exitCode };',
  'if (isCompletedGitFailure(error) && error.exitCode === 1) return "";',
  'if (!isCompletedGitFailure(error) || error.exitCode !== 5) throw error;',
  'if (!isCompletedGitFailure(error)) throw error; if (error.exitCode === 1) return null;',
  'if (!isCompletedGitFailure(error)) { throw error; } return error.exitCode === 1;',
  'function complete(e: unknown) { return isCompletedGitFailure(e); } if (complete(error) && error.exitCode === 1) return false;',
  'function complete(e: unknown) { return isCompletedGitFailure(e); } function done(x: unknown) { return complete(x); } if (done(error) && error.exitCode === 1) return false;',
  'import { isCompletedGitFailure as done } from "../../git/process-error.js"; if (done(error) && error["exitCode"] === 1) return null;',
  'return isCompletedGitFailure(error) && error.exitCode === 1;',
  'return isCompletedGitFailure(error) && error.exitCode === 1 ? null : fail(error);',
  'promise.catch(({ stderr }) => stderr === "" ? null : fail());',
  'promise.catch((caught) => isCompletedGitFailure(caught) && caught.exitCode === 1 ? null : fail(caught));',
];
const unsafe = [
  'const code = error.exitCode; if (code === 1) return null;',
  'const { exitCode: code } = error; if (code === 1) return null;',
  'const { exitCode } = error; if (exitCode === 1) return null;',
  'const code = error.exitCode; if (isCompletedGitFailure(other) && code === 1) return null;',

  'if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return "";',
  'if (!isGitProcessError(error) || error.kind !== "nonzero-exit" || error.exitCode !== 5) throw error;',
  '// isCompletedGitFailure(error)\nif (error.exitCode === 1) return false;',
  'if (isCompletedGitFailure(other) && error.exitCode === 1) return null;',
  'if (isCompletedGitFailure(error) || error.exitCode === 1) return null;',
  'if (flag) isCompletedGitFailure(error); if (error.exitCode === 1) return null;',
  'if (error.exitCode === 1) { isCompletedGitFailure(error); return null; }',
  'function complete(e: unknown) { return isCompletedGitFailure(other); } if (complete(error) && error.exitCode === 1) return false;',
  'function complete(e: unknown) { return complete(e); } if (complete(error) && error.exitCode === 1) return false;',
  'if (!isCompletedGitFailure(error) && error.exitCode !== 5) throw error;',
  'if (error["exitCode"] === 1) return null;',
  'try { run(); } catch ({ exitCode }) { if (exitCode === 1) return null; }',
  'promise.catch(({ exitCode }) => exitCode === 1 ? null : fail());',
  'promise.catch(({ exitCode: code }) => { if (code === 1) return null; });',
];

const untrusted = [
  'if (isCompletedGitFailure(error) && error.exitCode === 1) return null;',
  'function isCompletedGitFailure(e: unknown) { return true; } if (isCompletedGitFailure(error) && error.exitCode === 1) return null;',
  'import { isCompletedGitFailure } from "../../fake/git/process-error.js"; if (isCompletedGitFailure(error) && error.exitCode === 1) return null;',
  canonicalImport + 'function classify(isCompletedGitFailure: (e: unknown) => boolean) { if (isCompletedGitFailure(error) && error.exitCode === 1) return null; }',
  canonicalImport + 'function classify() { const isCompletedGitFailure = () => true; if (isCompletedGitFailure(error) && error.exitCode === 1) return null; }',
  canonicalImport + 'try { run(); } catch ({ isCompletedGitFailure }) { if (isCompletedGitFailure(error) && error.exitCode === 1) return null; }',
  canonicalImport + 'function classify([isCompletedGitFailure]: Array<(e: unknown) => boolean>) { if (isCompletedGitFailure(error) && error.exitCode === 1) return null; }',
  canonicalImport + 'function complete(e: unknown) { return isCompletedGitFailure(e); } function classify() { const complete = (e: unknown) => true; if (complete(error) && error.exitCode === 1) return null; }',
  canonicalImport + 'function complete(e: unknown) { return isCompletedGitFailure(e); } function classify({ complete }: Checks) { if (complete(error) && error.exitCode === 1) return null; }',
];

describe("completed Git failure lint fixtures", () => {
  it.each(untrusted)("rejects untrusted or shadowed completion: %s", async (source) => {
    const result = await lint(source);
    expect(result.messages).toMatchObject([{ ruleId, messageId: "unguarded", severity: 2 }]);
    expect(result.messages).toHaveLength(1);
  });
  it.each(safe)("accepts proven completion: %s", async (source) => {
    expect((await lint(canonicalImport + source)).messages).toEqual([]);
  });
  it.each(unsafe)("rejects incomplete completion: %s", async (source) => {
    const result = await lint(canonicalImport + source);
    expect(result.messages).toMatchObject([{ ruleId, messageId: "unguarded", severity: 2 }]);
    expect(result.messages).toHaveLength(1);
  });
  it("reports the unguarded exit-code operand at its source location", async () => {
    expect((await lint(canonicalImport + "if (error.exitCode === 1) return null;")).messages).toMatchObject([{
      ruleId, messageId: "unguarded", line: 2, column: 5, endLine: 2, endColumn: 19,
    }]);
  });
});

const configured = new ESLint({ cwd: packageRoot });
it.each([
  ["src/lib/store/ref/effective-transport.ts", 2],
  ["src/lib/store/ref/import/branch-tip.ts", 2],
  ["src/lib/store/ref/example.d.ts", 2],
  ["src/lib/store/in-repo/meta.ts", undefined],
  ["src/lib/git/process-error.ts", undefined],
  ["__tests__/unit/eslint-ref-completed-failure.test.ts", undefined],
  ["src/lib/store/ref/example.tsx", undefined],
  ["src/lib/store/ref/example.mts", undefined],
  ["src/lib/store/ref/example.cts", undefined],
] as const)("configures the completion guard for %s", async (filename, severity) => {
  const config: unknown = await configured.calculateConfigForFile(resolve(packageRoot, filename));
  if (severity === undefined) expect(config).not.toHaveProperty(["rules", ruleId]);
  else expect(config).toHaveProperty(["rules", ruleId], [severity]);
});
