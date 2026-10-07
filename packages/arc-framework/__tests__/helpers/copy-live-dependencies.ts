/** Independently copy the live first-party source graph needed by a synthetic native checkout. */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const options: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  allowJs: true, resolveJsonModule: true,
};

/**
 * Copy reachable on-disk modules and explicit loader roots without Git membership assumptions.
 * @param source - First-party package root
 * @param destination - Independent writable fixture root
 * @param entries - Package-relative static or path-loaded entrypoints
 * @returns After every reachable source has been copied
 */
export async function copyLiveDependencies(
  source: string, destination: string, entries: readonly string[],
): Promise<void> {
  const sourceRoot = resolve(source);
  const pending = entries.map((entry) => resolve(sourceRoot, entry));
  const seen = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined) break;
    if (seen.has(file) || /^.*\.bundled_.*\.mjs$/.test(basename(file))) continue;
    seen.add(file);
    const key = relative(sourceRoot, file);
    if (key === ".." || key.startsWith(`..${sep}`) || isAbsolute(key)) {
      throw new Error(`Fixture source escapes its package: ${file}`);
    }
    const content = await readFile(file, "utf8");
    const target = join(destination, key);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file, target);
    if (file.endsWith(".json")) continue;
    for (const { fileName } of ts.preProcessFile(content, true, true).importedFiles) {
      if (!fileName.startsWith(".")) continue;
      const runtime = resolve(dirname(file), fileName);
      const resolved = ts.resolveModuleName(fileName, file, options, ts.sys).resolvedModule?.resolvedFileName;
      const alternatives = [ts.sys.fileExists(runtime) ? runtime : undefined, resolved]
        .filter((path): path is string => path !== undefined);
      if (alternatives.length === 0) throw new Error(`Unresolved fixture dependency ${fileName} in ${key}`);
      pending.push(...alternatives);
    }
  }
}
