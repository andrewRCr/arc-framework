/** The selected checkout frame carries the same uncaptured commits as task close. */
import { expect, it } from "vitest";
import { makeUnclosedTaskFixture } from "../helpers/unclosed-task-commits.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { createWorktreeMarkerGeneration } from "../../src/lib/git/worktree-marker.js";
import { DerivedLocusFrameSchema } from "../../src/lib/locus/derived-schema.js";

it("includes the entering work unit's open-task commits in its frame", async () => {
  const h = await makeUnclosedTaskFixture();
  const sha = await h.commit("unclosed work\n");
  await createWorktreeMarkerGeneration(h.cwd, { spawnedByArc: false, spawningIdentity: "test-user",
    createdAt: "2026-10-16T00:00:00.000Z", createdFor: { kind: "work-unit", name: "demo" } });
  const frame = await runDerivedLocusStateProbe({ ...h.input, exec: (command, args, options) => h.input.exec(command, args, { cwd: h.cwd, ...options }), identity: "test-user", archiveCadence: "manual" });
  expect(frame.entering).toMatchObject({ kind: "selected", row: { kind: "work-unit" } });
  expect(frame.active?.subject.key).toBe("demo");
  expect(frame.active?.context).toMatchObject({ unclosedTaskCommits: { status: "available", commits: [{ sha }],
    actions: [{ text: "arc task close", argv: ["arc", "task", "close"], checkout: h.cwd }] } });
  expect(DerivedLocusFrameSchema.safeParse(frame).success).toBe(true);
});
