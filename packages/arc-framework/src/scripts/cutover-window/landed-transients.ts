/** Plain Git acquisition of landed transient records, without the store listing's manifest writes. */
import { listWindowRefs, type WindowGitReadIO } from "./git.js";
import { WindowRefusal } from "./result.js";
import type { WindowTransientRecord } from "./transients.js";
import { KIND_REGISTRY } from "../../lib/store/registry.js";
import { OwnerIdentitySchema, RecordReferenceSchema, type OwnerIdentity } from "../../lib/store/identity.js";
import { expandStoredPath } from "../../lib/store/stored-path.js";
import { matchesFamilyRef } from "../../lib/store/ref/codec.js";
import { decodeStoredKindReference, fixedStoredPathKind } from "../../lib/store/ref/path-decode.js";
import { RefMetadataSchema } from "../../lib/store/ref/metadata.js";
import { TransientIdentityRecordSchema } from "../../lib/errand/identity-record.js";
import { canonicalize } from "../../lib/kernel/canonical/canonical-json.js";

const transientKinds = new Set(["claims/groom", "claims/housekeep", "work-item/record", "work-item/description"]);
async function blob(io: WindowGitReadIO, tip: string, path: string): Promise<string> {
  return (await io.exec("git", ["--no-replace-objects", "show", `${tip}:${path}`],
    { cwd: io.repo, objectAccess: "local-only", preserveOutput: true })).stdout;
}

async function workOwner(io: WindowGitReadIO, ref: string, tip: string): Promise<OwnerIdentity> {
  const uid = ref.split("/").at(-1);
  const probe = RecordReferenceSchema.parse({ kind: "work-item/record", owner: { type: "work-item", name: "unknown", uid } });
  const metadata = RefMetadataSchema.parse(JSON.parse(await blob(io, tip, expandStoredPath(probe).metadataPath)));
  return OwnerIdentitySchema.parse({ type: "work-item", name: metadata.slug, uid });
}

function errandIdentity(ref: string, records: readonly { kind: string; content: string }[]): string {
  const content = records.find(record => record.kind === "work-item/record")?.content;
  const record = content === undefined ? undefined : TransientIdentityRecordSchema.parse(JSON.parse(content));
  if (record?.kind === "errand" && record.purpose === "errand" && record.owner) return `refs/arc/user/${record.owner}/errands`;
  throw new WindowRefusal([{ subject: ref, condition: `Landed transient records have no readable source identity: ${JSON.stringify(records)}`,
    remedy: "Preserve the landed store and settle these records before retrying the consumed-input comparison." }]);
}

/** Acquire every landed claim and Errand record or description at captured immutable tips. */
export async function readLandedWindowTransients(io: WindowGitReadIO): Promise<WindowTransientRecord[]> {
  const tips = await listWindowRefs(io, ["refs/arc/user/", "refs/arc/work/"]);
  const records: WindowTransientRecord[] = [];
  for (const [ref, tip] of tips) {
    const family = matchesFamilyRef(ref, "claims") ? "claims" : matchesFamilyRef(ref, "work-item") ? "work-item" : null;
    if (family === null) continue;
    records.push(...await recordsAt(io, ref, tip, family));
  }
  return records;
}

async function recordsAt(io: WindowGitReadIO, ref: string, tip: string,
  family: "claims" | "work-item"): Promise<WindowTransientRecord[]> {
  const records: WindowTransientRecord[] = [];
  const { stdout } = await io.exec("git", ["--no-replace-objects", "ls-tree", "-r", "-z", "--name-only", tip],
    { cwd: io.repo, objectAccess: "local-only", preserveOutput: true });
  const selected = stdout.split("\0").filter(Boolean).flatMap(path => {
    const kind = fixedStoredPathKind(KIND_REGISTRY, family, path);
    return kind && transientKinds.has(kind) ? [{ kind, path }] : [];
  });
  if (selected.length === 0) return [];
  const owner = family === "claims" ? OwnerIdentitySchema.parse({ type: "person", name: ref.split("/")[3] }) : await workOwner(io, ref, tip);
  const acquired = await Promise.all(selected.map(async entry => ({ ...entry, content: await blob(io, tip, entry.path) })));
  const source = family === "claims" ? `refs/arc/user/${owner.name}/errands` : errandIdentity(ref, acquired);
  for (const { kind, path, content } of acquired) {
    const reference = decodeStoredKindReference(KIND_REGISTRY[kind], owner, path);
    if (reference === null) throw new WindowRefusal([{ subject: `${ref}:${path}`, condition: `The landed path names no matching record: ${content}`,
      remedy: "Preserve the landed store and repair its record coordinates before retrying the comparison." }]);
    records.push({ ref: source, reference, content: kind === "work-item/description" ? content : canonicalize(JSON.parse(content)) });
  }
  return records;
}
