/** Install copied comparison heads and apply the new designation in layout-safe order. */
import { join } from "node:path";
import type { Store } from "../contract.js";
import type { RefBackendContext } from "./context.js";
import { directoryExists, readRefDesignation } from "./designation.js";
import { readRefRepository } from "./repository.js";
import { migrationCodeContext, type MoveRemote, type RecordedRemote, type StoreLayout } from "./migrate-record.js";
import { captureMoveRemote } from "./migrate-remote-target.js";
import { readCopiedRemoteRefs } from "./migrate-remote-copy.js";
import { moveRefLayoutAsSwitch } from "./migrate-layout.js";
import { fetchLayoutObjects, requireLayoutTransaction, layoutRefs } from "./migrate-layout-build.js";
import { readSyncRefs } from "./sync-graph.js";
import { MigrationRefusal } from "./migrate-refusal.js";

/** Derive completion from the installed layout and exact configured destination URLs. */
export async function remoteSwitchComplete(context: RefBackendContext, recorded: RecordedRemote): Promise<boolean> {
  const designation = await readRefDesignation(context), destination = recorded.record.destination;
  const current = designation.remotes.find(remote => remote.name === destination.name && remote.repository === destination.repository && remote.role === "push");
  if (!current) return false;
  const physical = await readRefRepository(context);
  if (Boolean(physical.repository?.gitDir) !== (remoteLayout(destination, designation.codeRemote) === "separate")) return false;
  const code = await migrationCodeContext(context);
  if (!await remoteLayoutCleanupComplete(code, remoteLayout(recorded.record.source, designation.codeRemote), remoteLayout(destination, designation.codeRemote))) return false;
  const captured = await captureMoveRemote(context, code, current);
  if (captured.fetchUrl !== destination.fetchUrl || captured.pushUrl !== destination.pushUrl) return false;
  if (recorded.record.source.repository === "backing") return destination.repository === "backing" || designation.backing === null;
  return designation.codeRemotes.find(remote => remote.name === recorded.record.source.name)?.role === "off";
}

/** Borrow the enclosing move's record while its optional layout change holds layout serialization. */
export async function switchRemoteMove(context: RefBackendContext, store: Store, recorded: RecordedRemote): Promise<void> {
  if (await remoteSwitchComplete(context, recorded)) return;
  const code = await migrationCodeContext(context), designation = await readRefDesignation(context);
  const { source, destination } = recorded.record;
  const from = remoteLayout(source, designation.codeRemote), to = remoteLayout(destination, designation.codeRemote);
  if (!context.writeBackingRepository) throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
    condition: "This migration caller has no tracked backing-pointer writer.", remedy: { text: "Run arc store migrate through the store command to finish the recorded switch.", argv: ["arc", "store", "migrate"] } });
  await context.migrateStep?.("remote.pointer");
  try { await context.writeBackingRepository(destination.repository === "backing" ? destination.fetchUrl : null); }
  catch (error) { throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable", condition: `The tracked pointer could not be written: ${error instanceof Error ? error.message : String(error)}`,
    remedy: { text: "Repair the checkout's arc-config.yml and retry arc store migrate.", argv: ["arc", "store", "migrate"] } }); }
  const configuration = {
    prepareTarget: async (target: RefBackendContext): Promise<void> => {
      await installCopiedHeads(code, target, destination.name);
      if (destination.repository === "backing") await configureBacking(target, destination);
    },
    applyDesignation: async (): Promise<void> => applyRemoteDesignation(context, code, recorded),
  };
  await context.migrateStep?.("remote.switch");
  if (from !== to) {
    const result = await moveRefLayoutAsSwitch(context, store, from, to, recorded, configuration);
    if (result.status === "refused") throw new MigrationRefusal(result.refusal);
  } else {
    const release = await context.lock("layout");
    try { await configuration.prepareTarget(await readRefRepository(context)); await configuration.applyDesignation(); }
    finally { await release(); }
  }
  await context.migrateStep?.("remote.switched");
}

function remoteLayout(remote: MoveRemote, codeRemote: string | null): StoreLayout {
  return remote.repository === "code" && remote.name === codeRemote ? "default" : "separate";
}

async function installCopiedHeads(code: RefBackendContext, target: RefBackendContext, remote: string): Promise<void> {
  for (const [part, root] of [["tracking", `refs/arc-remotes/${remote}/`], ["seen", `refs/arc/tmp/seen/${remote}/`]] as const) {
    const captured = await readCopiedRemoteRefs(code, part), prior = await readSyncRefs(target, root);
    await fetchLayoutObjects(target, code.repository?.commonDir ?? "", captured);
    const next = new Map([...captured].map(([ref, tip]) => [root + ref.slice("refs/arc/".length), tip]));
    await requireLayoutTransaction(target, [...[...next].map(([ref, next]) => ({ ref, next, expected: prior.get(ref) ?? null })),
      ...[...prior].filter(([ref]) => !next.has(ref)).map(([ref, expected]) => ({ ref, expected, delete: true as const }))]);
  }
}

async function configureBacking(target: RefBackendContext, destination: MoveRemote): Promise<void> {
  const names = (await target.exec("git", ["remote"], { cwd: target.checkoutRoot })).stdout.split(/\r?\n/u);
  await target.exec("git", ["remote", names.includes("backing") ? "set-url" : "add", "backing", destination.fetchUrl], { cwd: target.checkoutRoot });
  await target.exec("git", ["config", "remote.backing.arc-state", "push"], { cwd: target.checkoutRoot });
}

async function applyRemoteDesignation(context: RefBackendContext, code: RefBackendContext, recorded: RecordedRemote): Promise<void> {
  const { source, destination } = recorded.record;
  if (destination.repository === "code") await code.exec("git", ["config", `remote.${destination.name}.arc-state`, "push"], { cwd: context.checkoutRoot });
  if (source.repository === "code") await code.exec("git", ["config", `remote.${source.name}.arc-state`, "off"], { cwd: context.checkoutRoot });
  else if (destination.repository === "code") {
    const physical = await readRefRepository(context);
    const names = (await physical.exec("git", ["remote"], { cwd: context.checkoutRoot })).stdout.split(/\r?\n/u);
    if (names.includes("backing")) await physical.exec("git", ["remote", "remove", "backing"], { cwd: context.checkoutRoot });
  }
}

async function remoteLayoutCleanupComplete(code: RefBackendContext, source: StoreLayout, destination: StoreLayout): Promise<boolean> {
  if (source === destination) return true;
  if (destination === "separate" && (await layoutRefs(code)).size) return false;
  const common = code.repository?.commonDir;
  if (!common) throw new Error("No common code repository selected");
  for (const name of ["store-migrate-old", "store-migrate-build"]) if (await directoryExists(code, join(common, "arc", name))) return false;
  return true;
}
