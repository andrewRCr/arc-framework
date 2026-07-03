/**
 * Reliable-trigger audit for method/extension coverage.
 *
 * Enumerates methods and extensions from the per-file directories and verifies
 * each has at least one declaration in a workflow's YAML frontmatter
 * (`arc.methods` / `arc.extensions`). Fails CI with per-entry diagnostics on
 * any gap.
 *
 * Runs against the package-source copy only; drift vs. `.arc/` is caught by
 * the framework-sync test.
 *
 * @module
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepoRoot } from "./repo-root.js";
import { walkMarkdown } from "../lib/fs/walk-markdown.js";
import { parseFrontmatter } from "../lib/frontmatter/index.js";

/** Declarations extracted from a single workflow file's frontmatter. */
export interface WorkflowDeclarations {
  methods: string[];
  extensions: string[];
  /** Present when YAML parsing failed; methods/extensions are empty in that case. */
  parseError?: string;
}

/** Aggregated coverage across all workflows in the corpus. */
export interface CoverageMaps {
  /** method name → list of workflow paths declaring it */
  methods: Map<string, string[]>;
  /** extension name → list of workflow paths declaring it */
  extensions: Map<string, string[]>;
  /** Workflows whose frontmatter could not be parsed. */
  parseDiagnostics: string[];
}

/** Final audit outcome. */
export interface AuditResult {
  pass: boolean;
  diagnostics: string[];
}

/** One workflow file already read into memory, with a path for diagnostics. */
export interface WorkflowEntry {
  path: string;
  content: string;
}

/**
 * List entry names (filename without `.md`) under `dir`, excluding `README.md`.
 * Used by both method and extension enumeration.
 */
export function enumerateEntries(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => f.slice(0, -3))
    .sort();
}

/** Enumerate method names from a per-file methods directory. */
export function enumerateMethods(dir: string): string[] {
  return enumerateEntries(dir);
}

/** Enumerate extension names from a per-file extensions directory. */
export function enumerateExtensions(dir: string): string[] {
  return enumerateEntries(dir);
}

/**
 * Parse `arc.methods` and `arc.extensions` from a workflow file's frontmatter.
 *
 * - Returns empty arrays (no error) for files without a triple-dash block.
 * - Returns a parseError string when YAML parsing fails.
 * - Silently drops non-string entries from the arrays.
 */
export function parseWorkflowFrontmatter(
  content: string,
): WorkflowDeclarations {
  const { data, parseError } = parseFrontmatter(content);
  if (parseError !== undefined) {
    return { methods: [], extensions: [], parseError };
  }
  const arc = extractArcBlock(data);
  return {
    methods: toStringArray(arc?.methods),
    extensions: toStringArray(arc?.extensions),
  };
}

function extractArcBlock(
  parsed: unknown,
): { methods?: unknown; extensions?: unknown } | undefined {
  if (parsed === null || typeof parsed !== "object") return undefined;
  const arc = (parsed as Record<string, unknown>).arc;
  if (arc === null || typeof arc !== "object") return undefined;
  return arc;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

/**
 * Build independent coverage maps for methods and extensions.
 *
 * Same-name method+extension would require independent declarations — the
 * maps never share entries. Malformed workflows are recorded in
 * `parseDiagnostics` and contribute zero declarations.
 */
export function buildCoverageMap(
  methodNames: string[],
  extensionNames: string[],
  workflows: WorkflowEntry[],
): CoverageMaps {
  const methods = new Map<string, string[]>();
  const extensions = new Map<string, string[]>();
  for (const name of methodNames) methods.set(name, []);
  for (const name of extensionNames) extensions.set(name, []);
  const parseDiagnostics: string[] = [];
  for (const wf of workflows) {
    const decl = parseWorkflowFrontmatter(wf.content);
    if (decl.parseError !== undefined) {
      parseDiagnostics.push(
        `Workflow "${wf.path}" has malformed frontmatter: ${decl.parseError}`,
      );
      continue;
    }
    for (const m of decl.methods) {
      methods.get(m)?.push(wf.path);
    }
    for (const e of decl.extensions) {
      extensions.get(e)?.push(wf.path);
    }
  }
  return { methods, extensions, parseDiagnostics };
}

/**
 * Methods minted ahead of their workflow wiring — exempt from the coverage
 * requirement until their `arc.methods` declarations land. Entries are
 * temporary: once a listed method gains any declaration, the audit flags the
 * entry as stale so it cannot outlive the wiring.
 */
export const WIRING_PENDING: ReadonlySet<string> = new Set([
  "adversarial-review",
  "design-audit",
  "task-audit",
]);

/** Format a diagnostic for a method missing its workflow declaration. */
export function formatMethodDiagnostic(name: string): string {
  return `Method "${name}" has no workflow declaration. Add ${name} to some workflow's arc.methods frontmatter field.`;
}

/** Format a diagnostic for a declared method still listed as wiring-pending. */
export function formatStaleAllowlistDiagnostic(
  name: string,
  files: string[],
): string {
  return `Method "${name}" is declared by ${files.join(", ")} but still listed in WIRING_PENDING. Remove the allowlist entry.`;
}

/** Format a diagnostic for an extension missing its workflow declaration. */
export function formatExtensionDiagnostic(name: string): string {
  return `Extension "${name}" has no workflow declaration. Add ${name} to some workflow's arc.extensions frontmatter field.`;
}

/**
 * Run the audit end-to-end against a corpus.
 *
 * Exposed as a pure function so tests can point it at a fixture tree.
 * `wiringPending` exempts named methods from the coverage requirement;
 * a declared method still listed there fails as a stale allowlist entry.
 */
export async function audit(
  methodsDir: string,
  extensionsDir: string,
  workflowsDir: string,
  wiringPending: ReadonlySet<string> = WIRING_PENDING,
): Promise<AuditResult> {
  const methodNames = enumerateMethods(methodsDir);
  const extensionNames = enumerateExtensions(extensionsDir);
  const workflowPaths = (await walkMarkdown(workflowsDir)).sort();
  const workflows: WorkflowEntry[] = workflowPaths.map((p) => ({
    path: relative(workflowsDir, p),
    content: readFileSync(p, "utf8"),
  }));
  const cov = buildCoverageMap(methodNames, extensionNames, workflows);
  const diagnostics: string[] = [...cov.parseDiagnostics];
  for (const [name, files] of cov.methods) {
    if (files.length === 0) {
      if (!wiringPending.has(name)) diagnostics.push(formatMethodDiagnostic(name));
    } else if (wiringPending.has(name)) {
      diagnostics.push(formatStaleAllowlistDiagnostic(name, files));
    }
  }
  for (const [name, files] of cov.extensions) {
    if (files.length === 0) diagnostics.push(formatExtensionDiagnostic(name));
  }
  return { pass: diagnostics.length === 0, diagnostics };
}

// --- CLI entry ---

async function main(): Promise<void> {
  const root = resolveRepoRoot();
  const systemDir = join(root, "packages/arc-framework/arc/system");
  const result = await audit(
    join(systemDir, "methods"),
    join(systemDir, "extensions"),
    join(systemDir, "workflows"),
  );
  if (!result.pass) {
    for (const d of result.diagnostics) {
      process.stderr.write(`${d}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(
    "audit-method-triggers: all methods and extensions have workflow declarations\n",
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
