/**
 * Active status reads an Integrating work unit's work branch from its links, refusing an unusable link set by type, and
 * finds a bound checkout's work unit by its scanned owner or its checkout's layout.
 */
import { describe, expect, it, onTestFinished } from "vitest";
import { createActiveReviewAccess } from "../../../../src/lib/store/active-review-access.js";
import { beginProjectionCommand, projectionProcessState, recordEngineStoreCapability }
  from "../../../../src/lib/store/projection/process-state.js";
import { SlugSchema } from "../../../../src/lib/kernel/schema/slug.js";
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

describe("a meta held in its bound checkout's nested folder", () => {
  const nested: MetaFileCandidate = { ...candidate, path: ".arc/active/current/meta-example.md" };
  const cwd = "/bound";
  const seeded = async () => {
    const h = createLifecycleHarness();
    const meta = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit" },
      { kind: "active" }, { branches: [link] });
    const access = createActiveReviewAccess({ cwd, exec: scriptGitExec([]).exec, store: h.store,
      projectId: async () => "project" });
    return { access, owner: meta.reference.owner };
  };

  it("reads the work unit by the owner the active scan selected", async () => {
    const { access, owner } = await seeded();
    expect(await access.readSubject(nested, owner)).toMatchObject({ candidate: { branch: "feat/example" }, owner });
  });

  it("identifies the path through the checkout's layout when no owner is given", async () => {
    const { access, owner } = await seeded();
    onTestFinished(() => { beginProjectionCommand(); });
    recordEngineStoreCapability(cwd, true);
    projectionProcessState().layoutContexts.set(cwd, Promise.resolve({ claim: SlugSchema.parse("example"),
      layoutActive: "nested" }));
    expect(await access.readSubject(nested)).toMatchObject({ candidate: { branch: "feat/example" }, owner });
  });
});
