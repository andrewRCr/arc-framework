/**
 * Which test suites a change reaches. A suite's reach is its static import closure, each repository file a module in
 * that closure locates from its own path, what each declared locating module finds, and the widening inputs that reach
 * every suite. Every path is repository-relative with forward slashes.
 */
import { posix } from "node:path";
import ts from "typescript";
import { z } from "zod";

const PathSetSchema = z.array(z.union([
  z.string().min(1),
  z.strictObject({ closureOf: z.array(z.string().min(1)).min(1) }),
]));

/** One reach check's data file: its suites, what its modules locate, and what reaches every suite. */
export const ReachDeclarationSchema = z.strictObject({
  name: z.string().min(1),
  // The package Vitest runs in, holding every suite.
  package: z.string().min(1),
  check: z.strictObject({ id: z.string().min(1), declaration: z.string().min(1) }),
  // An ARC_ variable, so a check runner that forwards ARC_ variables to another machine carries the ask with it.
  ask: z.string().regex(/^ARC_[A-Z0-9_]+$/u),
  suites: z.array(z.string().min(1)).min(1),
  fullOnly: z.array(z.string().min(1)).default([]),
  environment: z.array(z.strictObject({
    suites: z.array(z.string().min(1)).min(1), variable: z.string().min(1), value: z.string(),
  })).default([]),
  scripts: z.array(z.string().regex(/\/$/u)).default([]),
  locating: z.array(z.strictObject({ module: z.string().min(1), finds: PathSetSchema })).default([]),
  widening: PathSetSchema.default([]),
  selection: z.array(z.string().min(1)).min(1),
});
export type ReachDeclaration = z.infer<typeof ReachDeclarationSchema>;
type PathSet = ReachDeclaration["widening"];

/** Repository files as the reach computation reads them. */
export interface ReachFiles {
  /** Whether a repository-relative path names a file, a directory, or nothing. */
  kind(path: string): "file" | "directory" | undefined;
  /** A file's text. */
  read(path: string): string;
  /** Every file under a directory, recursively, as repository-relative paths. */
  list(directory: string): string[];
}

/** A reach computation that cannot place what a suite reads. */
export class ReachError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Reach cannot be computed:\n${problems.map(problem => `- ${problem}`).join("\n")}`);
    this.name = "ReachError";
  }
}

/** The forms a run takes: every suite, every suite in its per-change form, or the suites the change reaches. */
export type ReachForm = "full" | "every" | "reach";

/**
 * Settle a run's form. An ask sets it; with none, a run given no base or changing the selection's own declaration or
 * code runs in full, and any other runs the suites its change reaches.
 * @param ask - The asked form, from the declaration's ask variable
 * @param state - Whether the run has a base and whether its change touches the selection itself
 * @returns The form to run
 */
export function resolveReachForm(ask: string | undefined,
  state: { hasBase: boolean; selectionChanged: boolean }): ReachForm {
  if (ask === "full" || ask === "every") return ask;
  if (ask !== undefined && ask !== "") throw new ReachError([`unknown ask "${ask}"; ask for "full" or "every"`]);
  return !state.hasBase || state.selectionChanged ? "full" : "reach";
}

/**
 * Whether a change touches the selection's own data file or code. A change to its check's entry is read separately.
 * @param declaration - The reach declaration
 * @param declarationPath - Repository-relative path of the data file
 * @param changed - Repository-relative changed paths, deletions included
 * @returns The changed paths that belong to the selection
 */
export function selectionPathsChanged(declaration: ReachDeclaration, declarationPath: string,
  changed: readonly string[]): string[] {
  const own = new Set([declarationPath, ...declaration.selection]);
  return changed.filter(path => own.has(path));
}

/** The suites a run selects and why the rest are left out. */
export interface ReachSelection {
  readonly form: ReachForm;
  readonly suites: readonly string[];
  readonly total: number;
  readonly left: ReadonlyArray<{ suite: string; reason: string }>;
  readonly reachedBy: readonly string[];
}

/**
 * Select the suites a run takes in its form, computing every candidate's reach so a reach defect fails any run.
 * @param declaration - The reach declaration
 * @param files - Repository files
 * @param run - The run's form, its changed paths, and its environment
 * @returns The selected suites in path order, those left out with their reason, and the paths that reached any
 */
export function selectReachSuites(declaration: ReachDeclaration, files: ReachFiles, run: {
  form: ReachForm; changed: readonly string[]; environment: Readonly<Record<string, string | undefined>>;
}): ReachSelection {
  const suites = listMatching(files, declaration.suites);
  if (suites.length === 0) throw new ReachError([`no file matches the suites ${declaration.suites.join(", ")}`]);
  const left: Array<{ suite: string; reason: string }> = [];
  const fullOnly = compileGlobs(declaration.fullOnly);
  const candidates = suites.filter(suite => {
    if (run.form === "full" || !matchesAny(fullOnly, suite)) return true;
    left.push({ suite, reason: "runs only in a full run" });
    return false;
  }).filter(suite => {
    const gate = declaration.environment.find(entry => matchesAny(compileGlobs(entry.suites), suite));
    if (gate === undefined || run.environment[gate.variable] === gate.value) return true;
    left.push({ suite, reason: `runs with ${gate.variable}=${gate.value}` });
    return false;
  });
  const graph = new ReachGraph(declaration, files);
  const reaches = candidates.map(suite => ({ suite, reach: graph.reach(suite) }));
  const widening = graph.pathSet(declaration.widening);
  graph.throwProblems();
  if (run.form !== "reach") return { form: run.form, suites: candidates, total: suites.length, left, reachedBy: [] };
  const widened = run.changed.filter(path => widening.matches(path));
  const reached = widened.length > 0 ? reaches
    : reaches.filter(({ reach }) => run.changed.some(path => reach.matches(path)));
  const reachedBy = widened.length > 0 ? widened
    : run.changed.filter(path => reached.some(({ reach }) => reach.matches(path)));
  return { form: run.form, suites: reached.map(({ suite }) => suite), total: suites.length, left, reachedBy };
}

/** A set of repository paths: exact files and glob patterns. */
class PathMatcher {
  constructor(readonly files: ReadonlySet<string>, readonly patterns: readonly RegExp[]) {}
  matches(path: string): boolean { return this.files.has(path) || matchesAny(this.patterns, path); }
}

/** What one module locates from its own path: files, scripts whose closures join it, or its declared finds. */
interface LocatedFacts {
  readonly located: readonly string[];
  readonly scripts: readonly string[];
  readonly finds?: PathSet;
}

/** Closures over the repository's modules, memoized per module, collecting every problem before failing. */
class ReachGraph {
  private readonly imports = new Map<string, readonly string[]>();
  private readonly locatedFacts = new Map<string, LocatedFacts>();
  private readonly problems: string[] = [];
  private readonly locating: ReadonlyMap<string, PathSet>;

  constructor(private readonly declaration: ReachDeclaration, private readonly files: ReachFiles) {
    this.locating = new Map(declaration.locating.map(entry => [entry.module, entry.finds]));
    for (const module of this.locating.keys()) this.requireFile(module, "declared locating module");
    for (const path of declaration.selection) this.requireFile(path, "declared selection path");
  }

  /** Every path one suite reaches. */
  reach(suite: string): PathMatcher {
    const modules = this.closure([suite], true);
    const files = new Set(modules);
    const patterns: RegExp[] = [];
    for (const module of modules) {
      const facts = this.locatedOf(module);
      for (const path of facts.located) files.add(path);
      if (facts.finds === undefined) continue;
      const finds = this.pathSet(facts.finds);
      for (const path of finds.files) files.add(path);
      patterns.push(...finds.patterns);
    }
    return new PathMatcher(files, patterns);
  }

  /** Resolve a declared path set: exact files that must exist, glob patterns, and import closures. */
  pathSet(set: PathSet): PathMatcher {
    const files = new Set<string>();
    const patterns: RegExp[] = [];
    for (const entry of set) {
      if (typeof entry !== "string") {
        const roots = entry.closureOf.filter(root => this.requireFile(root, "declared closure root"));
        for (const path of this.closure(roots, false)) files.add(path);
      } else if (entry.includes("*")) {
        patterns.push(globPattern(entry));
      } else if (this.requireFile(entry, "declared path")) {
        files.add(entry);
      }
    }
    return new PathMatcher(files, patterns);
  }

  /** Fail with every problem found so far. */
  throwProblems(): void {
    if (this.problems.length > 0) throw new ReachError([...new Set(this.problems)]);
  }

  private requireFile(path: string, role: string): boolean {
    if (this.files.kind(path) === "file") return true;
    this.problems.push(`${role} ${path} is not a file`);
    return false;
  }

  /** The import closure of the roots, and, for a suite's reach, the closures of the scripts its modules locate. */
  private closure(roots: readonly string[], withScripts: boolean): string[] {
    const seen = new Set<string>();
    const pending = [...roots];
    for (let module = pending.pop(); module !== undefined; module = pending.pop()) {
      if (seen.has(module)) continue;
      seen.add(module);
      pending.push(...this.importsOf(module), ...withScripts ? this.locatedOf(module).scripts : []);
    }
    return [...seen];
  }

  private importsOf(module: string): readonly string[] {
    const known = this.imports.get(module);
    if (known !== undefined) return known;
    const imports: string[] = [];
    if (isCode(module)) {
      for (const { fileName } of ts.preProcessFile(this.files.read(module), true, true).importedFiles) {
        imports.push(...this.resolveImport(module, fileName));
      }
    }
    this.imports.set(module, imports);
    return imports;
  }

  private locatedOf(module: string): LocatedFacts {
    const known = this.locatedFacts.get(module);
    if (known !== undefined) return known;
    const finds = this.locating.get(module);
    const facts = finds !== undefined ? { located: [], scripts: [], finds }
      : isCode(module) ? this.locateIn(module) : { located: [], scripts: [] };
    this.locatedFacts.set(module, facts);
    return facts;
  }

  private locateIn(module: string): LocatedFacts {
    const text = this.files.read(module);
    const located: string[] = [];
    const scripts: string[] = [];
    if (!/import\.meta|__dirname|__filename/u.test(text)) return { located, scripts };
    for (const site of locateFromOwnPath(module, text)) {
      if (site.path === undefined) {
        this.problems.push(`${module}:${site.line} builds a path from its own location that names no file; `
          + "write it as a literal relative to the module or declare the module's finds");
        continue;
      }
      const path = this.placeLocated(module, site.line, site.path);
      if (path === undefined) continue;
      const script = this.declaration.scripts.some(root => path.startsWith(root)) && isCode(path);
      (script ? scripts : located).push(path);
    }
    return { located, scripts };
  }

  private placeLocated(module: string, line: number, path: string): string | undefined {
    if (path === ".." || path.startsWith("../")) {
      this.problems.push(`${module}:${line} locates ${path}, outside the repository`);
      return undefined;
    }
    if (this.files.kind(path) === "file") return path;
    this.problems.push(`${module}:${line} locates ${path}, which is not a file; declare the module's finds`);
    return undefined;
  }

  private resolveImport(module: string, specifier: string): string[] {
    if (!specifier.startsWith(".")) {
      if (specifier.startsWith("#")) this.problems.push(`${module} imports ${specifier}, a subpath import reach cannot follow`);
      return [];
    }
    const found = importCandidates(posix.join(posix.dirname(module), specifier))
      .filter(path => this.files.kind(path) === "file");
    if (found.length === 0) this.problems.push(`${module} imports ${specifier}, which resolves to no file`);
    return [...new Set(found)];
  }
}

const CODE = /\.(?:[cm]?[jt]sx?)$/u;
function isCode(path: string): boolean { return CODE.test(path); }

/** Files a relative specifier may load: itself, its TypeScript source, or an index or extension it omits. */
function importCandidates(base: string): string[] {
  const swapped = base.replace(/\.js$/u, ".ts").replace(/\.jsx$/u, ".tsx").replace(/\.mjs$/u, ".mts")
    .replace(/\.cjs$/u, ".cts");
  const declared = base.endsWith(".js") ? [base.replace(/\.js$/u, ".d.ts")] : [];
  const extensionless = posix.extname(base) === "" ? [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"]
    .map(suffix => `${base}${suffix}`) : [];
  return [base, swapped, ...declared, ...extensionless];
}

/**
 * Find every path a module builds from its own location, evaluating the two literal forms: `new URL("…",
 * import.meta.url)` and `resolve(import.meta.dirname, "…")` or `join(…)` with literal segments.
 * @param module - Repository-relative module path
 * @param text - Module source
 * @returns Each site's line and its repository-relative path, or no path when the site is not a literal form
 */
export function locateFromOwnPath(module: string, text: string): Array<{ line: number; path?: string }> {
  const source = ts.createSourceFile(module, text, ts.ScriptTarget.Latest, true);
  const sites: Array<{ line: number; path?: string }> = [];
  const visit = (node: ts.Node): void => {
    const name = ownLocationName(node);
    if (name !== undefined) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const segments = literalSegments(node, name);
      sites.push(segments === undefined ? { line }
        : { line, path: posix.normalize(posix.join(posix.dirname(module), ...segments)) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

/** The location a node names — the module's URL, directory, or file path, or a module resolution from it. */
function ownLocationName(node: ts.Node): "url" | "dirname" | "filename" | "resolve" | "computed" | undefined {
  if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    && ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword) {
    const name = ts.isPropertyAccessExpression(node) ? node.name.text : literalText(node.argumentExpression);
    // A dynamic key may read any location field; only a statically unrelated key can be ignored.
    if (name === undefined) return "computed";
    return name === "url" || name === "dirname" || name === "filename" || name === "resolve" ? name : undefined;
  }
  if (!ts.isIdentifier(node) || (node.text !== "__dirname" && node.text !== "__filename")) return undefined;
  const parent = node.parent;
  if ((ts.isPropertyAccessExpression(parent) || ts.isVariableDeclaration(parent)) && parent.name === node) return undefined;
  return node.text === "__dirname" ? "dirname" : "filename";
}

/** The literal path segments a location reference is joined with, when it sits in one of the literal forms. */
function literalSegments(node: ts.Node, name: NonNullable<ReturnType<typeof ownLocationName>>): string[] | undefined {
  const parent = node.parent;
  if (name === "url" && ts.isNewExpression(parent) && ts.isIdentifier(parent.expression)
    && parent.arguments?.length === 2 && parent.arguments[1] === node && parent.expression.text === "URL") {
    const [location] = parent.arguments;
    const first = location === undefined ? undefined : literalText(location);
    return first === undefined ? undefined : [first];
  }
  if (name !== "dirname" || !ts.isCallExpression(parent) || parent.arguments[0] !== node) return undefined;
  const callee = ts.isPropertyAccessExpression(parent.expression) ? parent.expression.name.text
    : ts.isIdentifier(parent.expression) ? parent.expression.text : undefined;
  if (callee !== "resolve" && callee !== "join") return undefined;
  const rest = parent.arguments.slice(1).map(literalText).filter(segment => segment !== undefined);
  return rest.length > 0 && rest.length === parent.arguments.length - 1 ? rest : undefined;
}

function literalText(node: ts.Node): string | undefined {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;
}

/** Every file under the globs' fixed directories that one of them matches, in path order. */
function listMatching(files: ReachFiles, globs: readonly string[]): string[] {
  const patterns = compileGlobs(globs);
  const directories = new Set(globs.map(glob => glob.slice(0, glob.search(/\*|$/u)).replace(/[^/]*$/u, "")));
  const found = new Set<string>();
  for (const directory of directories) {
    for (const path of files.list(directory)) if (matchesAny(patterns, path)) found.add(path);
  }
  return [...found].sort();
}

function compileGlobs(globs: readonly string[]): RegExp[] { return globs.map(globPattern); }
function matchesAny(patterns: readonly RegExp[], path: string): boolean {
  return patterns.some(pattern => pattern.test(path));
}

/**
 * Compile a path glob: `*` matches within one path segment, `**` across segments, and `**\/` any leading directories.
 * @param glob - Repository-relative glob
 * @returns An anchored expression over repository-relative paths
 */
export function globPattern(glob: string): RegExp {
  let source = "";
  for (let index = 0; index < glob.length; index++) {
    const char = glob.charAt(index);
    if (char !== "*") {
      source += char.replace(/[.+?^${}()|[\]\\]/gu, "\\$&");
    } else if (glob[index + 1] !== "*") {
      source += "[^/]*";
    } else {
      const slash = glob[index + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
    }
  }
  return new RegExp(`^${source}$`, "u");
}
