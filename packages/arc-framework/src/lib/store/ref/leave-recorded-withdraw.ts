/** Withdraw only the recorded mover's forwarding control under its remote registry lease. */
import type { RefBackendContext } from "./context.js";
import type { RecordedRemote } from "./migrate-record.js";
import { fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { FORWARDING_REF, readForwardingRecord } from "./forwarding-record.js";
import { commitMigrationRegistry } from "./migrate-registry.js";
import { atomicMigrationPush, migrationPushLanded } from "./migrate-remote-copy.js";
import { MigrationRefusal } from "./migrate-refusal.js";

/** A missing registry means an earlier delete landed; a different forwarding record is never removed. */
export async function withdrawRecordedSource(code: RefBackendContext, recorded: RecordedRemote): Promise<boolean> {
  try { return await withdrawRounds(code, recorded); }
  catch (error) {
    if (!(error instanceof MigrationRefusal) || error.refusal.code !== "store") throw error;
    const refusal = error.refusal.refusal;
    if (refusal.code === "command-line-capacity") throw error;
    throw new MigrationRefusal({ code: "store", refusal: { ...refusal, remedy: {
      text: `Make ${recorded.record.source.fetchUrl} readable and writable, then retry arc store migrate --leave-source. Where both remotes are gone for good, run git update-ref -d refs/arc/tmp/migrate/move in the code repository to end this record with nothing withdrawn, then leave the source to a restored home.` } } });
  }
}

async function withdrawRounds(code: RefBackendContext, recorded: RecordedRemote): Promise<boolean> {
  for (;;) {
    const refs = await fetchMigrationRemote(code, recorded.record.source, false);
    const registry = refs.get("refs/arc/project/registry");
    if (!registry) return false;
    const tip = refs.get(FORWARDING_REF);
    const moved = await readForwardingRecord(code, tip, recorded.record.source.name);
    if (moved.status === "refused") throw new MigrationRefusal(moved.refusal);
    if (!moved.result) return true;
    if (moved.result.registryCommit !== recorded.record.registryCommit) throw new MigrationRefusal({ code: "moved", class: "recoverable",
      condition: "Another move now owns the source's forwarding record; this recorded move cannot withdraw it.",
      remedy: { text: "Follow the current move or restore the source's intended control before retrying this record ending." } });
    if (!tip) throw new Error("A parsed forwarding record has no ref tip");
    const next = await commitMigrationRegistry(code, registry, "forward");
    await code.migrateStep?.("leave.withdraw");
    const changes = [{ ref: FORWARDING_REF, next: null, expected: tip }, { ref: "refs/arc/project/registry", next, expected: registry }];
    const pushed = await atomicMigrationPush(code, recorded.record.source.pushUrl, changes);
    if (!await migrationPushLanded(code, recorded.record.source.pushUrl, changes, pushed,
      { text: "Retry arc store migrate --leave-source to withdraw this recorded source control.", argv: ["arc", "store", "migrate", "--leave-source"] })) continue;
    await code.migrateStep?.("leave.withdrawn");
    return true;
  }
}
