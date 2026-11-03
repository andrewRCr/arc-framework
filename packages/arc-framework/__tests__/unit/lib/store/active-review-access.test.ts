/** Active status reads an Integrating work unit's work branch from its links, refusing an unusable link set by type. */
import { expect, it } from "vitest";
import { createActiveReviewAccess } from "../../../../src/lib/store/active-review-access.js";
import { ReviewOwnerSelectionError } from "../../../../src/lib/store/kinds/review/errors.js";
import type { MetaFileCandidate } from "../../../../src/commands/active/types.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";

const link = { repository: "project", ref: "feat/example", linkedAs: "created" as const, excluded: [] };
const candidate: MetaFileCandidate = { path: ".arc/active/meta-example.md", filename: "meta-example.md", branch: null,
  state: "Integrating", nextTask: null, taskList: null, nextAction: null, currentWorkflow: "integrate-work-unit" };

it.each([
  ["no link", [], "The work unit has no work-branch link."],
  ["duplicate links", [link, { ...link, ref: "refs/heads/feat/example" }], expect.stringMatching(/duplicate canonical/u)],
] as const)("refuses an Integrating work unit with %s as a typed selection, and reads its branch after repair",
  async (_case, branches, condition) => {
    const h = createLifecycleHarness();
    await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit" }, { kind: "active" },
      { branches: [link] });
    let broken = true;
    const store = Object.create(h.store) as Store;
    store.read = async input => {
      const result = await h.store.read(input);
      return broken && input.reference.kind === "work-item/meta" && result.status === "ok"
        ? { ...result, result: { ...result.result, links: { ...result.result.links, branches: [...branches] } } as StoreRecord } : result;
    };
    const access = createActiveReviewAccess({ cwd: "/unavailable", exec: scriptGitExec([]).exec, store,
      projectId: async () => "project" });
    const refused = access.readSubject(candidate);
    await expect(refused).rejects.toBeInstanceOf(ReviewOwnerSelectionError);
    await expect(refused).rejects.toMatchObject({ code: "corrupt-state", condition,
      remedy: { text: "Repair the work unit's branch links, then retry." } });
    broken = false;
    expect((await access.readSubject(candidate)).candidate).toMatchObject({ branch: "feat/example" });
  });
