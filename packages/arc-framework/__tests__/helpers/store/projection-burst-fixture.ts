/** Twenty independently bound native worktrees and an oracle over recoverable current bytes. */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { locateProjection } from "../../../src/lib/store/projection/location.js";
import { createProjectionEnginePorts } from "../../../src/lib/store/projection/engine-ports.js";
import { readProjectionIndex } from "../../../src/lib/store/projection/index-file.js";
import { renderStampedFile } from "../../../src/lib/store/projection/stamp.js";
import { gitBlobId } from "../../../src/lib/store/projection/blob-id.js";
import { preparedRefSync } from "./ref-sync.js";
import { configureEngineCheckout } from "./projection/engine-fixture.js";
import { seedProjection } from "./projection/seeded-projection.js";
import { removeGitBackedDir } from "../temp-repo.js";
import { success } from "./suite-tools.js";
import { startProjectionWriter } from "./projection-process.js";

export const PROJECTION_BURST_WRITERS = 20;
export const PROJECTION_BURST_TIMEOUT_MS = 900_000;
export const BURST_PATH = ".arc/user/andrew/USER-INBOX.md";
export const BURST_REFERENCE = RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "andrew" } });
export const BURST_PROVENANCE = { verb: "save", lifecycleAction: "save" };
export const burstEntry = (id: number, content: string): string =>
  `### **Save ${id}**\n\n- _Id:_ \`${id.toString(16).padStart(8, "0")}\`\n\n${content}\n\n`;
export const BURST_ORIGINAL = "# User Inbox\n\n## Errand\n\n" + burstEntry(1, "Retained sentinel.") + "## Work Unit\n";
export const burstContent = (entry: string): string => BURST_ORIGINAL.replace("## Work Unit", entry + "## Work Unit");

export async function projectionBurstFixture(layout: "default" | "separate") {
  const h = await preparedRefSync(`projection-bursts-${layout}`, layout, async h => {
    success(await h.a.store.write({ action: "put", reference: BURST_REFERENCE, expected: null,
      content: BURST_ORIGINAL, provenance: BURST_PROVENANCE }));
    return {};
  });
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-bursts-"));
  onTestFinished(() => removeGitBackedDir(parent));
  const roots = [h.cloneA];
  for (let i = 1; i < PROJECTION_BURST_WRITERS; i++) {
    const root = join(parent, `writer-${i}`);
    await h.a.exec("git", ["worktree", "add", "--detach", root, "HEAD"]);
    roots.push(root);
  }
  for (const root of roots) {
    await configureEngineCheckout(root);
    await seedProjection({ store: h.a.store, checkout: root, files: [{ path: BURST_PATH, reference: BURST_REFERENCE }] });
  }
  const base = success(await h.a.store.read({ reference: BURST_REFERENCE }));
  const writers: ReturnType<typeof startProjectionWriter>[] = [], pids: number[] = [];
  for (const [i, root] of roots.entries()) {
    const writer = startProjectionWriter({ root, editorRoot: roots[(i + 1) % roots.length]!,
      path: BURST_PATH, reference: BURST_REFERENCE }, PROJECTION_BURST_TIMEOUT_MS);
    writers.push(writer); pids.push(await writer.ready);
  }
  if (new Set(pids).size !== roots.length) throw new Error("Each worktree must run in an independent process");
  await Promise.all(writers.map(writer => writer.send({ action: "run", operation: "refresh", hook: null })));
  return { h, roots, writers, base,
    saved: (entry: string) => renderStampedFile({ content: burstContent(entry), stamp: gitBlobId(base.content, "sha1") }),
    edit: async (content: string) => success(await h.a.store.write({ action: "put", reference: base.reference,
      expected: base.version, content, provenance: BURST_PROVENANCE })),
  };
}

/** Evidence names only current store content, original files, and aside files named by a current index. */
export interface ProjectionSaveEvidence { readonly content: string; readonly recoverable: boolean; readonly locus: string }

export function preservedProjectionSave(entry: string, evidence: readonly ProjectionSaveEvidence[]): boolean {
  return evidence.some(each => each.recoverable && each.content.includes(entry));
}

export async function projectionSaveEvidence(input: { roots: readonly string[]; reports: readonly string[]; stored: string }): Promise<ProjectionSaveEvidence[]> {
  const evidence: ProjectionSaveEvidence[] = [{ content: input.stored, recoverable: true, locus: "current store" }];
  for (const root of input.roots) {
    const location = await locateProjection(root, createProjectionEnginePorts(root));
    const disk = await readProjectionIndex(location, true, { groups: "all" });
    if (disk.kind !== "index") throw new Error(`No usable projection index at ${root}`);
    const entry = disk.index.entries[BURST_PATH];
    const report = input.reports.join("\n");
    evidence.push({ content: await readFile(join(root, BURST_PATH), "utf8").catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }), recoverable: entry?.kind === "record" && entry.pending, locus: join(root, BURST_PATH) });
    if (entry?.kind !== "record") continue;
    for (const copy of entry.copies) evidence.push({ content: await readFile(join(root, copy.name), "utf8"),
      recoverable: entry.pending || report.includes(copy.name) && report.includes(BURST_PATH), locus: join(root, copy.name) });
  }
  return evidence;
}
