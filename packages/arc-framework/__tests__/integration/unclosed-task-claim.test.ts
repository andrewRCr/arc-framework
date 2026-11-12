/** Unclosed-task reads retain the entering owner beside a completed namesake. */
import { expect, it } from "vitest";
import { makeUnclosedTaskFixture } from "../helpers/unclosed-task-commits.js";
import { computeUnclosedTaskCommits } from "../../src/lib/locus/unclosed-task-commits.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { createWorktreeMarkerGeneration } from "../../src/lib/git/worktree-marker.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { randomUUID } from "node:crypto";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";

it("reads the entering owner's uncaptured commits beside a completed namesake", async () => {
  const h = await makeUnclosedTaskFixture(), primary = await h.readMeta();
  const owner = primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the active owner's UID");
  await h.seed(recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "demo", uid: randomUUID() })),
    renderMetaFile("demo", { state: "Shipped", owner: "ended-owner", currentWorkflow: null }),
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const sha = await h.commit("uncaptured owner work\n");
  expect(await computeUnclosedTaskCommits({ ...h.input, uid: owner.uid }))
    .toMatchObject({ status: "available", commits: [{ sha }] });
  await createWorktreeMarkerGeneration(h.cwd, { spawnedByArc: false, spawningIdentity: "test-user",
    createdAt: "2026-10-24T00:00:00Z", createdFor: { kind: "work-unit", name: "demo", uid: owner.uid } });
  const frame = await runDerivedLocusStateProbe({ ...h.input, exec: (command, args, options) => h.input.exec(command, args, { cwd: h.cwd, ...options }),
    identity: "test-user", archiveCadence: "manual" });
  expect(frame.active).toMatchObject({ subject: { kind: "work-unit", key: "demo", uid: owner.uid },
    context: { unclosedTaskCommits: { status: "available", commits: [{ sha }] } } });
}, 30_000);
