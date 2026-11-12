/** Invocation-local native Git bindings for the manual real-host trial. */
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GitExec, GitExecInput, RawGitExec } from "../../src/lib/git/exec.js";
import { createExecaGitExec, createExecaGitExecInput, createExecaRawGitExec, environmentForGitCwd } from "../../src/lib/git/process-executor.js";
import { createDefaultRefStorePorts, createRefStore } from "../../src/lib/store/index.js";

export interface HostCredentials { profile?: string; caFile?: string }
export type HostGit = (label: string, cwd: string, args: string[], trace?: boolean) => Promise<string>;

/** Refuse credential-bearing URLs and permit plaintext transport only for local fixtures. */
export function hostRemote(remote: string, host: string): URL {
  const url = new URL(remote);
  if (url.hostname !== host || url.username || url.password || url.search || url.hash
    || !(url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) {
    throw new Error("Supply credential-free HTTPS, or loopback-only HTTP, on the selected host");
  }
  return url;
}

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/** Bind credentials to each Git invocation without changing global config or the parent environment. */
export function hostTransport(remote: string, evidence: string, credentials: HostCredentials = {}) {
  const url = new URL(remote);
  hostRemote(remote, url.hostname);
  const environment = { ...Object.fromEntries(Object.entries(environmentForGitCwd(".") ?? {})
    .filter(([name]) => name !== "GIT_TRACE_CURL" && name !== "GIT_CURL_VERBOSE")),
    LC_ALL: "C", LANG: "C", GIT_TERMINAL_PROMPT: "0", GIT_TRACE_REDACT: "1", GIT_TRACE_PACKET: "0" };
  const cli = url.hostname === "github.com" ? "gh" : url.hostname === "gitlab.com" ? "glab" : null;
  const helper = credentials.profile
    ? `!${quote(process.execPath)} ${quote(fileURLToPath(new URL("./ref-host-credential.mjs", import.meta.url)))} ${quote(resolve(credentials.profile))} ${quote(url.host)}`
    : cli ? `!${cli} auth git-credential` : undefined;
  const prefix = [...(helper ? ["-c", "credential.helper=", "-c", `credential.${url.origin}.helper=${helper}`] : []),
    ...(credentials.caFile ? ["-c", `http.${url.origin}.sslCAInfo=${resolve(credentials.caFile)}`] : [])];
  const base = createExecaGitExec(undefined, environment);
  const fed = createExecaGitExecInput(undefined, { terminalPrompts: "forbidden", presenters: "forbidden", ambientStdin: "closed" }, environment);
  const exec: GitExec = (command, args, options) => base(command, [...prefix, ...args], options);
  const execInput: GitExecInput = (args, input, options) => fed([...prefix, ...args], input, options);
  const rawExec: RawGitExec = (args, options) => createExecaRawGitExec(options?.cwd, undefined, undefined, environment)([...prefix, ...args], options);
  let sequence = 0;
  const git: HostGit = async (label, cwd, args, trace = false) => {
    const name = `${String(++sequence).padStart(4, "0")}-${label}`;
    const runner = createExecaGitExec(undefined, { ...environment, GIT_TRACE_PACKET: trace ? "1" : "0" });
    try {
      const result = await runner("git", [...prefix, ...args], { cwd, signal: AbortSignal.timeout(120_000), preserveOutput: true,
        interaction: { terminalPrompts: "forbidden", presenters: "forbidden", ambientStdin: "closed" } });
      await writeFile(join(evidence, `${name}.stdout.log`), result.stdout);
      await writeFile(join(evidence, `${name}.stderr.log`), result.stderr ?? "");
      // Stable labels are retained for packet-trace inspection; numbered logs retain every attempt.
      await writeFile(join(evidence, `${label}.stderr.log`), result.stderr ?? "");
      return result.stdout;
    } catch (error) {
      if (error && typeof error === "object" && "stderr" in error) {
        await writeFile(join(evidence, `${name}.stderr.log`), String(error.stderr));
        if ("stdout" in error) await writeFile(join(evidence, `${name}.stdout.log`), String(error.stdout));
      }
      throw error;
    }
  };
  return { git, store: (checkoutRoot: string) => createRefStore({
    ...createDefaultRefStorePorts({ checkoutRoot, exec, execInput, backingRepository: async () => null }), rawExec,
  }) };
}
