/** Compare tracked content against the import read and inherited merge-base content. */
import type { WindowImportContext } from "./import-context.js";
import type { WindowReadMap, WindowPathRead } from "./read-map.js";
import { WindowRefusal } from "./result.js";
import { WINDOW_TRACKED_STATE_ROOTS } from "./tracked-state.js";
import { isCompletedGitFailure, isGitProcessError } from "../../lib/git/process-error.js";
import { resolveImportBranchTip } from "../../lib/store/ref/import/branch-tip.js";

/** A path's comparison outcome and its read/main merge bases. */
export interface WindowPathRule extends WindowPathRead { revision: string; passes: boolean; bases: string[] }
/** One operation's cached immutable Git reads. */
export interface WindowReadRule {
  inspect(path: string, revision: string, branchTip?: boolean): Promise<WindowPathRule>;
  paths(revision: string): Promise<readonly string[]>;
  mergeBases(left: string, right: string): Promise<readonly string[]>;
}

/** Bind native tree and ancestry reads to the map's acquired import coordinates. */
export function createWindowReadRule(context: WindowImportContext, map: WindowReadMap): WindowReadRule {
  const trees = new Map<string, Promise<Map<string, string | null>>>(), ancestry = new Map<string, Promise<string[]>>();
  const tree = (revision: string) => {
    let read = trees.get(revision);
    if (!read) { read = readTree(context, revision); trees.set(revision, read); }
    return read;
  };
  const bases = (left: string, right: string) => {
    const key = `${left}\0${right}`;
    let read = ancestry.get(key);
    if (!read) { read = readBases(context, left, right); ancestry.set(key, read); }
    return read;
  };
  async function inheritedPointer(mapped: WindowPathRead, revision: string): Promise<boolean> {
    if (!mapped.pointerBranch || (await tree(revision)).has(mapped.path)) return false;
    const selected = await resolveImportBranchTip(context.importSource, mapped.pointerBranch);
    if (selected.status !== "available") return false;
    for (const base of await bases(revision, selected.tip)) {
      if (!(await tree(base)).has(mapped.path)) return true;
    }
    return false;
  }
  return { paths: async revision => [...(await tree(revision)).keys()], mergeBases: bases,
    inspect: async (path, revision, branchTip = false) => {
    const mainBases = branchTip ? await bases(revision, map.main) : [];
    const discoveryBases = [...mainBases];
    for (const read of map.readRevisions) discoveryBases.push(...await bases(revision, read));
    const mapped = await map.at(path, revision, [...new Set(discoveryBases)]);
    const allowedBases = [...new Set([...mainBases, ...mapped.readRevision === null ? [] : await bases(revision, mapped.readRevision)])];
    const content = (await tree(revision)).get(path) ?? null;
    const allowed = mapped.readRevision === null ? [] : [(await tree(mapped.readRevision)).get(path) ?? null];
    for (const base of allowedBases) allowed.push((await tree(base)).get(path) ?? null);
    const passes = windowReadRulePasses({ path, content, allowed }) || (branchTip && await inheritedPointer(mapped, revision));
    return { ...mapped, revision, bases: allowedBases, passes };
  } };
}

async function readTree(context: WindowImportContext, revision: string): Promise<Map<string, string | null>> {
  try {
    const { stdout } = await context.exec("git", ["--no-replace-objects", "ls-tree", "-r", "-z", "--full-tree", revision,
      "--", ...WINDOW_TRACKED_STATE_ROOTS], { cwd: context.checkoutRoot, objectAccess: "local-only" });
    if (stdout !== "" && !stdout.endsWith("\0")) throw new Error("The tracked tree listing is incomplete.");
    const files = new Map<string, string | null>();
    for (const row of stdout.split("\0").filter(Boolean)) {
      const match = /^([0-7]{6}) (blob|commit) ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/u.exec(row);
      if (!match?.[4]) throw new Error("The tracked tree listing is malformed.");
      files.set(match[4], (match[1] === "100644" || match[1] === "100755") && match[2] === "blob" ? match[3] ?? null : null);
    }
    return files;
  } catch (error) { return refuse(revision, error); }
}

async function readBases(context: WindowImportContext, left: string, right: string): Promise<string[]> {
  try {
    const { stdout } = await context.exec("git", ["--no-replace-objects", "merge-base", "--all", left, right],
      { cwd: context.checkoutRoot, objectAccess: "local-only" });
    const bases = stdout.trim().split("\n");
    if (bases.some(value => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value))) throw new Error("The merge-base listing is incomplete or malformed.");
    return bases;
  } catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) return [];
    return refuse(`${left} / ${right}`, error);
  }
}

function refuse(subject: string, error: unknown): never {
  throw new WindowRefusal([{ subject, condition: `Cannot acquire read-rule comparison evidence: ${String(error)}`,
    remedy: "Restore the named commit objects and readable Git state, then retry the comparison." }]);
}

/** Decide whether one path retains only content the import reads or that its branch inherited. */
export function windowReadRulePasses(input: { path: string; content: string | null; allowed: readonly (string | null)[] }): boolean {
  return input.path === ".arc/backlog/ROADMAP.md" || input.allowed.includes(input.content);
}
