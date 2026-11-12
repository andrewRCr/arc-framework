/** The projection's one configuration read: identity, the in-flight view keys, the object format, and the effective excludes source. */
import type { GitExec } from "../../git/exec.js";
import { homedir } from "node:os";
import { resolveIdentityFromValues } from "../../git/identity.js";
import { normalizeGitRejection } from "../../git/process-error.js";
import type { Slug } from "../../kernel/index.js";
import type { Remedy } from "../refusal.js";
import type { ObjectFormat } from "./blob-id.js";
import type { IgnoreRulesSelection } from "./index-schema.js";

/** Every key the read takes: ARC's own, `user.name`, the object format, and the effective excludes source. */
const CONFIGURATION_KEYS = "^(arc\\.|user\\.name$|extensions\\.objectformat$|core\\.(excludesfile|ignorecase)$)";

/** What a configuration with no usable identity is told to do. */
const IDENTITY_REMEDY: Remedy = {
  text: "Set an identity, a lowercase slug, with: git config --local arc.identity <identity>",
};

/** The identity the configuration yields, or why it yields none. */
export type ConfiguredIdentity =
  | { readonly status: "identified"; readonly identity: Slug }
  | { readonly status: "no-identity"; readonly cause: "unset" | "invalid"; readonly remedy: Remedy };

/** The excludes source and raw values Git parses, or a valueless setting that cannot authorize a cached guard pass. */
export type ConfiguredIgnoreRules =
  | ({ readonly kind: "path" } & IgnoreRulesSelection)
  | { readonly kind: "invalid"; readonly remedy: Remedy };

/** What the one read returns. */
export interface ProjectionConfiguration {
  readonly objectFormat: ObjectFormat;
  readonly ignoreRules: ConfiguredIgnoreRules;
  readonly identity: ConfiguredIdentity;
  /** The in-flight view keys as set, for the view setting to interpret: `arc.inflightView`, and each `arc.inflightPin`. */
  readonly view: { readonly setting: string | null; readonly pins: readonly string[] };
}

/**
 * Read identity, view keys, object format, and the effective excludes source in one Git call.
 * @param exec - The Git executor.
 * @param cwd - The checkout root.
 * @param environment - The same invocation environment bound to the Git executor, for default and home paths.
 * @returns What the configuration yields.
 */
export async function readProjectionConfiguration(
  exec: GitExec, cwd: string, environment: NodeJS.ProcessEnv = process.env,
): Promise<ProjectionConfiguration> {
  const records = parseConfigurationRecords(await readMatchingKeys(exec, cwd));
  // Git prints every scope's value in its own order, so the last occurrence is the one `git config --get` returns.
  const last = (key: string): string | null | undefined => records.get(key)?.at(-1);
  const excludesFile = excludesFileOf(records.get("core.excludesfile"), environment);
  return {
    objectFormat: objectFormatOf(last("extensions.objectformat")),
    ignoreRules: excludesFile.kind === "invalid" ? excludesFile
      : { ...excludesFile, ignoreCase: [...(records.get("core.ignorecase") ?? [])] },
    identity: identityOf(last("arc.identity"), last("user.name")),
    view: {
      setting: last("arc.inflightview") ?? null,
      pins: (records.get("arc.inflightpin") ?? []).filter((pin): pin is string => pin !== null),
    },
  };
}

/** Resolve the default and current-home spelling before the guard pins its path in Git's command scope. */
function excludesFileOf(
  values: readonly (string | null)[] | undefined, environment: NodeJS.ProcessEnv,
): ({ readonly kind: "path" } & Omit<IgnoreRulesSelection, "ignoreCase">) | Extract<ConfiguredIgnoreRules, { kind: "invalid" }> {
  if (values?.includes(null)) return { kind: "invalid", remedy: {
    text: "A core.excludesFile occurrence has no value. Run git config --show-origin --get-all core.excludesFile "
      + "to locate its configuration file, then give every occurrence a path or remove the valueless entries and run the command again.",
  } };
  const value = values?.at(-1);
  const home = environment.HOME ?? (process.platform === "win32"
    ? environment.HOMEDRIVE !== undefined && environment.HOMEPATH !== undefined
      ? `${environment.HOMEDRIVE}${environment.HOMEPATH}` : environment.USERPROFILE ?? homedir()
    : undefined);
  const path = value ?? (environment.XDG_CONFIG_HOME ? `${environment.XDG_CONFIG_HOME}/git/ignore`
    : home === undefined ? "" : `${home}/.config/git/ignore`);
  // Concatenation preserves a symlink followed by ..; lexical normalization can select another file.
  return { kind: "path", path: /^~[\\/]/u.test(path) && home !== undefined ? `${home}${path.slice(1)}` : path,
    values: (values ?? []).filter((value): value is string => value !== null) };
}

/**
 * Parse `git config --null --get-regexp` output: each record its key, then a newline and its value where it has one.
 * @param stdout - The output, each record NUL-terminated.
 * @returns Each key, as Git prints it lowercased, with every value in order; null for a key set with no value.
 */
export function parseConfigurationRecords(stdout: string): ReadonlyMap<string, readonly (string | null)[]> {
  const records = new Map<string, (string | null)[]>();
  for (const record of stdout.split("\0").slice(0, -1)) {
    const newline = record.indexOf("\n");
    const key = newline === -1 ? record : record.slice(0, newline);
    records.set(key, [...(records.get(key) ?? []), newline === -1 ? null : record.slice(newline + 1)]);
  }
  return records;
}

async function readMatchingKeys(exec: GitExec, cwd: string): Promise<string> {
  const args = ["config", "--null", "--get-regexp", CONFIGURATION_KEYS];
  try {
    return (await exec("git", args, { cwd })).stdout;
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args });
    if (normalized.kind === "nonzero-exit" && normalized.exitCode === 1) return "";
    throw error;
  }
}

function objectFormatOf(value: string | null | undefined): ObjectFormat {
  if (value === undefined || value === null) return "sha1";
  const format = value.toLowerCase();
  if (format === "sha1" || format === "sha256") return format;
  throw new Error(`Unsupported extensions.objectformat: ${value}`);
}

function identityOf(arcIdentity: string | null | undefined, userName: string | null | undefined): ConfiguredIdentity {
  const resolved = resolveIdentityFromValues({
    ...(arcIdentity === undefined ? {} : { arcIdentity }), ...(userName === undefined ? {} : { userName }),
  });
  if (resolved.status === "identified") return { status: "identified", identity: resolved.identity };
  return { status: "no-identity", cause: resolved.status, remedy: IDENTITY_REMEDY };
}
