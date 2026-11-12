/** Producer bytes, physical paths and pinned Git faults for interim substrates. */
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RecordReferenceSchema, type RecordReference } from "../../../src/lib/store/index.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { readTransientIdentitySnapshot } from "../../../src/lib/errand/identity-snapshot.js";
import { hashBlob, writeTreeCommit, errandsRef } from "../../../src/lib/errand/ref-tree.js";
import { MAX_LOCUS_JSON_BYTES } from "../../../src/lib/locus/schema/index.js";
import type { StorePorts } from "../../../src/lib/store/ports.js";
import type { PlantKind } from "./fixture-contract.js";

/** Produce canonical transient bytes keyed to their actual caller reference.
 * @param reference - Errand or claim address.
 * @param variant - Valid content revision or decoder-rejected bytes.
 * @returns Bytes from the authoritative serializer for every valid revision.
 */
export function transientContent(reference: RecordReference, variant = "valid"): string {
  if (variant === "invalid") return "invalid identity JSON\n";
  const slug = reference.kind === "work-item/record" ? reference.owner.name : String(reference.key);
  const revision = variant === "changed-again" ? 3 : variant === "changed" ? 2 : 1;
  const common = { version: 3, slug, claimId: "1".repeat(32), createdAt: "2026-08-12T00:00:00.000Z", updatedAt: `2026-08-12T00:00:0${revision}.000Z` };
  const role = reference.kind === "claims/groom" ? { kind: "groom", anchorStub: slug.slice("groom-".length), members: [slug.slice("groom-".length)], openedBaseHead: "a".repeat(40), protection: "partial", branch: null, state: "open", changeRequest: null }
    : { kind: "errand", purpose: reference.kind === "claims/housekeep" ? "housekeep-routing" : "errand", branch: `chore/${slug}`, state: "open", savedHead: null, changeRequest: null,
      ...(reference.kind === "work-item/record" ? { origin: "description", originEntry: null, intent: `Conformance intent ${revision}` } : {}) };
  return serializeTransientIdentityRecord(TransientIdentityRecordSchema.parse({ ...common, ...role }));
}

/** Locate personal roles through their existing identity and workspace address shapes.
 * @param root - Actual checkout holding the identity directory.
 * @param reference - Personal role address.
 * @returns Absolute path of the fixture's stored personal file.
 */
export function personalPath(root: string, reference: RecordReference): string {
  const path = reference.kind === "personal/inbox" ? "USER-INBOX.md" : reference.kind === "personal/working-memory" ? "WORKING-MEMORY.md"
    : reference.kind === "personal/session-context" ? `${String(reference.key)}/SESSION-NOTES.md` : String(reference.key);
  return join(root, ".arc/user", reference.owner.name, path);
}

/** Hold physical permission faults until teardown restores their paths.
 * @param paths - Fixture-owned restoration set.
 * @param path - File or directory to make inaccessible.
 * @returns After the operating system permission change lands.
 */
export async function denyPath(paths: Set<string>, path: string): Promise<void> { paths.add(path); await chmod(path, 0); }

/** Plant a real immutable blob and ref tree, retaining every other entry.
 * @param ports - Actual Git boundaries used by the public Store.
 * @param reference - Faulted key.
 * @param kind - Snapshot fault, including unknown content version via the format hook.
 * @returns After its exact blob is installed and an unreadable fault is bound to that OID.
 */
export async function plantTransient(ports: StorePorts, reference: RecordReference, kind: PlantKind): Promise<void> {
  const identity = await ports.identity();
  if (identity === null) throw new Error("Transient planting requires configured identity");
  const snapshot = await readTransientIdentitySnapshot({ exec: ports.exec, identity });
  if (snapshot.kind !== "complete") throw new Error("Transient planting requires an existing complete ref");
  if (kind === "family-unreadable") {
    const blob = await hashBlob(ports.execInput, "Not a regular record\n");
    const tree = (await ports.execInput(["mktree"], `100755 blob ${blob}\tinvalid-mode\n`)).trim();
    const tip = (await ports.exec("git", ["commit-tree", tree, "-p", snapshot.tip, "-m", "Plant unreadable identity tree"])).stdout.trim();
    await ports.exec("git", ["update-ref", errandsRef(identity), tip, snapshot.tip]);
    return;
  }
  const key = reference.kind === "work-item/record" ? reference.owner.name : String(reference.key);
  const wrong = RecordReferenceSchema.parse({ ...reference, ...(reference.kind === "work-item/record" ? { owner: { ...reference.owner, name: "wrong-owner" } } : { key: reference.kind === "claims/groom" ? "groom-wrong-owner" : "wrong-owner" }) });
  const bytes = kind === "malformed" ? "invalid identity JSON\n" : kind === "oversized" ? " ".repeat(MAX_LOCUS_JSON_BYTES + 1)
    : kind === "unknown-format-version" ? '{"version":9}\n' : transientContent(kind === "key-mismatch" ? wrong : reference);
  const oid = await hashBlob(ports.execInput, bytes);
  const objects = new Map(snapshot.objects); objects.set(key, oid);
  await writeTreeCommit({ exec: ports.exec, execInput: ports.execInput, identity }, objects, "Plant conformance entry", [snapshot.tip], snapshot.tip);
  if (kind === "unreadable") {
    const exec = ports.exec;
    ports.exec = async (command, args, options) => {
      if (args[0] === "cat-file" && args[1] === "blob" && args[2] === oid) throw Object.assign(new Error(`Cannot read stored blob ${oid}`), { code: "EIO" });
      return exec(command, args, options);
    };
  }
}

/** Persist personal unreadability through the real filesystem.
 * @param root - Actual checkout.
 * @param reference - Personal address.
 * @param kind - Supported raw-file fault.
 * @param denied - Paths restored before fixture cleanup.
 * @returns After the permission fault lands.
 */
export async function plantPersonal(root: string, reference: RecordReference, kind: PlantKind, denied: Set<string>): Promise<void> {
  if (kind === "unreadable") return denyPath(denied, personalPath(root, reference));
  if (kind === "family-unreadable") return denyPath(denied, join(root, ".arc/user", reference.owner.name));
  await writeFile(personalPath(root, reference), kind === "oversized" ? " ".repeat(MAX_LOCUS_JSON_BYTES + 1) : "arbitrary personal bytes\n");
}
