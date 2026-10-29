/** A rename refused for missing history retries once after pulling it, surfacing what the pull reported. */
import { expect, it } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import { HistoryRefSchema } from "../../../../src/lib/store/refusal.js";
import { OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { PullResultSchema, type PullOutcome } from "../../../../src/lib/store/sync.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";

const history = HistoryRefSchema.parse("refs/arc/history/work/11111111-1111-4111-8111-111111111111");
const pending: PullOutcome = { status: "pulled", remote: "origin", role: "state", families: ["work-item"], notices: [{ kind: "end-pending",
  item: OwnerIdentitySchema.parse({ type: "work-item", name: "gamma" }), ref: "refs/arc/work/22222222-2222-4222-8222-222222222222",
  condition: "Gamma's end remains pending.", remedy: { text: "Pull again to settle it." } }] };
const offline = (role: "state" | "read"): PullOutcome => ({ status: "failed", remote: role === "read" ? "upstream" : "origin", role, families: ["work-item"],
  notices: [], failure: { code: "unreachable", class: "recoverable", cause: "network", condition: `The ${role} remote is offline.`, remedy: { text: "Reconnect." } } });

async function renameAfterHistoryPull(pulls: PullOutcome[]) {
  const h = createDecomposeHarness();
  await h.seedStub("alpha");
  let missing = true;
  const written: string[] = [];
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "lookup") return async (input: Parameters<Store["lookup"]>[0]) => {
      if (!missing) return target.lookup(input);
      missing = false;
      return { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", condition: "History is not local.",
        remedy: { text: "Pull the history, then retry." }, historyRefs: [history] } };
    };
    if (key === "pull") return async () => ({ status: "ok", result: PullResultSchema.parse({ states: [], pulls }) });
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  const result = await runStoreRename({ store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main", writeNotice: line => written.push(line) },
    { sourceSlug: "alpha", targetSlug: "beta" });
  return { result, written };
}

it("retries past a lone failed read source and writes the pull's notices", async () => {
  const { result, written } = await renameAfterHistoryPull([pending, offline("read")]);
  expect(result).toMatchObject({ status: "renamed" });
  expect(written).toEqual(["Read source upstream was not pulled: The read remote is offline. Reconnect.",
    "Gamma's end remains pending. Pull again to settle it."]);
});

it("keeps the history refusal when the state remote fails, still writing what the pull applied", async () => {
  const { result, written } = await renameAfterHistoryPull([{ ...offline("state"), notices: pending.notices }]);
  expect(result).toMatchObject({ status: "rejected", refusal: { code: "state-unresolvable" } });
  expect(written).toEqual(["Gamma's end remains pending. Pull again to settle it."]);
});
