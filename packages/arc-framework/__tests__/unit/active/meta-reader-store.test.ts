/** The active reader preserves legacy bytes while its default root delegates through operational state. */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, onTestFinished } from "vitest";
import { parseMetaFile, readActiveMetaCandidates } from "../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-current-delegate-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const root = join(cwd, ".arc/active");
  await mkdir(root, { recursive: true });
  return { cwd, root };
}

describe("active-meta store delegate", () => {
  it("excludes a symlink under an explicitly passed default root", async () => {
    const h = await fixture();
    const outside = join(h.cwd, "elsewhere.md");
    await writeFile(outside, makeMetaFixture("example"));
    await symlink(outside, join(h.root, "meta-example.md"));
    expect(await readActiveMetaCandidates(h.cwd, { rootSegments: [".arc", "active"] })).toEqual({ layout: "full", candidates: [], warnings: [] });
  });

  it.each(["[none]", "[none associated]", "—", "[TBD]"])("preserves %s fields while semantic parsing may reject Design and Depends On", async (sentinel) => {
    const h = await fixture();
    const content = makeMetaFixture("example", { branch: "feat/example" })
      .replace("`feat/example`", sentinel).replace("- **Design:** [none]", `- **Design:** ${sentinel}`)
      .replace("- **Depends On:** [none]", `- **Depends On:** ${sentinel}`)
      .replace("- **Current Workflow:** [none]", `- **Current Workflow:** ${sentinel}`)
      .replace("- **Next Task:** [none]", `- **Next Task:** ${sentinel}`)
      .replace("- **Task List:** `tasks-example.md`", `- **Task List:** ${sentinel}`);
    await writeFile(join(h.root, "meta-example.md"), content);
    const expected = { path: ".arc/active/meta-example.md", filename: "meta-example.md", ...parseMetaFile(content), integrationBoundary: null };
    expect(await readActiveMetaCandidates(h.cwd)).toEqual({ layout: "full", candidates: [expected], warnings: [] });
  });

  it("keeps lite status precedence over a full-layout meta", async () => {
    const h = await fixture();
    const content = makeMetaFixture("example");
    await writeFile(join(h.root, "status.md"), content);
    await writeFile(join(h.root, "meta-example.md"), content);
    expect(await readActiveMetaCandidates(h.cwd)).toMatchObject({ layout: "lite", candidates: [{ filename: "status.md" }] });
  });

  it("keeps the contributor root's legacy symlink scan", async () => {
    const h = await fixture();
    const content = makeMetaFixture("example");
    await writeFile(join(h.root, "meta-example.md"), content);
    const contributor = join(h.cwd, ".arc/user/andrew/active");
    await mkdir(contributor, { recursive: true });
    await symlink(join(h.root, "meta-example.md"), join(contributor, "meta-example.md"));
    expect(await readActiveMetaCandidates(h.cwd, { rootSegments: [".arc", "user", "andrew", "active"] })).toMatchObject({ layout: "full",
      candidates: [{ path: ".arc/user/andrew/active/meta-example.md", filename: "meta-example.md" }] });
  });

  it("has only dynamic store imports so importing meta parsers closes no backend cycle", async () => {
    const path = resolve(import.meta.dirname, "../../../src/lib/active/meta-reader.ts");
    const source = await readFile(path, "utf8");
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const staticStoreImports = ast.statements.filter((node) => ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.includes("/store/"));
    expect(staticStoreImports).toEqual([]);
  });
});
