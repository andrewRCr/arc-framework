/**
 * Test-only import audit for the CLI kernel's bottom-of-graph boundary.
 */

import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import ts from "typescript";

export interface KernelBoundaryFinding {
  readonly file: string;
  readonly specifier: string;
  readonly reason:
    | "CommonJS require loader"
    | "createRequire loader acquisition"
    | "external import-equals declaration"
    | "neverthrow import outside kernel Result seam"
    | "non-literal dynamic import"
    | "source import escapes kernel"
    | "unapproved external package"
    | "unresolved source import";
}

interface AuditOptions {
  readonly kernelRoot: string;
  readonly sourceRoot: string;
}

const compilerOptions: ts.CompilerOptions = {
  module: ts.ModuleKind.Node16,
  moduleResolution: ts.ModuleResolutionKind.Node16,
  target: ts.ScriptTarget.ES2022,
};

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (entry.isFile() && /\.[cm]?tsx?$/u.test(entry.name)) files.push(path);
  }
  return files.sort();
}

function within(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function stringLiteralText(node: ts.Node | undefined): string | undefined {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function importTypeSpecifier(node: ts.ImportTypeNode): string | undefined {
  return ts.isLiteralTypeNode(node.argument) ? stringLiteralText(node.argument.literal) : undefined;
}

function isDirectRequire(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && expression.text === "require";
}

function isModuleRequire(expression: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === "module"
    && expression.name.text === "require";
}

function isCreateRequire(expression: ts.Expression, bindings: ReadonlySet<string>): boolean {
  return (ts.isIdentifier(expression) && bindings.has(expression.text))
    || (ts.isPropertyAccessExpression(expression) && expression.name.text === "createRequire");
}

function relativeFile(sourceRoot: string, file: string): string {
  return relative(sourceRoot, file).split("\\").join("/");
}

function literalReferences(sourceFile: ts.SourceFile): string[] {
  const references: string[] = [];
  const visit = (node: ts.Node): void => {
    let specifier: string | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = stringLiteralText(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      specifier = stringLiteralText(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node)) {
      specifier = importTypeSpecifier(node);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (isDynamicImport || isDirectRequire(node.expression) || isModuleRequire(node.expression)) {
        specifier = stringLiteralText(node.arguments[0]);
      }
    }
    if (specifier !== undefined) references.push(specifier);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

/**
 * Audit the kernel source graph and the repository-wide neverthrow seam.
 *
 * @param options - Absolute kernel and source roots to inspect.
 * @returns Stable source-order findings with file and specifier context.
 */
export function auditKernelBoundary(options: AuditOptions): KernelBoundaryFinding[] {
  const kernelRoot = resolve(options.kernelRoot);
  const sourceRoot = resolve(options.sourceRoot);
  const resultPath = join(kernelRoot, "result.ts");
  const findings: KernelBoundaryFinding[] = [];

  for (const file of sourceFiles(kernelRoot)) {
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const createRequireBindings = new Set<string>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || stringLiteralText(statement.moduleSpecifier) !== "node:module") {
        continue;
      }
      const bindings = statement.importClause?.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if ((element.propertyName ?? element.name).text === "createRequire") {
            createRequireBindings.add(element.name.text);
          }
        }
      }
    }
    const report = (specifier: string, reason: KernelBoundaryFinding["reason"]): void => {
      findings.push({ file: relativeFile(sourceRoot, file), specifier, reason });
    };
    const inspectSpecifier = (specifier: string): void => {
      if (specifier === "neverthrow") {
        if (file !== resultPath) report(specifier, "neverthrow import outside kernel Result seam");
        return;
      }
      if (specifier === "zod" || specifier.startsWith("node:")) return;
      if (!specifier.startsWith(".")) {
        report(specifier, "unapproved external package");
        return;
      }
      const resolvedModule = ts.resolveModuleName(specifier, file, compilerOptions, ts.sys).resolvedModule;
      if (resolvedModule === undefined) {
        report(specifier, "unresolved source import");
      } else if (!within(kernelRoot, resolve(resolvedModule.resolvedFileName))) {
        report(specifier, "source import escapes kernel");
      }
    };
    const visit = (node: ts.Node): void => {
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        report(stringLiteralText(node.moduleReference.expression) ?? "<non-literal>",
          "external import-equals declaration");
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = stringLiteralText(node.arguments[0]);
        if (specifier === undefined) report("<non-literal>", "non-literal dynamic import");
        else inspectSpecifier(specifier);
      } else if (ts.isCallExpression(node) && (isDirectRequire(node.expression) || isModuleRequire(node.expression))) {
        report(stringLiteralText(node.arguments[0]) ?? "<non-literal>", "CommonJS require loader");
      } else if (ts.isCallExpression(node) && isCreateRequire(node.expression, createRequireBindings)) {
        report("createRequire", "createRequire loader acquisition");
      } else if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = stringLiteralText(node.moduleSpecifier);
        if (specifier !== undefined) inspectSpecifier(specifier);
      } else if (ts.isImportTypeNode(node)) {
        const specifier = importTypeSpecifier(node);
        if (specifier !== undefined) inspectSpecifier(specifier);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  for (const file of sourceFiles(sourceRoot)) {
    if (within(kernelRoot, file)) continue;
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const specifier of literalReferences(sourceFile)) {
      if (specifier === "neverthrow") {
        findings.push({
          file: relativeFile(sourceRoot, file),
          specifier,
          reason: "neverthrow import outside kernel Result seam",
        });
      }
    }
  }

  return findings;
}
