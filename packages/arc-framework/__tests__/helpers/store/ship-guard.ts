/** Test-only checks that reference storage never enters production source or bundles. */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

/** One production source import crossing into the test-only backend. */
export interface ReferenceImportViolation { file: string; specifier: string }

function isWithin(root: string, file: string): boolean {
  const path = relative(root, file);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?tsx?$/u.test(entry.name) ? [path] : [];
  });
}

function importSpecifiers(source: ts.SourceFile): string[] {
  const values: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) values.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.arguments.length === 1
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const argument = node.arguments[0]!;
      if (ts.isStringLiteralLike(argument)) values.push(argument.text);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) values.push(node.argument.literal.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return values;
}

/** Find imports, re-exports and literal dynamic imports into test-only reference support.
 * @param sourceRoot - Production source directory to scan.
 * @param referenceRoot - Test-only backend directory whose imports are forbidden.
 * @returns Every forbidden import with its source-relative locus.
 */
export function referenceImportViolations(sourceRoot: string, referenceRoot: string): ReferenceImportViolation[] {
  const violations: ReferenceImportViolation[] = [];
  for (const file of sourceFiles(sourceRoot)) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const specifier of importSpecifiers(source)) {
      const resolution = ts.resolveModuleName(specifier, file, { moduleResolution: ts.ModuleResolutionKind.Node16 }, ts.sys)
        .resolvedModule?.resolvedFileName;
      const path = resolution ?? resolve(dirname(file), specifier);
      if (isWithin(referenceRoot, path)) violations.push({ file: relative(sourceRoot, file), specifier });
    }
  }
  return violations;
}

/** Esbuild metadata required by the no-reference-output check, without filtering production inputs. */
export interface ReferenceMetafile {
  inputs: Record<string, unknown>;
  outputs: Record<string, { inputs?: Record<string, unknown> }>;
}

/** Find reference support in raw metafile inputs and every output's input attribution.
 * @param metafile - Raw bundle metadata, including test and non-source inputs.
 * @param packageRoot - Directory relative input keys resolve against.
 * @param referenceRoot - Forbidden test-only directory.
 * @returns Sorted offending raw keys from either metadata location.
 */
export function referenceBundleInputs(metafile: ReferenceMetafile, packageRoot: string, referenceRoot: string): string[] {
  const keys = [...Object.keys(metafile.inputs), ...Object.values(metafile.outputs).flatMap((output) => Object.keys(output.inputs ?? {}))];
  return [...new Set(keys.filter((key) => isWithin(referenceRoot, resolve(packageRoot, key))))].sort();
}
