/** License the local switch by atomically forwarding the departed remote first. */
import type { RefBackendContext } from "./context.js";
import { FORWARDING_REF, readForwardingRecord, writeForwardingRecord } from "./forwarding-record.js";
import { fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { atomicMigrationPush, migrationPushRefusal, type RemoteCopy } from "./migrate-remote-copy.js";
import { commitMigrationRegistry, migrationProjectId } from "./migrate-registry.js";
import type { RecordedRemote } from "./migrate-record.js";

/** A lost registry or absence lease restarts acquisition without switching this clone. */
export async function forwardRemoteMove(code: RefBackendContext, copy: RemoteCopy): Promise<"forwarded" | "restart"> {
  const recorded = copy.recorded;
  if (!recorded) throw new Error("A remote switch requires its recorded copy");
  const prior = await readForwardingRecord(code, copy.source.get(FORWARDING_REF), recorded.record.source.name);
  if (prior.status === "refused") throw new MigrationRefusal(prior.refusal);
  if (!prior.result) {
    const registry = copy.source.get("refs/arc/project/registry");
    if (!registry) throw new Error("A remote move has no captured source registry");
    const projectId = await migrationProjectId(code, registry);
    const forwarding = await writeForwardingRecord(code, { projectId, registryCommit: recorded.record.registryCommit });
    const next = await commitMigrationRegistry(code, registry, "forward");
    await code.migrateStep?.("remote.forward");
    const pushed = await atomicMigrationPush(code, recorded.record.source.pushUrl, [
      { ref: FORWARDING_REF, next: forwarding, expected: null }, { ref: "refs/arc/project/registry", next, expected: registry },
    ]);
    if (pushed.status === "refs" && pushed.refs.some(row => row.status === "rejected" && /stale info|fetch first|non-fast-forward/u.test(row.reason))) return "restart";
    if (pushed.status !== "refs" || pushed.refs.some(row => row.status !== "ok")) throw new MigrationRefusal(migrationPushRefusal(pushed));
    await code.migrateStep?.("remote.forwarded");
  }
  return await holdsOwnForwarding(code, recorded) ? "forwarded" : "restart";
}

async function holdsOwnForwarding(code: RefBackendContext, recorded: RecordedRemote): Promise<boolean> {
  const refs = await fetchMigrationRemote(code, recorded.record.source, true);
  const forwarding = await readForwardingRecord(code, refs.get(FORWARDING_REF), recorded.record.source.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  return forwarding.result?.registryCommit === recorded.record.registryCommit;
}
