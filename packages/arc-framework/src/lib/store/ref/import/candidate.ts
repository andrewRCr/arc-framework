/** Read the legacy Candidate path log and replay its versions on an owner's retained history. */
import { randomUUID } from "node:crypto";
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { ImportGroup } from "./groups.js";
import type { BatchInput } from "../../write.js";
import { resolveCandidateRecordRelativePath } from "../../../work-unit/candidate-record-store.js";
import { readFileAt } from "../../in-repo/files.js";
import { expandStoredPath } from "../../stored-path.js";
import { refFormatKey } from "../format-key.js";
import { canonicalize } from "../../../kernel/canonical/canonical-json.js";
import { writeRefBlob } from "../tree-write.js";
import { commitRefTree } from "../write-commits.js";

/** Match the legacy chain reader's plain path history, bounded by the selected meta revision. */
export async function readImportCandidateVersions(context: RefBackendContext, name: string,
  revision: string | undefined): Promise<NonNullable<ImportRecord["versions"]>> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const path = resolveCandidateRecordRelativePath(name);
  const { stdout } = await source.ports.exec("git", ["log", revision ?? "HEAD", "--format=%H", "--", path], {
    cwd: source.ports.checkoutRoot, objectAccess: "local-only",
  });
  const versions: NonNullable<ImportRecord["versions"]> = [];
  for (const commit of stdout.split(/\r?\n/u).filter(Boolean).reverse()) {
    const content = await readFileAt({ ports: source.ports, registry: context.registry }, path, commit);
    if (content !== null) versions.push({ commit, content });
  }
  return versions;
}

/** Each source revision has its own batch; the caller appends the owner's current-files landing. */
export async function replayImportCandidate(context: RefBackendContext, group: ImportGroup,
  provenance: BatchInput["provenance"], actor: string | undefined): Promise<string | undefined> {
  const candidate = group.candidate;
  if (!candidate) return;
  const home = expandStoredPath(candidate.reference, { registry: context.registry });
  const metadata = { formatVersion: 1, slug: candidate.reference.owner.name,
    formats: { [refFormatKey(candidate.reference)]: context.registry[candidate.reference.kind].formatVersion } };
  const metadataEntry = { path: home.metadataPath, mode: "100644", oid: await writeRefBlob(context, canonicalize(metadata)) };
  let parent: string | undefined;
  for (const version of candidate.versions ?? []) {
    const entry = { path: home.path, mode: "100644", oid: await writeRefBlob(context, version.content) };
    parent = await commitRefTree(context, [entry, metadataEntry], parent, provenance, candidate.reference, randomUUID(), actor);
  }
  return parent;
}
