/** Launch ARC commands in a copy's checkouts, under a search path that holds no other ARC executable. */
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { sanitizeGitRepositoryEnvironment } from "../../lib/git/process-executor.js";

const launcherPath = ["packages", "arc-framework", "bin", "arc.js"];
const bundlePath = ["packages", "arc-framework", "dist", "cli.js"];

/** One ARC command's launch: the argv before its own arguments, its directory, and whether it is the checkout's own build. */
export interface WindowRehearsalLaunch { argv: readonly string[]; cwd: string; own: boolean }
/** Select how ARC commands run in one copied checkout. */
export type WindowRehearsalLauncher = (checkout: string) => Promise<WindowRehearsalLaunch>;
/** A finished ARC command and what it printed. */
export interface WindowRehearsalCommand {
  argv: readonly string[]; cwd: string; exitCode: number; stdout: string; stderr: string; wallMs: number;
}
/** The environment every ARC command in the copy shares, and an argv prefix that bounds a command. */
export interface WindowRehearsalCommandEnvironment { path: string; env?: Readonly<Record<string, string>>; prefix?: readonly string[] }

/** Each checkout's own built CLI, or the primary copy's run from that checkout where it has none. */
export function defaultWindowRehearsalLauncher(primary: string): WindowRehearsalLauncher {
  return async checkout => {
    const own = await hasBuiltCli(checkout);
    return { argv: [process.execPath, join(own ? checkout : primary, ...launcherPath)], cwd: checkout, own };
  };
}

async function hasBuiltCli(checkout: string): Promise<boolean> {
  try {
    return (await lstat(join(checkout, ...bundlePath))).isFile();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

/** Rebuild the primary copy's CLI from its own source and dependencies. */
export async function rebuildWindowRehearsalPrimary(primary: string, path: string): Promise<void> {
  const result = await runWindowRehearsalCommand({ argv: ["npm", "run", "-s", "build:fast"], cwd: primary, own: true }, [], { path });
  if (result.exitCode !== 0) throw new Error(`Rebuilding the primary copy exited ${result.exitCode}: ${result.stderr.trim()}`);
}

/** Run one ARC command to completion, keeping its exit status and output whatever it returns. */
export async function runWindowRehearsalCommand(launch: WindowRehearsalLaunch, args: readonly string[],
  environment: WindowRehearsalCommandEnvironment): Promise<WindowRehearsalCommand> {
  const argv = [...environment.prefix ?? [], ...launch.argv, ...args];
  const [file, ...rest] = argv;
  if (file === undefined) throw new Error("An ARC command needs an executable.");
  const inherited = Object.entries(sanitizeGitRepositoryEnvironment(process.env)).filter(([name]) => name.toUpperCase() !== "PATH");
  const env = { ...Object.fromEntries(inherited), PATH: environment.path,
    ARC_DISABLE_UPDATE_CHECKS: "1", NO_COLOR: "1", FORCE_COLOR: "0", ...environment.env };
  const started = performance.now();
  const result = await execa(file, rest, { cwd: launch.cwd, env, extendEnv: false, reject: false, stdin: "ignore",
    stripFinalNewline: false });
  return { argv, cwd: launch.cwd, exitCode: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr,
    wallMs: Math.round(performance.now() - started) };
}
