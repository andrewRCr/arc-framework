/** Native stores populated identically from a producer-derived bulk import stream. */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createDefaultRefStorePorts, createRefStore, RecordReferenceSchema, CreatedOwnerSchema,
  BatchCreationReceiptSchema, compareCreatedOwners, type RecordReference } from "../../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { renderStoreCommitMessage } from "../../../src/lib/store/commit-provenance.js";
import { appendStoreCreationReceipt } from "../../../src/lib/store/commit-creation-receipt.js";
import { createRefTestRepository } from "./ref-plant.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { success } from "./suite-tools.js";

export const timingQuarters = Array.from({ length: 12 }, (_, index) => `${2023 + Math.floor(index / 4)}-q${index % 4 + 1}`);
export const timingSubject = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "budget-0400" } });
const registryRef = "refs/arc/project/registry";
const prototypeName = "budget-prototype";
const provenance = { verb: "archive", lifecycleAction: "archive" };

class ImportStream {
  private readonly chunks: string[] = ["feature done\n"];
  private mark = 0;
  blob(content: string): number {
    const mark = ++this.mark;
    this.chunks.push(`blob\nmark :${mark}\ndata ${Buffer.byteLength(content)}\n${content}\n`);
    return mark;
  }
  commit(ref: string, files: readonly { path: string; mark: number }[], message: string): void {
    this.chunks.push(`commit ${ref}\ncommitter Timing Fixture <timing@example.test> 1767225600 +0000\ndata ${Buffer.byteLength(message)}\n${message}\ndeleteall\n`);
    for (const file of files) this.chunks.push(`M 100644 :${file.mark} ${file.path}\n`);
    this.chunks.push("\n");
  }
  finish(): Buffer { return Buffer.from(this.chunks.join("") + "done\n"); }
}

async function createTimingStream(): Promise<Buffer> {
  const repository = await createRefTestRepository("files", "sha1");
  try {
    await repository.exec("git", ["config", "arc.identity", "andrew"]);
    const ports = createDefaultRefStorePorts({ checkoutRoot: repository.root, backingRepository: async () => null });
    const store = createRefStore(ports), quarter = ArchiveQuarterSchema.parse(timingQuarters[0]);
    success(await store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
      content: JSON.stringify({ projectId: randomUUID() }), provenance: { verb: "init", lifecycleAction: "create" } }));
    const prototype = success(await store.batch({ provenance, writes: [{ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: prototypeName } }),
      content: makeMetaFixture(prototypeName, { state: "Shipped", owner: "andrew", workClass: "Light" }),
      placement: { kind: "completed", quarter } }] }));
    const owner = prototype.writes[0]!.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("The native prototype lacks its allocated generation");
    const sourceUid = owner.uid;
    const files = async (ref: string) => {
      const paths = (await repository.exec("git", ["ls-tree", "-r", "--name-only", ref])).stdout.split("\n").filter(Boolean);
      return Promise.all(paths.map(async path => ({ path,
        content: new TextDecoder().decode((await ports.rawExec(["show", `${ref}:${path}`])).stdout) })));
    };
    const [history, registry] = await Promise.all([files(`refs/arc/history/work/${owner.uid}`), files(registryRef)]);
    const folder = (await repository.exec("git", ["ls-tree", "--name-only", `refs/arc/archive/${quarter}`])).stdout;
    if (!folder.startsWith("01_")) throw new Error("The native prototype lacks its first assigned archive sequence");
    const stream = new ImportStream();
    const registryMessage = new TextDecoder().decode((await ports.rawExec(["show", "-s", "--format=%B", registryRef])).stdout);
    stream.commit(registryRef, registry.map(file => ({ path: file.path, mark: stream.blob(file.content) })), registryMessage);
    for (const [quarterIndex, quarterName] of timingQuarters.entries()) {
      const batchId = randomUUID();
      const members = Array.from({ length: 50 }, (_, index) => RecordReferenceSchema.parse({ kind: "work-item/meta",
        owner: { type: "work-item", name: `budget-${String(quarterIndex * 50 + index).padStart(4, "0")}`, uid: randomUUID() } }));
      const createdOwners = members.map(reference => CreatedOwnerSchema.parse({ kind: reference.kind, owner: reference.owner }))
        .sort(compareCreatedOwners);
      const receipt = BatchCreationReceiptSchema.parse({ schemaVersion: 1, batchId, createdOwners });
      const message = (reference: RecordReference) => appendStoreCreationReceipt(renderStoreCommitMessage(provenance, reference, batchId), receipt);
      const archived: { path: string; mark: number }[] = [];
      for (const [index, reference] of members.entries()) {
        if (reference.owner.type !== "work-item" || !reference.owner.uid) throw new Error("Missing timing owner generation");
        const targetUid = reference.owner.uid;
        const substitute = (value: string) => value.replaceAll(sourceUid, targetUid)
          .replaceAll(prototypeName, reference.owner.name).replaceAll(prototype.batchId, batchId).replaceAll(quarter, quarterName);
        const retained = history.map(file => ({ path: substitute(file.path), mark: stream.blob(substitute(file.content)) }));
        stream.commit(`refs/arc/history/work/${reference.owner.uid}`, retained, message(reference));
        const destination = substitute(folder).replace(/^01_/u, `${String(index + 1).padStart(2, "0")}_`);
        archived.push(...retained.map(file => ({ ...file, path: `${destination}/${file.path}` })));
      }
      stream.commit(`refs/arc/archive/${quarterName}`, archived, message(members[0]!));
    }
    return stream.finish();
  } finally { await repository.cleanup(); }
}

export async function createRefTimingFixture() {
  const repositories: Awaited<ReturnType<typeof createRefTestRepository>>[] = [];
  const cleanup = async () => { for (const repository of repositories.reverse()) await repository.cleanup(); };
  try {
    const clients = [];
    const stream = await createTimingStream();
    for (const layout of ["default", "separate"] as const) {
      const repository = await createRefTestRepository("files", "sha1");
      repositories.push(repository);
      await repository.exec("git", ["config", "arc.identity", "andrew"]);
      const gitDir = layout === "separate" ? join(repository.root, ".git", "arc", "store") : undefined;
      if (gitDir) await repository.exec("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", gitDir]);
      const ports = createDefaultRefStorePorts({ checkoutRoot: repository.root, backingRepository: async () => null });
      const scope = gitDir ? [`--git-dir=${gitDir}`] : [];
      await ports.rawExec([...scope, "fast-import", "--quiet"], { input: stream });
      clients.push({ layout, store: createRefStore(ports), ports, scope,
        tips: async () => (await repository.exec("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout });
    }
    return { clients, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
