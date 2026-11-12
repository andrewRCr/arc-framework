/** Archived writes require readable quarter trees and commit-valued retained history. */

import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

it.each(["default", "separate"] as const)("keeps a non-commit archive history tip recoverable in the %s layout", async layout => {
  const f = await createRefFixture({}, layout);
  const exec = makeGitExec(f.root);
  const git = (args: string[]) => exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], ...args]);
  const primary = await seed(f, f.reference("work-item/meta"));
  success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
  const archived = success(await f.store.read({ reference: primary.reference }));
  const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : undefined;
  const history = `refs/arc/history/work/${uid}`;
  const original = (await git(["rev-parse", history])).stdout.trim();
  const blob = (await git(["rev-parse", `${history}:metadata-${uid}.json`])).stdout.trim();
  await git(["update-ref", history, blob]);
  expect(await f.store.write(update(f, archived))).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [history],
    condition: expect.stringContaining(history), remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
  await git(["update-ref", history, original]);
  success(await f.store.write(update(f, archived)));
});

it.each(["default", "separate"] as const)("keeps an unavailable archive resolution tree recoverable in the %s layout", async layout => {
  const f = await createRefFixture({}, layout);
  const exec = makeGitExec(f.root);
  const git = (args: string[]) => exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], ...args]);
  const primary = await seed(f, f.reference("work-item/meta"));
  success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
  const archived = success(await f.store.read({ reference: primary.reference }));
  const ref = `refs/arc/archive/${quarter}`;
  const tree = (await git(["rev-parse", `${ref}^{tree}`])).stdout.trim();
  const bytes = (await f.ports.rawExec([...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "cat-file", "tree", tree])).stdout;
  await removeLooseObject(f.root, tree, f.gitDir);
  const before = success(await f.store.version());
  expect(await f.store.write(update(f, archived))).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [], condition: expect.stringContaining(ref),
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
  expect(success(await f.store.version())).toBe(before);
  await f.ports.rawExec([...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "hash-object", "-t", "tree", "-w", "--stdin"], { input: bytes });
  success(await f.store.write(update(f, archived)));
});
