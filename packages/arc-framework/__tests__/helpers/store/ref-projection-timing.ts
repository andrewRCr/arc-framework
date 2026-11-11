/** Prepared native projection datasets cloned from producer-created state trees and creation receipts. */
import { randomUUID } from "node:crypto";
import { createDefaultRefStorePorts, createRefStore, RecordReferenceSchema, CreatedOwnerSchema, BatchCreationReceiptSchema,
  compareCreatedOwners, type Mutation, type RecordReference, type WritePlacement } from "../../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { renderStoreCommitMessage } from "../../../src/lib/store/commit-provenance.js";
import { appendStoreCreationReceipt } from "../../../src/lib/store/commit-creation-receipt.js";
import { setMetaBranch } from "../../../src/lib/active/meta-reader.js";
import { prepareRepositoryTemplate, copyPreparedRepository, type PreparedRepositoryTemplate } from "../prepared-repository.js";
import { createRefTestRepository } from "./ref-plant.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { success } from "./suite-tools.js";
import { configureEngineCheckout } from "./projection/engine-fixture.js";

type Role = "backlog" | "active" | "archive";
interface TreeFile { path: string; content: string }
interface Prototype { name: string; uid: string; batchId: string; files: TreeFile[] }
/** Stable owners shared by the baseline and expanded archive; adding files adds no owner or history refs. */
export interface ProjectionTimingOwner { readonly role: Role; readonly reference: RecordReference; readonly quarter: string | null }
/** A small producer check can use the same builder as the dispatched full datasets. */
export interface ProjectionTimingCounts { backlog: number; active: number; archived: number; quarters: number; archiveExtra: number }

const provenance = { verb: "fixture", lifecycleAction: "seed" };
const registryRef = "refs/arc/project/registry";
const prototypeQuarter = "2024-q1";

class ImportStream {
  private readonly chunks: string[] = ["feature done\n"];
  private readonly blobs = new Map<string, number>();
  private mark = 0;
  blob(content: string): number {
    const previous = this.blobs.get(content);
    if (previous !== undefined) return previous;
    const mark = ++this.mark;
    this.chunks.push(`blob\nmark :${mark}\ndata ${Buffer.byteLength(content)}\n${content}\n`);
    this.blobs.set(content, mark);
    return mark;
  }
  commit(ref: string, files: readonly { path: string; mark: number }[], message: string): void {
    this.chunks.push(`commit ${ref}\ncommitter Projection Fixture <projection@example.test> 1767225600 +0000\ndata ${Buffer.byteLength(message)}\n${message}\ndeleteall\n`);
    for (const file of files) this.chunks.push(`M 100644 :${file.mark} ${file.path}\n`);
    this.chunks.push("\n");
  }
  finish(): Buffer { return Buffer.from(this.chunks.join("") + "done\n"); }
}

async function readNativeTree(ports: ReturnType<typeof createDefaultRefStorePorts>, ref: string): Promise<TreeFile[]> {
  const listing = new TextDecoder().decode((await ports.rawExec(["ls-tree", "-r", "--format=%(objectname)%x09%(path)", ref])).stdout)
    .trim().split("\n").filter(Boolean).map(line => line.split("\t"));
  const bytes = Buffer.from((await ports.rawExec(["cat-file", "--batch"], { input: Buffer.from(listing.map(row => row[0]).join("\n") + "\n") })).stdout);
  let offset = 0;
  return listing.map(row => {
    const end = bytes.indexOf(10, offset), header = bytes.subarray(offset, end).toString("utf8").split(" ");
    if (end < offset || header[1] !== "blob" || row[1] === undefined) throw new Error("Invalid native prototype blob stream");
    const length = Number(header[2]), start = end + 1;
    if (!Number.isSafeInteger(length) || length < 0 || start + length >= bytes.length) throw new Error("Truncated native prototype blob stream");
    offset = start + length + 1;
    return { path: row[1], content: bytes.subarray(start, start + length).toString("utf8") };
  });
}

async function createPrototype(store: ReturnType<typeof createRefStore>, ports: ReturnType<typeof createDefaultRefStorePorts>,
  role: Role, extras: number): Promise<Prototype> {
  const name = `prototype-${role}-${extras}`;
  const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } });
  const placement: WritePlacement = role === "archive" ? { kind: "completed", quarter: ArchiveQuarterSchema.parse(prototypeQuarter) }
    : role === "backlog" ? { kind: "backlog", commitment: "planned" } : { kind: "active" };
  const meta = makeMetaFixture(name, { state: role === "archive" ? "Shipped" : role === "backlog" ? "Planning" : "Active",
    owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: role === "active" ? "process-task-loop" : null });
  const writes: Mutation[] = [{ action: "put", expected: null, reference,
    content: role === "active" ? setMetaBranch(meta, `feat/${name}`)
      : role === "archive" ? meta + "\nArchive context.\n" + "Stored archive context. ".repeat(1500) + "\n" : meta, placement }];
  if (role !== "archive") writes.push({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/notes", owner: reference.owner }), content: "Opening.\nStored notes.\nClosing.\n" });
  for (let i = 0; i < extras; i++) writes.push({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/companion", owner: reference.owner, key: `extra-${String(i).padStart(4, "0")}` }),
    content: `Archived companion ${i}.\n` });
  const result = success(await store.batch({ writes, provenance })), owner = result.writes[0]?.reference.owner;
  if (owner?.type !== "work-item" || owner.uid === undefined) throw new Error("Native projection prototype has no generation");
  return { name, uid: owner.uid, batchId: result.batchId,
    files: await readNativeTree(ports, `refs/arc/${role === "archive" ? "history/work" : "work"}/${owner.uid}`) };
}

function coordinates(counts: ProjectionTimingCounts): ProjectionTimingOwner[] {
  return (["backlog", "active", "archive"] as const).flatMap(role => {
    const count = role === "backlog" ? counts.backlog : role === "active" ? counts.active : counts.archived;
    return Array.from({ length: count }, (_, i) => ({ role,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: `timing-${role}-${String(i).padStart(4, "0")}`, uid: randomUUID() } }),
      quarter: role === "archive" ? `${2024 + Math.floor((i % counts.quarters) / 4)}-q${i % counts.quarters % 4 + 1}` : null }));
  });
}

function importStream(owners: readonly ProjectionTimingOwner[], prototypes: Record<Role, Prototype>, registry: readonly TreeFile[], registryMessage: string): Buffer {
  const stream = new ImportStream();
  stream.commit(registryRef, registry.map(file => ({ path: file.path, mark: stream.blob(file.content) })), registryMessage);
  const groups = new Map<string, ProjectionTimingOwner[]>();
  for (const owner of owners) {
    const group = owner.quarter ?? owner.role;
    groups.set(group, [...groups.get(group) ?? [], owner]);
  }
  for (const members of groups.values()) {
    const batchId = randomUUID();
    const receipt = BatchCreationReceiptSchema.parse({ schemaVersion: 1, batchId,
      createdOwners: members.map(member => CreatedOwnerSchema.parse({ kind: member.reference.kind, owner: member.reference.owner })).sort(compareCreatedOwners) });
    const message = (reference: RecordReference) => appendStoreCreationReceipt(renderStoreCommitMessage(provenance, reference, batchId), receipt);
    const archived: { path: string; mark: number }[] = [];
    for (const [i, member] of members.entries()) {
      const prototype = prototypes[member.role], owner = member.reference.owner;
      if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Missing timing owner generation");
      const uid = owner.uid;
      const substitute = (value: string) => value.replaceAll(prototype.uid, uid).replaceAll(prototype.name, owner.name)
        .replaceAll(prototype.batchId, batchId).replaceAll(prototypeQuarter, member.quarter ?? prototypeQuarter);
      const files = prototype.files.map(file => ({ path: substitute(file.path), mark: stream.blob(substitute(file.content)) }));
      stream.commit(`refs/arc/${member.role === "archive" ? "history/work" : "work"}/${owner.uid}`, files, message(member.reference));
      if (member.quarter !== null) archived.push(...files.map(file => ({ ...file,
        path: `${String(i + 1).padStart(2, "0")}_${owner.name}/${file.path}` })));
    }
    const first = members[0];
    if (first !== undefined && first.quarter !== null) stream.commit(`refs/arc/archive/${first.quarter}`, archived, message(first.reference));
  }
  return stream.finish();
}

/** Build baseline and large-archive templates with the same project and owner coordinates from native producer trees. */
export async function createProjectionTimingTemplates(overrides: Partial<ProjectionTimingCounts> = {}) {
  const counts: ProjectionTimingCounts = { backlog: 140, active: 20, archived: 480, quarters: 4, archiveExtra: 124, ...overrides };
  const producer = await createRefTestRepository("files", "sha1");
  const repositories: Awaited<ReturnType<typeof createRefTestRepository>>[] = [];
  const cleanup = async () => { for (const repository of repositories.reverse()) await repository.cleanup(); };
  try {
    await producer.exec("git", ["config", "arc.identity", "andrew"]);
    const ports = createDefaultRefStorePorts({ checkoutRoot: producer.root, backingRepository: async () => null }), store = createRefStore(ports);
    success(await store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
      content: JSON.stringify({ projectId: randomUUID() }), provenance: { verb: "init", lifecycleAction: "create" } }));
    const backlog = await createPrototype(store, ports, "backlog", 0), active = await createPrototype(store, ports, "active", 0);
    const archive = await createPrototype(store, ports, "archive", 0), expanded = await createPrototype(store, ports, "archive", counts.archiveExtra);
    const registry = await readNativeTree(ports, registryRef), owners = coordinates(counts);
    const registryMessage = new TextDecoder().decode((await ports.rawExec(["show", "-s", "--format=%B", registryRef])).stdout);
    const build = async (large: boolean): Promise<PreparedRepositoryTemplate> => {
      const key = `projection-${large ? "large" : "baseline"}-${JSON.stringify(counts)}`;
      return prepareRepositoryTemplate({ kind: "plain", key }, async () => {
        const repository = await createRefTestRepository("files", "sha1"); repositories.push(repository);
        await configureEngineCheckout(repository.root);
        await repository.exec("git", ["add", ".gitignore", ".arc/user/.npmignore"]);
        await repository.exec("git", ["commit", "-m", "Seed projection policy"]);
        const target = createDefaultRefStorePorts({ checkoutRoot: repository.root, backingRepository: async () => null });
        await target.rawExec(["fast-import", "--quiet"], { input: importStream(owners, { backlog, active, archive: large ? expanded : archive }, registry, registryMessage) });
        return repository.root;
      });
    };
    return { baseline: await build(false), archive: await build(true), owners, counts, cleanup };
  } catch (error) { await cleanup(); throw error; }
  finally { await producer.cleanup(); }
}

/** Copy an unmaterialized prepared native repository before adding checkout-specific projection state or worktrees. */
export async function copyProjectionTimingRepository(template: PreparedRepositoryTemplate): Promise<string> {
  if (template.shape.kind !== "plain") throw new Error("Projection timing requires a plain prepared repository");
  return copyPreparedRepository(template, template.shape);
}
