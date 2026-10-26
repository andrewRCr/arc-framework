/** Manual receiver-race-only entry: <host> <scratch-url> <evidence-dir> <atomic|single> [settings.json]. */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hostRemote, hostTransport } from "./ref-host-transport.js";
import { probeReceiverLeaseRaces } from "./ref-host-lease-races.js";
import type { HostSettings } from "./ref-host-access.js";

const [host, remote, output, capability, settingsPath] = process.argv.slice(2);
if (!host || !remote || !output || !["atomic", "single"].includes(capability ?? "")) {
  throw new Error("Usage: ref-host-races.ts <host> <scratch-url> <evidence-dir> <atomic|single> [settings.json]");
}
hostRemote(remote, host);
const settings: HostSettings = settingsPath ? JSON.parse(await readFile(settingsPath, "utf8")) as HostSettings : {};
const evidence = resolve(output);
await mkdir(evidence, { recursive: true });
const sourceDigests = Object.fromEntries(await Promise.all(["ref-host-races.ts", "ref-host-lease-races.ts", "ref-host-transport.ts", "ref-host-credential.mjs"]
  .map(async file => [file, createHash("sha256").update(await readFile(new URL(file, import.meta.url))).digest("hex")])));
await writeFile(join(evidence, "source-digests.json"), JSON.stringify(sourceDigests, null, 2) + "\n");
const root = await mkdtemp(join(tmpdir(), "arc-host-races-"));
try {
  const { git } = hostTransport(remote, evidence, settings.owner);
  const results = await probeReceiverLeaseRaces({ root, remote, evidence, git, atomic: capability === "atomic" });
  await writeFile(join(evidence, "run.json"), JSON.stringify({ host, remote, date: new Date().toISOString(), results }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ host, results }) + "\n");
  if (Object.values(results).some(result => result.status === "failed")) process.exitCode = 1;
} finally { await rm(root, { recursive: true, force: true }); }
