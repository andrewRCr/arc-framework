/** Markdown certification observes the candidate index supplied by a native commit. */
import { afterEach, expect, inject, it } from "vitest";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitThroughManager, createHookManagerRepository } from "../fixtures/checks/hook-manager.js";
import { cleanupTempDir, git } from "./helpers.js";
import { resolveIndexedMarkdownCheckerPaths } from "../../src/lib/markdown/checker-alignment.js";
import { MARKDOWN_SELECTION } from "../../src/lib/markdown/selection.js";

const roots: string[] = [];
const sourceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const loader = createRequire(import.meta.url).resolve("tsx");
afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

async function prepare(): Promise<string> {
  const root = await createHookManagerRepository("core.hooksPath", inject("arcHookManagerTools"));
  roots.push(root);
  const runtimePaths = await resolveIndexedMarkdownCheckerPaths({ root: sourceRoot,
    readBlob: async (cwd, path) => readFile(join(cwd, path)) });
  for (const path of runtimePaths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(join(sourceRoot, path), join(root, path));
  }
  // Supply the hook's real link checker, which the current init recipe omits.
  await copyFile(new URL("../../arc/system/.internal/scripts/validate-links.sh", import.meta.url),
    join(root, ".arc/system/.internal/scripts/validate-links.sh"));
  await writeFile(join(root, ".markdownlint-cli2.jsonc"), JSON.stringify({
    config: { default: false, MD009: true }, ...MARKDOWN_SELECTION, customRules: [],
  }));
  const packagePath = join(root, "package.json");
  const packageData = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
  const sourcePackage = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8")) as Record<string, unknown>;
  await writeFile(packagePath, JSON.stringify({ ...packageData, devDependencies: sourcePackage.devDependencies }));
  for (const path of ["packages/arc-framework/package.json", "package-lock.json"]) {
    await copyFile(join(sourceRoot, path), join(root, path));
  }
  const stagedScript = join(sourceRoot, "packages/arc-framework/src/scripts/lint-markdown-staged.ts");
  const worktreeScript = new URL("../../src/scripts/lint-markdown.ts", import.meta.url).href;
  const check = (command: string[]) => ({ gate: "commit", cache: false, reads_index: true, inputs: ["README.md"], command });
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: {
    staged: check([process.execPath, "--import", loader, stagedScript]),
    alignment: check([process.execPath, "--import", loader, "--input-type=module", "-e",
      `const m=await import(${JSON.stringify(worktreeScript)});process.exitCode=await m.enforceStagedMarkdownWorktreeAlignment();`]),
  } }));
  await writeFile(join(root, "README.md"), "# Base\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "Markdown inputs"]);
  return root;
}

it.each([true, false])("checks Git's commit -a candidate with an opposite repository index (invalid=%s)", async invalid => {
  const root = await prepare();
  await writeFile(join(root, "README.md"), invalid ? "# Repository index valid\n" : "repository trailing \n");
  await git(root, ["add", "README.md"]);
  await writeFile(join(root, "README.md"), invalid ? "trailing \n" : "# Candidate valid\n");
  const head = await git(root, ["rev-parse", "HEAD"]);

  const result = await commitThroughManager(root, undefined, {}, ["-a"]);
  expect(result.exitCode, result.output).toBe(invalid ? 1 : 0);
  if (invalid) {
    expect(result.output).toContain("README.md:1:9 MD009/no-trailing-spaces");
    expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
  } else {
    expect(result.output).toContain("staged: passed");
    expect(result.output).toContain("alignment: passed");
    expect(await git(root, ["show", "HEAD:README.md"])).toBe("# Candidate valid");
    expect(await git(root, ["show", ":README.md"])).toBe("# Candidate valid");
  }
}, 60_000);
