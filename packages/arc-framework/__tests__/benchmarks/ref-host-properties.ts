/**
 * Manual real-host probes, outside every test tier and CI job.
 * Run: node --import tsx <this-file> <host> <scratch-url> <evidence-directory> [settings.json]
 * Settings supply local credential-profile paths and provider role/fork controls.
 * HTTPS is required except for loopback-only HTTP fixtures. No credentials belong in URLs.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { probeBackend } from "./ref-host-backend.js";
import { hostRemote, hostTransport } from "./ref-host-transport.js";
import type { HostSettings } from "./ref-host-access.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";

async function main(): Promise<void> {
  const [host, remote, output, settingsPath] = process.argv.slice(2);
  if (!host || !remote || !output) {
    throw new Error("Usage: ref-host-properties.ts <host> <scratch-https-url> <evidence-directory>");
  }
  hostRemote(remote, host);
  const settings = settingsPath ? JSON.parse(await readFile(settingsPath, "utf8")) as HostSettings : {};
  const evidence = resolve(output);
  await mkdir(evidence, { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "arc-ref-host-"));
  const source = join(root, "source");
  const protocolOwned = new Map<string, string>();
  const transport = hostTransport(remote, evidence, settings.owner);
  const { git } = transport;
  try {
    const version = (await git("version", root, ["--version"])).trim();
    const target = join(root, "target");
    await git("init-source", root, ["init", "--bare", source]);
    await git("init-target", root, ["init", "--bare", target]);
    const tree = (await git("empty-tree", source, ["hash-object", "-w", "-t", "tree", "--stdin"])).trim();
    const wanted = ["refs/arc/host-probe/a", "refs/arc/host-probe/b"];
    const seeded = wanted;
    const before = (await git("before", source, ["ls-remote", "--refs", "--", remote])).trim();
    const old = new Map(before.split("\n").filter(Boolean).map((line) => {
      const [tip = "", ref = ""] = line.split(/\s+/u);
      return [ref, tip];
    }));
    if (wanted.some(ref => old.has(ref))) throw new Error("The protocol probe refs must be absent before starting");
    const previous = old.get("refs/heads/main");
    if (previous) await git("seed-parent", source, ["fetch", "--no-tags", "--", remote, "refs/heads/main"]);
    const oid = (await git("seed-commit", source, [
      "-c", "user.name=Host probe", "-c", "user.email=host-probe@example.invalid", "commit-tree", tree,
      ...(previous ? ["-p", previous] : []), "-m", "Host capability probe",
    ])).trim();
    let unsupported: string | undefined;
    try {
      await git("push", source, [
        "push", "--porcelain", "--atomic", ...seeded.map((ref) => `--force-with-lease=${ref}:${old.get(ref) ?? ""}`),
        "--", remote, ...seeded.map((ref) => `${oid}:${ref}`),
      ], true);
    } catch (error) {
      if (!isGitProcessError(error) || !error.stderr.includes("the receiving end does not support --atomic push")) throw error;
      unsupported = error.stderr;
      await writeFile(join(evidence, "push.stderr.log"), error.stderr);
      for (const ref of seeded) {
        await git(`non-atomic-seed-${ref.at(-1)}`, source,
          ["push", "--porcelain", `--force-with-lease=${ref}:`, "--", remote, `${oid}:${ref}`]);
        protocolOwned.set(ref, oid);
      }
    }
    for (const ref of wanted) protocolOwned.set(ref, oid);
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
    const expected = [...new Set([...old.keys()].filter(ref => ref.startsWith("refs/arc/")).concat(wanted))].sort();
    const narrowed = expected.length === advertised.length && expected.every((ref) => advertised.includes(ref));
    const atomic = /packet:.*< .*\\0[^\n]*\batomic\b/u.test(pushTrace);
    const result = {
      host, remote, date: new Date().toISOString(), version, seeded, advertised,
      protocolV2: version2, requestedPrefix: prefix, advertisementNarrowed: narrowed, atomicOverHttps: atomic,
      ...(unsupported ? { unsupportedAtomic: unsupported } : {}),
    };
    await writeFile(join(evidence, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!version2 || !prefix || !narrowed || !atomic) process.exitCode = 1;
    {
      const backend = await probeBackend({ root, remote, evidence, git, store: transport.store, settings, atomic });
      process.stdout.write(`${JSON.stringify(backend, null, 2)}\n`);
      if (Object.values(backend).some(probe => probe.status !== "passed")) process.exitCode = 1;
    }
  } finally {
    try {
      for (const [ref, tip] of protocolOwned) await git(`protocol-cleanup-${ref.at(-1)}`, source,
        ["push", "--porcelain", `--force-with-lease=${ref}:${tip}`, "--", remote, `:${ref}`]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
}

await main();
