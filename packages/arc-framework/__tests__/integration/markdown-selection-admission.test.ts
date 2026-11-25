/** Project declarations and script admission agree on literal projected path lists. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { afterEach, expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { checkResultKind, selectRequestChecks } from "../../src/lib/checks/gates.js";
import { matchPathList } from "../../src/lib/checks/path-list.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { isMarkdownPathExcluded, validateMarkdownPath } from "../../src/lib/markdown/authority.js";
import { selectMarkdownlintPaths } from "../../src/lib/markdown/lint-selection.js";
import { selectLinkAuditFiles } from "../../src/scripts/audit-links.js";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";

const repository = resolve(import.meta.dirname, "../../../..");
const roots: string[] = [];
afterEach(async () => removeGitBackedDirs(roots.splice(0)));
const fixtures = [
  [".arc/active/current/deep/[probe]*.md", "MUL"],
  ["docs/plain.md", "MU"],
  [".arc/active/current/node_modules/probe.md", "L"],
  [".arc/active/current/.venv-test/probe.md", "L"],
  [".arc/active/current/.venv-probe.md", "ML"],
  [".arc/active/current/venv/probe.md", "L"],
  [".arc/completed/probe.md", ""],
  [".arc/user/alice/WORKING-MEMORY.md", "L"],
  [".arc/user/alice/USER-INBOX.md", "L"],
  [".arc/user/alice/nested/WORKING-MEMORY.md", "UL"],
  [".arc/user/alice/nested/USER-INBOX.md", "UL"],
  [".arc/active/.hidden/temp-probe.md", "L"],
  ["arc/probe.md", ""],
  ["packages/arc-framework/__tests__/fixtures/probe.md", "M"],
  [".arc/active/current/probe.template.md", "MU"],
  [".arc/active/current/template-probe.md", "MU"],
  [".arc/active/current/NODE_MODULES/probe.md", "MUL"],
  [".arc/active/current/.VENV-probe.md", "MUL"],
  [".arc/user/alice/nested/working-memory.md", "MUL"],
  [".arc/Completed/probe.md", "MUL"],
  [".arc/active/current/probe.MD", ""],
] as const;

it("admits exactly each tool's supported operands as ungated feedback", async () => {
  const declaration = CheckDeclarationSchema.parse(load(await readFile(
    resolve(repository, ".arc/system/arc-checks.yml"), "utf8")));
  const root = await createTempRepoCore({ prefix: "arc-markdown-admission-" });
  roots.push(root);
  const git = createRawGitExec(root);
  for (const [id, tool] of [["lint:md:selection", "M"], ["lint:md:underwrap:selection", "U"],
    ["lint:arc:links:selection", "L"]] as const) {
    const check = declaration.checks[id];
    expect(check, id).toBeDefined();
    if (check === undefined) throw new Error(`Missing project feedback declaration: ${id}`);
    expect(check).toMatchObject({ mode: "selection", cache: false, widen: false, pass_paths: true });
    expect(check.gate).toBeUndefined();
    expect(checkResultKind({ kind: "increment" }, check)).toBe("feedback");
    const matched = await matchPathList({ git }, root, fixtures.map(([path]) => path), check.inputs);
    expect(matched.status).toBe("ok");
    if (matched.status !== "ok") throw new Error(matched.reason);
    expect([...matched.paths].sort(), id).toEqual(fixtures.filter(([, tools]) => tools.includes(tool))
      .map(([path]) => path).sort());
    if (tool === "M") {
      expect(await selectMarkdownlintPaths(root, matched.paths, git)).toEqual(matched.paths);
    } else if (tool === "U") {
      expect(matched.paths.filter(path => isMarkdownPathExcluded(validateMarkdownPath(path)))).toEqual([]);
    } else {
      expect(selectLinkAuditFiles(matched.paths)).toEqual(matched.paths);
    }
    for (const form of [{ kind: "gate", gate: "merge" }, { kind: "new-head", from: "HEAD" },
      { kind: "pre-commit" }] as const) {
      expect(selectRequestChecks(declaration.checks, form).map(([selected]) => selected)).not.toContain(id);
    }
  }
});
