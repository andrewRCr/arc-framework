/** Run the suites a change reaches, in their configured Vitest projects and under the heavy-test admission. */
import { appendFile, readFile } from "node:fs/promises";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { load } from "js-yaml";
import { parseCLI } from "vitest/node";

import type { GitExec } from "./git/exec.js";
import { localVitestTierArguments } from "./local-vitest-runner.js";
import { discoverVitestSelection } from "./vitest-discovery.js";
import { executeVitestSelection } from "./vitest-execution.js";
import {
  ReachDeclarationSchema, resolveReachForm, selectionPathsChanged, selectReachSuites,
  type ReachDeclaration, type ReachFiles, type ReachSelection,
} from "./vitest-reach.js";

/** Where a reach check runs and what it was given. */
export interface ReachCheckInput {
  /** Repository root, which every declared path is relative to. */
  readonly checkoutRoot: string;
  /** Package root, where Vitest runs. */
  readonly packageRoot: string;
  /** Repository-relative path of the reach declaration, and the declaration it holds. */
  readonly declarationPath: string;
  readonly declaration: ReachDeclaration;
  /** Native Vitest arguments forwarded to the run. */
  readonly arguments: readonly string[];
  /** The check's environment: its base, tree, notice file, and ask. */
  readonly env: NodeJS.ProcessEnv;
  readonly git: GitExec;
}

/**
 * Select the suites a check's change reaches, report them, and run them; a change reaching none passes with its report.
 * @param input - Repository coordinates, declaration, forwarded arguments, environment, and Git boundary
 * @returns Completion after Vitest has closed its controller resources, or at once when nothing is selected
 */
export async function runReachCheck(input: ReachCheckInput): Promise<void> {
  const { declaration } = input;
  const selection = await selectForCheck(declaration, input);
  await report(declaration, selection, input.env);
  if (selection.suites.length === 0) return;
  const { filter, options } = parseCLI(["vitest", "run", ...localVitestTierArguments("store"), ...input.arguments]);
  const wanted = new Set(selection.suites.map(suite => resolve(input.checkoutRoot, suite)));
  const discovered = await discoverVitestSelection(filter, options, (specifications) => {
    const configured = new Set(specifications.map(specification => resolve(specification.moduleId)));
    const missing = [...wanted].filter(path => !configured.has(path));
    if (missing.length > 0) {
      throw new Error(`Selected ${declaration.name} suites are in no configured project: ${missing
        .map(path => relative(input.checkoutRoot, path)).join(", ")}`);
    }
    return specifications.filter(specification => wanted.has(resolve(specification.moduleId)));
  });
  await executeVitestSelection(discovered, { cwd: input.packageRoot, env: input.env, tier: "store",
    packageRoot: input.packageRoot });
}

/**
 * Read and validate a reach declaration.
 * @param path - Absolute path or file URL of the data file
 * @returns The validated declaration
 */
export async function readReachDeclaration(path: string | URL): Promise<ReachDeclaration> {
  return ReachDeclarationSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

/** Settle the run's form from its ask, base, and change, and select its suites. */
async function selectForCheck(declaration: ReachDeclaration, input: ReachCheckInput): Promise<ReachSelection> {
  const base = input.env.ARC_CHECK_BASE || undefined;
  const tree = input.env.ARC_CHECK_TREE || undefined;
  const changed = base === undefined ? [] : await readChangedPaths(input.git, input.checkoutRoot, base, tree);
  const selectionChanged = selectionPathsChanged(declaration, input.declarationPath, changed).length > 0
    || (base !== undefined && changed.includes(declaration.check.declaration)
      && await checkEntryChanged(input.git, input.checkoutRoot, declaration, base, tree));
  const form = resolveReachForm(input.env[declaration.ask], { hasBase: base !== undefined, selectionChanged });
  return selectReachSuites(declaration, createReachFiles(input.checkoutRoot),
    { form, changed, environment: input.env });
}

/**
 * Read a change's paths, deletions included, from its base to its tree, or to the working tree when it names none.
 * @param git - Git process boundary
 * @param checkoutRoot - Repository root
 * @param base - Commit the change starts from
 * @param tree - Tree the change ends at
 * @returns Repository-relative paths
 */
export async function readChangedPaths(git: GitExec, checkoutRoot: string, base: string,
  tree: string | undefined): Promise<string[]> {
  const { stdout } = await git("git", ["diff", "--name-only", "--no-renames", "-z", "--end-of-options", base,
    ...tree === undefined ? [] : [tree], "--"], { cwd: checkoutRoot });
  return stdout.split("\0").filter(path => path !== "");
}

/** Whether the check's own entry in the check declaration differs between the base and the tree. */
async function checkEntryChanged(git: GitExec, checkoutRoot: string, declaration: ReachDeclaration, base: string,
  tree: string | undefined): Promise<boolean> {
  const entry = async (revision: string | undefined): Promise<string> => {
    const text = revision === undefined
      ? await readFile(join(checkoutRoot, declaration.check.declaration), "utf8")
      : (await git("git", ["show", `${revision}:${declaration.check.declaration}`], { cwd: checkoutRoot })).stdout;
    const parsed = load(text) as { checks?: Record<string, unknown> } | null;
    return JSON.stringify(parsed?.checks?.[declaration.check.id] ?? null);
  };
  try {
    return await entry(base) !== await entry(tree);
  } catch {
    return true;
  }
}

/**
 * Repository files read from the working tree, which is what Vitest runs.
 * @param checkoutRoot - Repository root
 * @returns The reach computation's file boundary
 */
export function createReachFiles(checkoutRoot: string): ReachFiles {
  return {
    kind(path) {
      try {
        const stat = statSync(join(checkoutRoot, path));
        return stat.isFile() ? "file" : stat.isDirectory() ? "directory" : undefined;
      } catch {
        return undefined;
      }
    },
    read: path => readFileSync(join(checkoutRoot, path), "utf8"),
    list(directory) {
      const root = join(checkoutRoot, directory);
      try {
        return readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
          .map(entry => relative(checkoutRoot, join(entry.parentPath, entry.name)).split(sep).join("/"));
      } catch {
        return [];
      }
    },
  };
}

/** Print the selection and add one line to the check's notice. */
async function report(declaration: ReachDeclaration, selection: ReachSelection,
  env: NodeJS.ProcessEnv): Promise<void> {
  const lines = describeReachSelection(declaration, selection);
  process.stdout.write(`${lines.join("\n")}\n`);
  if (env.ARC_CHECK_NOTICE) await appendFile(env.ARC_CHECK_NOTICE, `${lines[0]}\n`).catch(() => undefined);
}

/**
 * Describe a selection: a summary line, then the suites, the paths that reached them, and those left out.
 * @param declaration - The reach declaration
 * @param selection - The selection to describe
 * @returns Report lines, the first a one-line summary
 */
export function describeReachSelection(declaration: ReachDeclaration, selection: ReachSelection): string[] {
  const { name } = declaration;
  const summary = selection.form === "full" ? `${name}: full run of ${selection.suites.length} of ${selection.total} suites`
    : selection.form === "every" ? `${name}: per-change run of every suite, ${selection.suites.length} of ${selection.total}`
    : selection.suites.length === 0 ? `${name}: the change reaches none of ${selection.total} suites`
    : `${name}: the change reaches ${selection.suites.length} of ${selection.total} suites`;
  const reached = selection.reachedBy.length === 0 ? []
    : [`reached by ${selection.reachedBy.slice(0, 5).join(", ")}${selection.reachedBy.length > 5
      ? ` and ${selection.reachedBy.length - 5} more` : ""}`];
  const left = selection.left.map(({ suite, reason }) => `left out: ${suite} (${reason})`);
  return [summary, ...reached, ...selection.suites.map(suite => `selected: ${suite}`), ...left];
}
