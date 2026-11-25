/** Disposable npm-managed workspace fixtures for native build qualification. */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function writeBuildFixtureFile(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

export function makeBuildFixture(): { root: string; packageRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "arc-build-evidence-"));
  const packageRoot = join(root, "packages/cli");
  writeBuildFixtureFile(join(root, "package.json"), '{"private":true,"workspaces":["packages/cli"]}');
  writeBuildFixtureFile(join(packageRoot, "package.json"), '{"name":"@fixture/cli","type":"module"}');
  const packages: Record<string, unknown> = {};
  for (const name of ["tsup", "bundle-require", "typescript", "esbuild", "load-tsconfig", "tsx"]) {
    const location = `node_modules/${name}`;
    writeBuildFixtureFile(join(root, location, "package.json"), JSON.stringify({
      name, version: "1.0.0", main: "dist/index.js", exports: { ".": "./dist/index.js" },
    }));
    writeBuildFixtureFile(join(root, location, "dist/index.js"), "module.exports = {};\n");
    packages[location] = { version: "1.0.0", resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz` };
  }
  const installation = JSON.stringify({ lockfileVersion: 3, packages });
  writeBuildFixtureFile(join(root, "package-lock.json"), installation);
  writeBuildFixtureFile(join(root, "node_modules/.package-lock.json"), installation);
  return { root, packageRoot };
}
