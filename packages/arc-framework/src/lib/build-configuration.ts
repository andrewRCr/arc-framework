/** Native TypeScript configuration reads retained as shared build controls. */
import type { BuildContext } from "./build-context.js";
import ts from "typescript";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";

/**
 * Resolve configuration and extends chains through the actual TypeScript parser.
 * @param packageRoot - Compiler working directory
 * @returns Concrete shared configuration input digests
 */
export function captureBuildConfiguration(packageRoot: string): BuildContext["contents"] {
  const root = resolve(packageRoot, "../..");
  const contents: Record<string, string> = {};
  const readFile = (file: string): string | undefined => {
    const content = ts.sys.readFile(file);
    if (content !== undefined) {
      contents[relative(root, file).split(sep).join("/")] = createHash("sha256").update(content).digest("hex");
    }
    return content;
  };
  const file = join(packageRoot, "tsconfig.json");
  const loaded = ts.readConfigFile(file, readFile);
  if (loaded.error !== undefined) throwConfigErrors([loaded.error]);
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config as Record<string, unknown>, { ...ts.sys, readFile }, dirname(file), undefined,
    file, undefined, undefined, new Map<string, ts.ExtendedConfigCacheEntry>(),
  );
  if (parsed.errors.length > 0) throwConfigErrors(parsed.errors);
  return contents;
}

function throwConfigErrors(errors: readonly ts.Diagnostic[]): never {
  throw new Error(`Build configuration unavailable: ${errors.map((error) =>
    ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("; ")}; repair configuration and rerun the build.`);
}
