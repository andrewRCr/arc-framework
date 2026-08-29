/**
 * Reliable-trigger audit for method/extension coverage.
 *
 * Enumerates methods and extensions from the per-file directories and verifies
 * each is reachable from a workflow's YAML frontmatter (`arc.methods` /
 * `arc.extensions`) through direct declarations or method-owned dependencies.
 * Fails CI with per-entry diagnostics on any gap or broken dependency graph.
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
import { parseMethodFrontmatter } from "../lib/frontmatter/method.js";
import {
  ACTIVATABLE_METHOD_REGISTRY,
  isActivatableMethodName,
} from "../lib/method-activation-registry.js";

/** Declarations extracted from a single workflow file's frontmatter. */
export interface WorkflowDeclarations {
  methods: string[];
  extensions: string[];
  /** Present when YAML parsing or declaration-shape validation fails; declarations are empty in that case. */
  parseError?: string;
}

/** Aggregated coverage across all workflows in the corpus. */
export interface CoverageMaps {
  /** method name → list of workflow paths declaring it */
  methods: Map<string, string[]>;
  /** extension name → list of workflow paths declaring it */
  extensions: Map<string, string[]>;
  /** Workflows whose frontmatter could not be parsed or whose declarations were malformed. */
  parseDiagnostics: string[];
  /** Workflow declarations that do not resolve to a registered entry. */
  declarationDiagnostics: string[];
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

const PUSH_SITE = /`push-interlock` release.*`workflowPush`|# workflowPush\b|^\s*(?:arc sync|(?:npx )?arc release push)(?:\s|$)/u;
const GLOBAL_PRE_PUSH_CONTRACT = /#pre-push-review.*Before every agent-managed push/iu;

/** Audit declaration and fire ordering for agent-managed workflow push sites. */
export function auditPushExtensionCoverage(workflows: WorkflowEntry[]): string[] {
  const diagnostics: string[] = [];
  for (const workflow of workflows) {
    const lines = workflow.content.split("\n");
    const sites = lines.flatMap((line, index) => PUSH_SITE.test(line) ? [index] : []);
    if (sites.length === 0) continue;

    const declarations = parseWorkflowFrontmatter(workflow.content);
    if (!declarations.extensions.includes("pre-push-review")) {
      diagnostics.push(
        `Workflow "${workflow.path}" has an agent-managed push but does not declare pre-push-review in arc.extensions.`,
      );
    }

    const globalContractLine = lines.findIndex((line) => GLOBAL_PRE_PUSH_CONTRACT.test(line));
    for (const site of sites) {
      const localWindow = lines.slice(Math.max(0, site - 12), site).join("\n");
      const covered = /#pre-push-review/u.test(localWindow)
        || (globalContractLine >= 0 && globalContractLine < site);
      if (!covered) {
        diagnostics.push(
          `Workflow "${workflow.path}" push site at line ${site + 1} does not fire pre-push-review first.`,
        );
      }
    }
  }
  return diagnostics;
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

/** Audit package method activation fields against the closed typed registry. */
export function auditActivatableMethodCorpus(methodsDir: string): string[] {
  const diagnostics: string[] = [];
  const names = enumerateMethods(methodsDir);
  const nameSet = new Set(names);

  for (const name of names) {
    const parsed = parseFrontmatter(readFileSync(join(methodsDir, `${name}.md`), "utf8"));
    if (parsed.parseError !== undefined || parsed.data === null || typeof parsed.data !== "object") continue;
    const active = (parsed.data as Record<string, unknown>).active;
    if (active !== undefined && !isActivatableMethodName(name)) {
      diagnostics.push(`Method "${name}" declares active but is absent from the activatable-method registry.`);
    }
  }

  for (const [name, definition] of Object.entries(ACTIVATABLE_METHOD_REGISTRY)) {
    if (!nameSet.has(name)) {
      diagnostics.push(`Activatable method "${name}" is missing from the package method corpus.`);
      continue;
    }
    const parsed = parseFrontmatter(readFileSync(join(methodsDir, `${name}.md`), "utf8"));
    const data = parsed.data !== null && typeof parsed.data === "object"
      ? parsed.data as Record<string, unknown>
      : {};
    if (data.active !== definition.defaultActive) {
      diagnostics.push(
        `Activatable method "${name}" must declare package default ${String(definition.defaultActive)}.`,
      );
    }
  }
  return diagnostics;
}

/**
 * Parse `arc.methods` and `arc.extensions` from a workflow file's frontmatter.
 *
 * - Returns empty arrays (no error) for files without a triple-dash block.
 * - Returns a parseError string when YAML parsing fails.
 * - Returns a parseError string for malformed `arc`, `arc.methods`, or `arc.extensions` shapes.
 */
export function parseWorkflowFrontmatter(
  content: string,
): WorkflowDeclarations {
  const { data, parseError } = parseFrontmatter(content);
  if (parseError !== undefined) {
    return { methods: [], extensions: [], parseError };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { methods: [], extensions: [] };
  }
  const root = data as Record<string, unknown>;
  if (!("arc" in root)) return { methods: [], extensions: [] };
  const arc = root.arc;
  if (arc === null || typeof arc !== "object" || Array.isArray(arc)) {
    return { methods: [], extensions: [], parseError: '"arc" must be a mapping' };
  }
  const declarations = arc as Record<string, unknown>;
  const methods = parseDeclarationArray(declarations.methods, "arc.methods");
  if (methods.error !== undefined) {
    return { methods: [], extensions: [], parseError: methods.error };
  }
  const extensions = parseDeclarationArray(declarations.extensions, "arc.extensions");
  if (extensions.error !== undefined) {
    return { methods: [], extensions: [], parseError: extensions.error };
  }
  return {
    methods: methods.values,
    extensions: extensions.values,
  };
}

function parseDeclarationArray(
  value: unknown,
  locus: "arc.methods" | "arc.extensions",
): { values: string[]; error?: string } {
  if (value === undefined) return { values: [] };
  if (!Array.isArray(value)) return { values: [], error: `${locus} must be an array` };
  if (!value.every((entry) => typeof entry === "string")) {
    return { values: [], error: `${locus} must contain only strings` };
  }
  return { values: value };
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
  const declarationDiagnostics: string[] = [];
  for (const wf of workflows) {
    const decl = parseWorkflowFrontmatter(wf.content);
    if (decl.parseError !== undefined) {
      parseDiagnostics.push(
        `Workflow "${wf.path}" has malformed frontmatter: ${decl.parseError}`,
      );
      continue;
    }
    for (const m of decl.methods) {
      const declaredBy = methods.get(m);
      if (declaredBy === undefined) {
        declarationDiagnostics.push(`Workflow "${wf.path}" declares unknown method "${m}" in arc.methods.`);
      } else {
        declaredBy.push(wf.path);
      }
    }
    for (const e of decl.extensions) {
      const declaredBy = extensions.get(e);
      if (declaredBy === undefined) {
        declarationDiagnostics.push(`Workflow "${wf.path}" declares unknown extension "${e}" in arc.extensions.`);
      } else {
        declaredBy.push(wf.path);
      }
    }
  }
  return { methods, extensions, parseDiagnostics, declarationDiagnostics };
}

interface MethodDependencyGraph {
  dependencies: Map<string, string[]>;
  diagnostics: string[];
}

function readMethodDependencyGraph(methodsDir: string, methodNames: string[]): MethodDependencyGraph {
  const dependencies = new Map<string, string[]>();
  const diagnostics: string[] = [];
  const registered = new Set(methodNames);

  for (const name of methodNames) {
    const parsed = parseMethodFrontmatter(readFileSync(join(methodsDir, `${name}.md`), "utf8"), name);
    if (parsed.frontmatter === undefined) {
      diagnostics.push(`Method "${name}" has invalid frontmatter: ${parsed.errors.join("; ")}.`);
      dependencies.set(name, []);
      continue;
    }
    const declared = [...new Set(parsed.frontmatter.arc?.methods ?? [])];
    dependencies.set(name, declared);
    for (const dependency of declared) {
      if (!registered.has(dependency)) {
        diagnostics.push(`Method "${name}" declares unknown method "${dependency}" in arc.methods.`);
      }
    }
  }

  diagnostics.push(...findMethodDependencyCycles(dependencies, registered));
  return { dependencies, diagnostics };
}

function findMethodDependencyCycles(
  dependencies: ReadonlyMap<string, readonly string[]>,
  registered: ReadonlySet<string>,
): string[] {
  const state = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const cycles = new Set<string>();

  const visit = (name: string): void => {
    state.set(name, "visiting");
    stack.push(name);
    for (const dependency of dependencies.get(name) ?? []) {
      if (!registered.has(dependency)) continue;
      if (state.get(dependency) === "visiting") {
        const cycleStart = stack.indexOf(dependency);
        const path = [...stack.slice(cycleStart), dependency];
        cycles.add(`Method dependency cycle: ${path.join(" -> ")}.`);
      } else if (state.get(dependency) !== "visited") {
        visit(dependency);
      }
    }
    stack.pop();
    state.set(name, "visited");
  };

  for (const name of [...registered].sort()) {
    if (state.get(name) === undefined) visit(name);
  }
  return [...cycles].sort();
}

function resolveTransitiveMethodCoverage(
  direct: ReadonlyMap<string, readonly string[]>,
  dependencies: ReadonlyMap<string, readonly string[]>,
): Map<string, string[]> {
  const resolved = new Map([...direct].map(([name, workflows]) => [name, [...workflows]]));
  for (const [root, workflows] of direct) {
    for (const workflow of workflows) {
      const pending = [root];
      const visited = new Set<string>();
      while (pending.length > 0) {
        const current = pending.pop();
        if (current === undefined || visited.has(current)) continue;
        visited.add(current);
        const files = resolved.get(current);
        if (files !== undefined && !files.includes(workflow)) files.push(workflow);
        for (const dependency of dependencies.get(current) ?? []) pending.push(dependency);
      }
    }
  }
  return resolved;
}

/**
 * Methods minted ahead of their workflow wiring — exempt from the coverage
 * requirement until their `arc.methods` declarations land. Entries are
 * temporary: once a listed method gains any declaration, the audit flags the
 * entry as stale so it cannot outlive the wiring.
 */
export const WIRING_PENDING: ReadonlySet<string> = new Set<string>();

/** Format a diagnostic for a method missing its workflow declaration. */
export function formatMethodDiagnostic(name: string): string {
  return `Method "${name}" is not reachable from a workflow declaration. Add ${name} to the arc.methods field of a direct consumer.`;
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
  const graph = readMethodDependencyGraph(methodsDir, methodNames);
  const methods = resolveTransitiveMethodCoverage(cov.methods, graph.dependencies);
  const diagnostics: string[] = [
    ...cov.parseDiagnostics,
    ...cov.declarationDiagnostics,
    ...graph.diagnostics,
    ...auditPushExtensionCoverage(workflows),
  ];
  for (const [name, files] of methods) {
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
  const diagnostics = [...result.diagnostics, ...auditActivatableMethodCorpus(join(systemDir, "methods"))];
  if (diagnostics.length > 0) {
    for (const d of diagnostics) {
      process.stderr.write(`${d}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(
    "audit-method-triggers: method graph and extension declarations are reachable and valid\n",
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
