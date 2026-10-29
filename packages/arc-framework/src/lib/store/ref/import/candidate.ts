/** Read the legacy Candidate path log and replay supplied revisions on retained owner history. */
import { randomUUID } from "node:crypto";
import type { RefBackendContext } from "../context.js";
import type { ImportCandidateSource } from "./source.js";
import type { ImportGroup } from "./groups.js";
import type { BatchInput } from "../../write.js";
import { resolveCandidateRecordRelativePath } from "../../../work-unit/candidate-record-store.js";
import { readFileAt } from "../../in-repo/files.js";
import { expandStoredPath } from "../../stored-path.js";
import { refFormatKey } from "../format-key.js";
import { canonicalize } from "../../../kernel/canonical/canonical-json.js";
import { writeRefBlob } from "../tree-write.js";
import { commitRefTree } from "../write-commits.js";
import type { RefTreeEntry } from "../batch-read.js";

/** Match the legacy chain reader's plain path history, bounded by the selected meta revision. */
export async function readImportCandidateVersions(context: RefBackendContext, name: string,
  revision: string | undefined): Promise<ImportCandidateSource["versions"]> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const path = resolveCandidateRecordRelativePath(name);
  const { stdout } = await source.ports.exec("git", ["log", revision ?? "HEAD", "--format=%H", "--", path], {
    cwd: source.ports.checkoutRoot, objectAccess: "local-only",
  });
  const versions: ImportCandidateSource["versions"] = [];
  for (const commit of stdout.split(/\r?\n/u).filter(Boolean).reverse()) {
    const content = await readFileAt({ ports: source.ports, registry: context.registry }, path, commit);
    if (content !== null) versions.push({ commit, content });
  }
  return versions;
}

/** Each source revision has its own batch; the caller appends the owner's current-files landing. */
export async function replayImportVersions(context: RefBackendContext, group: ImportGroup,
  provenance: BatchInput["provenance"], actor: string | undefined): Promise<string | undefined> {
  const metadata = { formatVersion: 1, slug: group.reference.owner.name, formats: {} as Record<string, number> };
  const entries = new Map<string, RefTreeEntry>();
  let parent: string | undefined;
  for (const record of group.replays) {
    const home = expandStoredPath(record.reference, { registry: context.registry });
    metadata.formats[refFormatKey(record.reference)] = context.registry[record.reference.kind].formatVersion;
    for (const content of record.contents) {
      entries.set(home.path, { path: home.path, mode: "100644", oid: await writeRefBlob(context, content) });
      entries.set(home.metadataPath, { path: home.metadataPath, mode: "100644", oid: await writeRefBlob(context, canonicalize(metadata)) });
      parent = await commitRefTree(context, entries.values(), parent, provenance, record.reference, randomUUID(), actor);
    }
  }
  return parent;
}
