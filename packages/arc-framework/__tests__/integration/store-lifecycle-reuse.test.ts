/** Registered lifecycle commands mutate the selected generation under current and former slug reuse. */
import { expect, it } from "vitest";
import { repairCli } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaPause } from "../../src/lib/store/kinds/meta/writers.js";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

const verbs = ["activate", "deactivate", "abandon", "start", "materialize", "pause", "handover", "resume",
  "set-class", "rename", "archive", "promote", "demote"] as const;
type Verb = typeof verbs[number];

async function fixture(verb: Verb, former: boolean) {
  const backlog = ["abandon", "start", "promote", "demote"].includes(verb);
  const planning = backlog || verb === "activate" || verb === "materialize";
  const f = await lifecycleReuseFixture(former, {
    state: planning ? "Planning" : "Active", currentWorkflow: backlog ? null : planning ? "draft-design" : "process-task-loop",
  }, backlog ? { kind: "backlog", commitment: verb === "promote" ? "provisional" : "planned" } : { kind: "active" });
  await f.seed(recordReferences["work-item/notes"](f.live.reference.owner), "# Live notes\n");
  if (verb === "resume") {
    lifecycleSuccess(await f.store.write({ ...recordPut(f.live, { content: writeMetaPause(f.live.content, {
      pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Waiting", waitsOn: null, resumeNotes: null, open: false,
    }) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  }
  return f;
}
function argv(verb: Verb): string[] {
  switch (verb) {
    case "activate": return [verb, "example", "--type", "feat", "--task", "Implement", "--action", "Continue"];
    case "abandon": return [verb, "example", "--yes"];
    case "start": case "materialize": return [verb, "example", "--here"];
    case "pause": return [verb, "example", "--reason", "Waiting"];
    case "handover": return [verb, "example", "--to", "next-owner"];
    case "set-class": return [verb, "Heavy", "example"];
    case "rename": return [verb, "example", "renamed"];
    default: return [verb, "example"];
  }
}
it.each(verbs.flatMap(verb => [false, true].map(former => ({ verb, former }))))(
  "$verb selects the live generation, former=$former", async ({ verb, former }) => {
    const f = await fixture(verb, former);
    const result = await repairCli(f, argv(verb), { store: f.store });
    expect(lifecycleSuccess(await f.store.read({ reference: f.archived.reference }))).toEqual(f.archived);
    expect(lifecycleSuccess(await f.store.read({ reference: f.oldNotes.reference }))).toEqual(f.oldNotes);
    expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
    const read = await f.store.read({ reference: f.live.reference });
    if (verb === "abandon") {
      expect(read).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      const terminal = lifecycleSuccess(await f.store.read({ reference: recordReferences["lineage/transition"](f.live.reference.owner) }));
      expect(JSON.parse(terminal.content)).toMatchObject({ kind: "abandon", origin: { name: f.name } });
      return;
    }
    const after = lifecycleSuccess(read);
    expect(after.reference.owner).toMatchObject({ ...f.live.reference.owner,
      name: verb === "rename" ? "renamed" : f.name });
    switch (verb) {
      case "activate": expect(after.fields).toMatchObject({ state: "Active" });
        expect(after.links?.branches).toContainEqual(expect.objectContaining({ ref: `feat/${f.name}` })); break;
      case "deactivate": expect(after.fields).toMatchObject({ state: "Planning" }); break;
      case "start": case "materialize":
        expect(after.placement).toMatchObject({ kind: "active" }); expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "work-unit", name: f.name } } }); break;
      case "pause": expect(after.fields).toMatchObject({ pause: { reason: "Waiting" } }); break;
      case "handover": expect(after.fields).toMatchObject({ owner: "next-owner" }); break;
      case "resume": expect(after.fields).toMatchObject({ pause: null }); break;
      case "set-class": expect(after.fields).toMatchObject({ workClass: "Heavy" }); break;
      case "archive": expect(after.fields).toMatchObject({ state: "Shipped" });
        expect(after.placement).toMatchObject({ kind: "completed" }); break;
      case "promote": case "demote": expect(after.placement).toMatchObject({ kind: "backlog", commitment: verb === "promote" ? "planned" : "provisional" }); break;
      case "rename": expect(after.aliases).toContain("example"); break;
    }
  }, 60_000);
