import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { CouplingIdiom, CouplingManifest } from "../../src/lib/coupling-audit/types.js";
import {
  createCouplingAuditScriptContext,
  executeCouplingAudit,
  runCouplingAuditCommand,
} from "../../src/scripts/audit-coupling-blast-radius.js";

const execute = promisify(execFile);
let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot !== undefined) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = undefined;
});

function manifest(): CouplingManifest {
  const vectorTokens: Record<CouplingIdiom, string> = {
    "path-literal": "mystery/path",
    "directory-state": "scan-directory",
    "git-tracked-path": "git-add-mystery",
    "filename-prefix": "mystery-prefix-",
    "branch-pattern": "mystery/branch",
    "config-key": "mystery.setting",
    "doc-name": "MYSTERY.md",
  };
  return {
    version: 1,
    corpus: {
      packageRoot: "packages/arc-framework",
      installedDelta: [],
      repoRootDelta: [".husky/pre-commit"],
      excluded: [],
    },
    classes: [
      {
        id: "known-path",
        key: { kind: "name", value: "known/path" },
        patterns: [{ id: "known-pattern", form: "literal", value: "known/path", caseSensitive: true }],
        citations: [{ path: "direction.md", anchor: "Known", workUnit: "path-owner" }],
        idioms: ["path-literal"],
        volatility: { rating: "unresolved", evidence: null },
      },
    ],
    catchAllVectors: Object.entries(vectorTokens).map(([idiom, token]) => ({
      id: `${idiom}-vector`,
      idiom: idiom as CouplingIdiom,
      patterns: [{ id: `${idiom}-pattern`, form: "literal", value: token, caseSensitive: true }],
      surfaceKinds: ["test", "workflow", "template", "code", "prose", "config"],
    })),
    dispositions: { exact: [], bulk: [] },
    thresholds: { test: 2, workflow: 2, template: 2, code: 2, prose: 2, config: 2 },
    sampleCaps: { codePerClass: 1, residueTotal: 1 },
  };
}

async function initializeRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "coupling-audit-"));
  tempRoot = root;
  await mkdir(join(root, "packages/arc-framework/src"), { recursive: true });
  await mkdir(join(root, ".husky"), { recursive: true });
  await writeFile(join(root, "packages/arc-framework/src/example.ts"), "known/path\nmystery.setting\n", "utf8");
  await writeFile(join(root, "packages/arc-framework/README.md"), "MYSTERY.md\n", "utf8");
  await writeFile(join(root, ".husky/pre-commit"), "mystery/path\n", "utf8");
  await writeFile(join(root, "manifest.json"), `${JSON.stringify(manifest(), null, 2)}\n`, "utf8");
  await execute("git", ["init", "--quiet"], { cwd: root });
  await execute("git", ["config", "user.name", "Audit Fixture"], { cwd: root });
  await execute("git", ["config", "user.email", "audit@example.invalid"], { cwd: root });
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
  return root;
}

describe("coupling audit repository command", () => {
  it("discovers tracked hidden files and writes identical results", async () => {
    const root = await initializeRepository();
    const context = createCouplingAuditScriptContext(root);
    await executeCouplingAudit(["--manifest", "manifest.json", "--output", "first.json"], context);
    await executeCouplingAudit(["--manifest", "manifest.json", "--output", "second.json"], context);

    const first = await readFile(join(root, "first.json"), "utf8");
    const second = await readFile(join(root, "second.json"), "utf8");
    expect(first).toBe(second);
    const result = JSON.parse(first) as { corpus: { fileCount: number }; candidates: { unresolved: Array<{ path: string }> } };
    expect(result.corpus.fileCount).toBe(3);
    expect(result.candidates.unresolved.some((candidate) => candidate.path === ".husky/pre-commit")).toBe(true);
  });

  it("maps incomplete arguments to the validation failure class", async () => {
    const root = await initializeRepository();
    const diagnostics: string[] = [];
    const context = createCouplingAuditScriptContext(root);
    context.writeStderr = (content) => diagnostics.push(content);
    await expect(runCouplingAuditCommand(["--manifest", "manifest.json"], context)).resolves.toBe(2);
    expect(diagnostics.join("")).toContain("required: --manifest <path> --output <path|->");
  });
});
