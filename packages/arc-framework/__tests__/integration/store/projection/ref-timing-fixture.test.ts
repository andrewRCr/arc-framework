/** Producer-derived timing copies remain native stores with identical owner coordinates and more archived files. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expandSettledTimingArchive } from "../../../helpers/store/projection/timing-archive.js";
import { expect, it } from "vitest";
import { createProjectionTimingTemplates, copyProjectionTimingRepository } from "../../../helpers/store/ref-projection-timing.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createDefaultRefStorePorts, createRefStore, recordReferences } from "../../../../src/lib/store/index.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";

const NATIVE_FIXTURE_TIMEOUT_MS = 90_000;

it("decodes, materializes, and writes the baseline and expanded native datasets", async () => {
  const fixture = await createProjectionTimingTemplates({ backlog: 2, active: 2, archived: 4, quarters: 2, archiveExtra: 2 });
  const roots: string[] = [];
  try {
    let baselineRefs = "";
    const archiveViews: { path: string; content: string; basis: unknown }[][] = [];
    for (const [large, template] of [[false, fixture.baseline], [true, fixture.archive]] as const) {
      const root = await copyProjectionTimingRepository(template); roots.push(root);
      const ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null }), store = createRefStore(ports);
      const refs = new TextDecoder().decode((await ports.rawExec(["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout);
      if (!large) baselineRefs = refs;
      else expect(refs).toBe(baselineRefs);
      const listing = success(await store.list({ family: "work-item" }));
      expect(listing.status).toBe("complete");
      if (listing.status !== "complete") throw new Error("Incomplete native timing inventory");
      expect(listing.diagnostics).toEqual([]);
      expect(listing.records).toHaveLength(large ? 20 : 12);
      const archived = fixture.owners.find(owner => owner.role === "archive");
      if (archived === undefined) throw new Error("Missing archive owner");
      const history = success(await store.history({ reference: archived.reference }));
      expect(history).toHaveLength(1);
      expect(history[0]?.creationReceipt?.createdOwners).toHaveLength(2);
      const input = { store, checkout: root };
      expect(await startProjection(input)).toMatchObject({ kind: "ready" }); await endProjection(input);
      const location = await locateProjection(root, createProjectionEnginePorts(root));
      const index = await readProjectionIndex(location, true, { groups: "all" });
      if (index.kind !== "index") throw new Error("Missing native timing index");
      expect(Object.keys(index.index.entries)).toHaveLength(large ? 20 : 12);
      if (!large) {
        await expandSettledTimingArchive(root, fixture.archive, store, createProjectionEnginePorts(root));
        expect(await startProjection(input)).toMatchObject({ kind: "ready" }); await endProjection(input);
      }
      const settled = await readProjectionIndex(location, true, { groups: "all" });
      if (settled.kind !== "index") throw new Error("Missing expanded timing index");
      archiveViews.push(await Promise.all(Object.entries(settled.index.entries).filter(([path]) => path.startsWith(".arc/completed/"))
        .sort(([a], [b]) => a.localeCompare(b)).map(async ([path, entry]) => {
          if (entry.kind !== "record") throw new Error("Unsettled timing archive");
          return { path, content: await readFile(join(root, path), "utf8"), basis: { reference: entry.reference, base: entry.base,
            written: entry.written, protected: entry.protected, pending: entry.pending, refused: entry.refused, copies: entry.copies } };
        })));
      const backlog = fixture.owners.find(owner => owner.role === "backlog");
      if (backlog === undefined) throw new Error("Missing backlog owner");
      const note = success(await store.read({ reference: recordReferences["work-item/notes"](backlog.reference.owner) }));
      success(await store.write({ action: "put", reference: note.reference, expected: note.version,
        content: "A native write after bulk preparation.\n", provenance: { verb: "save", lifecycleAction: "edit" } }));
      expect(success(await store.read({ reference: note.reference })).content).toBe("A native write after bulk preparation.\n");
    }
    expect(archiveViews[0]).toEqual(archiveViews[1]);
  } finally { await removeGitBackedDirs(roots); await fixture.cleanup(); }
}, NATIVE_FIXTURE_TIMEOUT_MS);

it("counts one native Git process for two exchanges through the same persistent reader", async () => {
  const { createRefTestRepository } = await import("../../../helpers/store/ref-plant.js");
  const { ProjectionTimingObserver } = await import("../../../helpers/store/projection/timing-observer.js");
  const { GitBatchReadScope } = await import("../../../../src/lib/git/batch-reader.js");
  const repository = await createRefTestRepository("files", "sha1");
  try {
    const observer = new ProjectionTimingObserver(), client = observer.client(repository.root);
    const head = new TextDecoder().decode((await client.ports.rawExec(["rev-parse", "HEAD"])).stdout).trim();
    const reader = new GitBatchReadScope();
    const measured = await observer.measure(async () => {
      try {
        const responses = [];
        for (let i = 0; i < 2; i++) responses.push(await client.ports.rawExec(["cat-file", "--batch"], {
          input: Buffer.from(`${head}\n`), objectAccess: "local-only", batchReader: reader,
        }));
        return responses;
      } finally { await reader.close(); }
    });
    for (const response of measured.value) expect(new TextDecoder().decode(response.stdout)).toMatch(new RegExp(`^${head} commit `, "u"));
    expect(measured.sample.gitCalls).toBe(1);
    expect(measured.sample.gitRequests).toBe(2);
    const separate = await observer.measure(async () => {
      await client.ports.rawExec(["for-each-ref"]); await client.ports.rawExec(["for-each-ref"]);
    });
    expect(separate.sample.gitCalls).toBe(2);
  } finally { await repository.cleanup(); }
}, NATIVE_FIXTURE_TIMEOUT_MS);
