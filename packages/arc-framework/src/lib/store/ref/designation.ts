/** Clone-wide remote roles read in the primary repository's configuration context. */
import { join } from "node:path";
import { readGitDirectories } from "../../git/directories.js";
import type { RefBackendContext } from "./context.js";
import type { SyncState } from "../sync.js";

/** One configured remote and its explicit state role, if any. */
export interface RefRemoteDesignation { name: string; role?: "push" | "read" | "off"; url: string; repository: "code" | "backing" }
/** Counted candidates preserve the code-remote/backing distinction for sync and settings. */
export interface RefDesignation {
  codeRemote: string | null;
  remotes: RefRemoteDesignation[];
  backing: RefRemoteDesignation | null;
  pushes: RefRemoteDesignation[];
}

/** Read common-directory config, including the primary worktree and global layers. */
export async function readRefDesignation(context: RefBackendContext, common?: string): Promise<RefDesignation> {
  const commonDir = common ?? (await readGitDirectories(context.checkoutRoot, context.fs)).commonDir;
  const config = await repositoryConfig(context, commonDir);
  const code = configRemotes(config, "code");
  const codeRemote = code.length === 0 ? null : config.get("remote.pushdefault") ?? (code.length === 1 ? code[0]?.name ?? null : "origin");
  const store = join(commonDir, "arc", "store");
  const backing = await directoryExists(context, store)
    ? configRemotes(await repositoryConfig(context, store), "backing").find(({ name }) => name === "backing") ?? null : null;
  const remotes = code.filter(({ name }) => name !== "backing" && (backing === null || name === codeRemote));
  if (backing) remotes.push(backing);
  return { codeRemote, backing, remotes, pushes: remotes.filter(({ role }) => role === "push") };
}

/** Configuration-only stops precede any fetch or publication. */
export function refDesignationStop(designation: RefDesignation): SyncState | null {
  if (designation.backing && designation.pushes.some(({ repository }) => repository === "code")) return {
    status: "move-incomplete", condition: "A code remote carries push beside the store directory's backing remote.",
    remedy: { text: "Finish or reverse the recorded store move before syncing." },
  };
  if (designation.pushes.length > 1) return { status: "designation-ambiguous", remotes: designation.pushes.map(({ name }) => name),
    remedy: { text: "Set all but the intended state remote off with arc store remote <name> off, then retry." } };
  return designation.remotes.every(({ role }) => role === "off") ? { status: "no-remote" } : null;
}

/** Presence alone selects an installed store; filesystem failures remain visible. */
export async function directoryExists(context: Pick<RefBackendContext, "fs">, path: string): Promise<boolean> {
  try { await context.fs.lstat(path); return true; }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function repositoryConfig(context: RefBackendContext, gitDir: string): Promise<Map<string, string>> {
  const { stdout } = await context.rawExec([`--git-dir=${gitDir}`, "config", "--null", "--list", "--includes"], { cwd: context.checkoutRoot });
  const values = new Map<string, string>();
  for (const row of new TextDecoder().decode(stdout).split("\0").filter(Boolean)) {
    const boundary = row.indexOf("\n");
    values.set(boundary < 0 ? row : row.slice(0, boundary), boundary < 0 ? "true" : row.slice(boundary + 1));
  }
  return values;
}

function configRemotes(config: ReadonlyMap<string, string>, repository: RefRemoteDesignation["repository"]): RefRemoteDesignation[] {
  return [...config].flatMap<RefRemoteDesignation>(([key, url]) => {
    const match = /^remote\.(.+)\.url$/u.exec(key), name = match?.[1];
    if (!name) return [];
    const role = config.get(`remote.${name}.arc-state`);
    return [{ name, url, repository, ...(role === "push" || role === "read" || role === "off" ? { role } : {}) }];
  }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
}
