/**
 * Manual HTTPS host probes using raw Git, outside every test tier and CI job.
 * Run with: node --import tsx <this-file> <github.com|gitlab.com> <scratch-https-url> <evidence-directory>
 * The designated scratch repository keeps its seeded refs for inspection.
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const [host, remote, output] = process.argv.slice(2);
  if ((host !== "github.com" && host !== "gitlab.com") || !remote || !output) {
    throw new Error("Usage: ref-host-properties.ts <github.com|gitlab.com> <scratch-https-url> <evidence-directory>");
  }
  const url = new URL(remote);
  if (url.protocol !== "https:" || url.hostname !== host || url.username || url.password || url.search || url.hash) {
    throw new Error("Supply a credential-free HTTPS scratch URL on the selected host");
  }
  const evidence = resolve(output);
  await mkdir(evidence, { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "arc-ref-host-"));
  const cli = host === "github.com" ? "gh" : "glab";
  const auth = ["-c", "credential.helper=", "-c", `credential.https://${host}.helper=!${cli} auth git-credential`];
  const inherited = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => name !== "GIT_TRACE_CURL" && name !== "GIT_CURL_VERBOSE"));
  const env = { ...inherited, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GIT_TRACE_REDACT: "1" };
  async function git(label: string, cwd: string, args: string[], trace = false): Promise<string> {
    const pending = execFileAsync("git", [...auth, ...args], {
      cwd, env: { ...env, GIT_TRACE_PACKET: trace ? "1" : "0" },
      timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    });
    pending.child.stdin?.end();
    const result = await pending.catch(async (error: unknown) => {
      if (error && typeof error === "object" && "stderr" in error) {
        await writeFile(join(evidence, `${label}.stderr.log`), String(error.stderr));
      }
      throw error;
    });
    await writeFile(join(evidence, `${label}.stdout.log`), result.stdout);
    await writeFile(join(evidence, `${label}.stderr.log`), result.stderr);
    return result.stdout;
  }
  try {
    const version = (await git("version", root, ["--version"])).trim();
    const source = join(root, "source");
    const target = join(root, "target");
    await git("init-source", root, ["init", "--bare", source]);
    await git("init-target", root, ["init", "--bare", target]);
    const tree = (await git("empty-tree", source, ["hash-object", "-w", "-t", "tree", "--stdin"])).trim();
    const wanted = ["refs/arc/host-probe/a", "refs/arc/host-probe/b"];
    const seeded = [...wanted, "refs/heads/main"];
    const before = (await git("before", source, ["ls-remote", "--refs", "--", remote])).trim();
    const old = new Map(before.split("\n").filter(Boolean).map((line) => {
      const [tip = "", ref = ""] = line.split(/\s+/u);
      return [ref, tip];
    }));
    if ([...old.keys()].some((ref) => !seeded.includes(ref))) {
      throw new Error("The scratch repository contains other refs; use a fresh empty scratch repository");
    }
    const previous = old.get("refs/heads/main");
    if (previous) await git("seed-parent", source, ["fetch", "--no-tags", "--", remote, "refs/heads/main"]);
    const oid = (await git("seed-commit", source, [
      "-c", "user.name=Host probe", "-c", "user.email=host-probe@example.invalid", "commit-tree", tree,
      ...(previous ? ["-p", previous] : []), "-m", "Host capability probe",
    ])).trim();
    await git("push", source, [
      "push", "--porcelain", "--atomic", ...seeded.map((ref) => `--force-with-lease=${ref}:${old.get(ref) ?? ""}`),
      "--", remote, ...seeded.map((ref) => `${oid}:${ref}`),
    ], true);
    await git("fetch", target, [
      "-c", "protocol.version=2", "fetch", "--no-tags", "--no-write-fetch-head", "--no-recurse-submodules",
      "--", remote, "+refs/arc/*:refs/arc/probe-tracking/*",
    ], true);
    const pushTrace = await readFile(join(evidence, "push.stderr.log"), "utf8");
    const fetchTrace = await readFile(join(evidence, "fetch.stderr.log"), "utf8");
    const version2 = /packet:.*< version 2(?:\r?\n|$)/u.test(fetchTrace);
    const prefix = /packet:.*> ref-prefix refs\/arc\/(?:\r?\n|$)/u.test(fetchTrace);
    const advertised = [...new Set([...fetchTrace.matchAll(/packet:\s+\S+< [0-9a-f]{40,64} (refs\/[^\s]+)(?:\s|$)/gu)]
      .map((match) => match[1]))].sort();
    const narrowed = wanted.length === advertised.length && wanted.every((ref) => advertised.includes(ref));
    const atomic = /packet:.*< .*\\0[^\n]*\batomic\b/u.test(pushTrace);
    const result = {
      host, remote, date: new Date().toISOString(), version, seeded, advertised,
      protocolV2: version2, requestedPrefix: prefix, advertisementNarrowed: narrowed, atomicOverHttps: atomic,
    };
    await writeFile(join(evidence, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!version2 || !prefix || !narrowed || !atomic) process.exitCode = 1;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await main();
