/** Real loader output is absent from native lint traversal while ordinary JavaScript remains checked. */
import { bundleRequire, dynamicImport } from "bundle-require";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))); });

it.each(["esm", "cjs"] as const)("keeps %s loader output out of directory lint before removal and on retry", async (format) => {
  const root = await mkdtemp(join(tmpdir(), "arc-lint-loader-")); roots.push(root);
  const source = join(root, "src"); await mkdir(source);
  const filepath = join(source, "control.ts");
  const javascript = join(source, "ordinary.js");
  await writeFile(filepath, "export const marker = 1;\n");
  await writeFile(javascript, "const unused = 1;\n");
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: join(packageRoot, "eslint.config.js"),
    overrideConfig: [tseslint.configs.disableTypeChecked],
  });
  const expectedFiles = [filepath, javascript].sort();
  for (let attempt = 0; attempt < 2; attempt++) {
    const loaded = await bundleRequire<{ marker: number }>({
      filepath, format,
      require: async (generated, options) => {
        const results = await eslint.lintFiles(["src/"]);
        expect(results.map(({ filePath }) => filePath).sort()).toEqual(expectedFiles);
        expect(results.find(({ filePath }) => filePath === javascript)?.messages)
          .toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "@typescript-eslint/no-unused-vars" })]));
        const value: unknown = await dynamicImport(generated, options);
        return value;
      },
    });
    expect(loaded.mod.marker).toBe(1);
    expect((await eslint.lintFiles(["src/"])).map(({ filePath }) => filePath).sort()).toEqual(expectedFiles);
  }
}, 10_000);
