/** Production callers of explicit ref-store entries stay confined to their adapters. */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { beforeAll, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../src");
const expected = { runStoreRemote: ["commands/store-remote.ts"], runStoreMigrate: ["commands/store-migrate.ts"],
  createRefStore: [], createReadSourceStore: [] } as const;
const callers = new Map<string, Set<string>>();

async function scan(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await scan(path); continue; }
    if (!entry.name.endsWith(".ts")) continue;
    const file = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
    const aliases = new Map(Object.keys(expected).map((name) => [name, name]));
    for (const statement of file.statements) if (ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) {
        const name = item.propertyName?.text ?? item.name.text;
        if (name in expected) aliases.set(item.name.text, name);
      }
    }
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const name = ts.isIdentifier(expression) ? aliases.get(expression.text)
          : ts.isPropertyAccessExpression(expression) && expression.name.text in expected ? expression.name.text : undefined;
        if (name) {
          const files = callers.get(name) ?? new Set<string>();
          files.add(relative(root, path).split("\\").join("/")); callers.set(name, files);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
}

beforeAll(async () => { await scan(root); }, 30_000);
it.each(Object.entries(expected))("confines %s to its explicit production entry", (name, files) => {
  expect([...(callers.get(name) ?? [])].sort()).toEqual(files);
});
