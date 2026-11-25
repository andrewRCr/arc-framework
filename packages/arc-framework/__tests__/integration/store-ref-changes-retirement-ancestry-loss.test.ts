/** Retirement ancestry reports a lost commit outside the retained walk and resumes after exact restoration. */
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { fixtureGit } from "../helpers/store/ref-fixture-git.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

describe.each(["default", "separate"] as const)("retirement ancestry loss in %s", layout => {
  it("restores a missing ancestor of the lower bound before comparing the same interval", async () => {
    const { f, record, middle, input, baseline } = await retirementComparison(layout);
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const bytes = (await f.ports.rawExec([...args, "cat-file", "commit", middle.tip])).stdout;
    await removeLooseObject(f.root, middle.tip, f.gitDir);
    expect(await f.store.changes(input)).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", historyRefs: [expandStoredPath(record.reference, { history: true }).ref],
      remedy: { text: expect.stringMatching(/restore|fetch|pull/iu) },
    } });
    const restored = await f.ports.rawExec([...args, "hash-object", "-t", "commit", "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(middle.tip);
    expect(success(await f.store.changes(input))).toEqual(baseline);
  });
});

it.each(["canceled", "unrelated", "present-object"] as const)("preserves %s retirement ancestry failures and admits a later healthy comparison", async kind => {
  const { f, input, baseline, original } = await retirementComparison("default");
  const error = makeGitProcessError({ command: "git", args: ["merge-base", "--is-ancestor"],
    ...(kind === "canceled" ? { isCanceled: true as const } : { exitCode: 128 }),
    stderr: kind === "unrelated" ? "fatal: invalid ancestry options\n" : `error: Could not read ${original}\n` });
  let fail = true;
  const store = createRefStore({ ...f.ports, exec: async (command, args, options) => {
    if (fail && args.includes("merge-base")) throw error;
    return f.ports.exec(command, args, options);
  } });
  await expect(store.changes(input)).rejects.toBe(error);
  fail = false;
  expect(success(await store.changes(input))).toEqual(baseline);
});

async function retirementComparison(layout: "default" | "separate") {
  const f = await createRefFixture({}, layout), git = fixtureGit(f);
  const record = await seed(f, f.reference("work-item/meta"));
  const home = expandStoredPath(record.reference), entries = await capturedEntries(f, home.ref);
  const original = (await git("git", ["rev-parse", home.ref])).stdout.trim();
  const middle = await plantRef(f.root, home.ref, entries, { parents: [original], gitDir: f.gitDir, message: "Independent saved lifetime" });
  const lower = await plantRef(f.root, home.ref, entries, { parents: [middle.tip], gitDir: f.gitDir, message: "Saved live endpoint" });
  const from = await f.settle();
  await git("git", ["update-ref", home.ref, original, lower.tip]);
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: record.reference.owner });
  success(await f.store.batch({ writes: [
    { action: "put", reference: lineage, expected: null, content: f.content(lineage) },
    { action: "remove", reference: record.reference, expected: record.version },
  ], provenance: testProvenance }));
  const input = { from, to: await f.settle() }, baseline = success(await f.store.changes(input));
  return { f, record, original, middle, input, baseline };
}
