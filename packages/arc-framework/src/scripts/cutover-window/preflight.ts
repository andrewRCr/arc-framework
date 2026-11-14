/** Admission checks that run before the window acquires any restore refs. */
import { join } from "node:path";
import { createDefaultRefStorePorts } from "../../lib/store/default-ports.js";
import { createRefBackendContext, type RefBackendContext } from "../../lib/store/ref/context.js";
import { readRefDesignation, directoryExists } from "../../lib/store/ref/designation.js";
import { readBackingRepository } from "../../lib/config/status-reader.js";
import { readGitDirectories } from "../../lib/git/directories.js";
import { isGitProcessError } from "../../lib/git/process-error.js";
import { isStateRef } from "../../lib/store/ref/manifest.js";
import { listWindowRefs } from "./git.js";
import type { WindowFinding } from "./result.js";

/** Whether a ref occupies one of the store's reserved working namespaces. */
export function isWindowStoreWorkingRef(ref: string): boolean {
  return ["designate", "follow", "migrate", "read", "seen", "version"].some(name => {
    const prefix = `refs/arc/tmp/${name}`;
    return ref === prefix || ref.startsWith(`${prefix}/`);
  });
}

async function configuredStateKeys(context: RefBackendContext): Promise<string[]> {
  try {
    const { stdout } = await context.exec("git", ["config", "--null", "--get-regexp", "^remote\\..*\\.arc-state$"]);
    return [...new Set(stdout.split("\0").filter(Boolean).map(row => {
      const end = row.indexOf("\n");
      return end < 0 ? row : row.slice(0, end);
    }))];
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1 && error.signal === undefined) return [];
    throw error;
  }
}

async function configurationFindings(context: RefBackendContext, commonDir: string): Promise<WindowFinding[]> {
  const [keys, backing, designation] = await Promise.all([
    configuredStateKeys(context), readBackingRepository(context.checkoutRoot), readRefDesignation(context, commonDir),
  ]);
  const findings: WindowFinding[] = keys.map(key => ({ subject: key, condition: "The state designation key is set.",
    remedy: `Have the Owner settle the pre-window designation, unset ${JSON.stringify(key)}, and retry check.` }));
  if (backing !== null) findings.push({ subject: "storage.backing_repository", condition: "A backing repository is configured.",
    remedy: "Have the Owner settle the existing backing destination, clear storage.backing_repository, and retry check." });
  if (designation.codeRemote !== "origin") findings.push({ subject: "origin",
    condition: `Origin is not the code remote (${designation.codeRemote ?? "none"}).`,
    remedy: "Configure origin as the code remote, then retry check." });
  return findings;
}

/** The store directories under `<commonDir>/arc/` that C9 refuses and a restore removes. */
export const WINDOW_STORE_DIRECTORIES = ["store", "store-migrate-build", "store-migrate-old"] as const;

async function directoryFindings(context: RefBackendContext, commonDir: string): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  for (const name of WINDOW_STORE_DIRECTORIES) {
    const path = join(commonDir, "arc", name);
    if (await directoryExists(context, path)) findings.push({ subject: path, condition: "The store directory already exists.",
      remedy: "Have the Owner settle the pre-window store and remove this directory before retrying check." });
  }
  return findings;
}

/** Identify pre-existing store namespaces on either side before acquiring a window hold. */
export function windowPreexistingStoreRefFindings(refs: ReadonlyMap<string, string>, side: "local" | "origin" = "local"): WindowFinding[] {
  return [...refs.keys()].filter(ref => isStateRef(ref) || isWindowStoreWorkingRef(ref)).map(ref => ({
    subject: side === "origin" ? `origin:${ref}` : ref, condition: "A store ref or reserved working ref already exists.",
    remedy: `Have the Owner settle the pre-window store and remove this ${side} ref before retrying check.`,
  }));
}

function holdFindings(refs: ReadonlyMap<string, string>): WindowFinding[] {
  if (![...refs.keys()].some(ref => ref.startsWith("refs/arc-window/"))) return [];
  if (!refs.has("refs/arc-window/complete")) return [{ subject: "refs/arc-window/",
    condition: "An incomplete cutover hold already exists.",
    remedy: "Remove the incomplete hold under refs/arc-window/, then retry check." }];
  return [{ subject: "refs/arc-window/", condition: "A prior window's completion marker already exists.",
    remedy: "Inspect the prior window: run restore only if its flip has not merged; otherwise have the Owner settle the hold before retrying check." }];
}

/** Find every pre-existing store or designation that prevents acquiring a hold. */
export async function readWindowPreconditions(repo: string): Promise<WindowFinding[]> {
  const context = createRefBackendContext(createDefaultRefStorePorts({ checkoutRoot: repo, backingRepository: () => Promise.resolve(null) }));
  const { commonDir } = await readGitDirectories(repo, context.fs);
  const [config, directories, refs] = await Promise.all([
    configurationFindings(context, commonDir), directoryFindings(context, commonDir),
    listWindowRefs({ repo, exec: context.exec }, ["refs/arc/", "refs/arc-window/"]),
  ]);
  return [...config, ...directories, ...windowPreexistingStoreRefFindings(refs), ...holdFindings(refs)];
}
