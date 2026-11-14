/** What the import's publication placed on the mirror: every ref the state push publishes, at the copy's object. */
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { listWindowRefs } from "./git.js";
import { isWindowPublishableRef } from "./restore-leases.js";
import { WindowRehearsalStop, type WindowRehearsalContext } from "./rehearse-run.js";

const registry = "refs/arc/project/registry";

/** Each ref the state push publishes for the identity that the mirror lacks or holds at another object. */
export function unpublishedRehearsalRefs(local: ReadonlyMap<string, string>, mirror: ReadonlyMap<string, string>,
  identity: string | null): string[] {
  return [...local].filter(([ref, tip]) => isWindowPublishableRef(ref, identity) && mirror.get(ref) !== tip)
    .map(([ref, tip]) => `${ref}: copy ${tip}, mirror ${mirror.get(ref) ?? "absent"}`);
}

/** Read the copy's and the mirror's store refs, stopping on any published ref the mirror does not hold; returns their count. */
export async function observeRehearsalPublication(context: WindowRehearsalContext): Promise<number> {
  const identity = await createDefaultStorePorts({ checkoutRoot: context.layout.repo }).identity();
  const read = (repo: string) => listWindowRefs({ repo, exec: context.exec }, ["refs/arc/"]);
  const [local, mirror] = await Promise.all([read(context.layout.repo), read(context.layout.mirror)]);
  const published = [...local.keys()].filter(ref => isWindowPublishableRef(ref, identity));
  if (!published.includes(registry)) throw new WindowRehearsalStop("The copy holds no project registry after the import.");
  const missing = unpublishedRehearsalRefs(local, mirror, identity);
  if (missing.length > 0) throw new WindowRehearsalStop(`The mirror does not hold these published store refs:\n${missing.join("\n")}`);
  return published.length;
}
