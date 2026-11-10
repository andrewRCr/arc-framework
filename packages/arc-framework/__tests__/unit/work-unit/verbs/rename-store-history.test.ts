/** Rename history rounds retain their latest refusal and every applied pull notice. */
import { expect, it } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import { HistoryRefSchema, StoreRefusalSchema, type HistoryRef, type StoreRefusal } from "../../../../src/lib/store/refusal.js";
import { OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { PullResultSchema, type PullOutcome, type SyncState } from "../../../../src/lib/store/sync.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";

const history = HistoryRefSchema.parse("refs/arc/history/work/11111111-1111-4111-8111-111111111111");
const pending: PullOutcome = { status: "pulled", remote: "origin", role: "state", families: ["work-item"], notices: [{ kind: "end-pending",
  item: OwnerIdentitySchema.parse({ type: "work-item", name: "gamma" }), ref: "refs/arc/work/22222222-2222-4222-8222-222222222222",
  condition: "Gamma's end remains pending.", remedy: { text: "Pull again to settle it." } }] };
const offline = (role: "state" | "read"): PullOutcome => ({ status: "failed", remote: role === "read" ? "upstream" : "origin", role, families: ["work-item"],
  notices: [], failure: { code: "unreachable", class: "recoverable", cause: "network", condition: `The ${role} remote is offline.`, remedy: { text: "Reconnect." } } });

const secondHistory = HistoryRefSchema.parse("refs/arc/history/cohort/33333333-3333-4333-8333-333333333333");
function missingHistory(historyRefs: readonly HistoryRef[] = [history], condition = "History is not local."): StoreRefusal {
  return StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", condition,
    remedy: { text: "Pull the history, then retry." }, historyRefs: [...historyRefs] });
}
interface HistoryRound { refusal: StoreRefusal; pulls: PullOutcome[]; states?: SyncState[] }

async function renameWithHistoryRounds(rounds: readonly HistoryRound[]) {
  const h = createDecomposeHarness(), primary = await h.seedStub("alpha");
  const waiting = [...rounds], written: string[] = []; let current: HistoryRound | undefined;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "lookup") return async (input: Parameters<Store["lookup"]>[0]) => {
      if (input.kind === "slug" && input.slug === "alpha" && waiting.length > 0) {
        current = waiting.shift();
        if (current !== undefined) return { status: "refused", refusal: current.refusal };
      }
      return target.lookup(input);
    };
    if (key === "pull") return async () => {
      if (current === undefined) throw new Error("Unexpected history pull.");
      const result = PullResultSchema.parse({ states: current.states ?? [], pulls: current.pulls });
      current = undefined;
      return { status: "ok", result };
    };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  const context = { store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main", writeNotice: (line: string) => written.push(line) };
  const retry = () => runStoreRename(context, { operand: "alpha", targetSlug: "beta" });
  const result = await retry();
  return { result, written, retry, primary, store: h.store };
}

it("retries past a lone failed read source and writes the pull's notices", async () => {
  const { result, written } = await renameWithHistoryRounds([{ refusal: missingHistory(), pulls: [pending, offline("read")] }]);
  expect(result).toMatchObject({ status: "renamed" });
  expect(written).toEqual(["Read source upstream was not pulled: The read remote is offline. Reconnect.",
    "Gamma's end remains pending. Pull again to settle it."]);
});

it("keeps the history refusal when the state remote fails, still writing what the pull applied", async () => {
  const { result, written } = await renameWithHistoryRounds([{ refusal: missingHistory(), pulls: [{ ...offline("state"), notices: pending.notices }] }]);
  expect(result).toMatchObject({ status: "rejected", refusal: { code: "state-unresolvable" } });
  expect(written).toEqual(["Gamma's end remains pending. Pull again to settle it."]);
});

it("returns Missing unchanged when there is no history to pull and renames after local repair", async () => {
  const h = createDecomposeHarness();
  await h.seedStub("alpha");
  const refusal = StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", historyRefs: [],
    condition: "The live namespace has a missing object.", remedy: { text: "Restore or fetch the missing object, then retry." } });
  let damaged = true;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "lookup" && damaged) return async () => ({ status: "refused", refusal });
    if (key === "pull") return async () => { throw new Error("No retained history was named"); };
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
  } });
  const context = { store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" };
  expect(await runStoreRename(context, { operand: "alpha", targetSlug: "beta" }))
    .toEqual({ status: "rejected", reason: refusal.condition, refusal });
  damaged = false;
  expect(await runStoreRename(context, { operand: "alpha", targetSlug: "beta" })).toMatchObject({ status: "renamed" });
});

it.each([false, true])("shows the designation question and retains the rename refusal: readFailure=%s", async readFailure => {
  const { result, written } = await renameWithHistoryRounds([{ refusal: missingHistory(), pulls: readFailure ? [pending, offline("read")] : [], states: [{
    status: "designation-needed", remote: "backup", choices: ["push", "read", "off"],
    remedy: { text: "Choose the backup role.", argv: ["arc", "store", "remote", "backup", "push"] } }] }]);
  expect(result).toMatchObject({ status: "rejected", refusal: { code: "state-unresolvable", condition: "History is not local." } });
  expect(written).toEqual([...readFailure ? ["Read source upstream was not pulled: The read remote is offline. Reconnect.",
    "Gamma's end remains pending. Pull again to settle it."] : [],
    "Remote backup needs a store designation. Choose the backup role. arc store remote backup push"]);
});

it.each(["empty", "repeated"] as const)("keeps the latest %s history refusal after a pull, then permits a repaired retry", async kind => {
  const latest = missingHistory(kind === "empty" ? [] : [history], "The next history basis is still unavailable.");
  const h = await renameWithHistoryRounds([
    { refusal: missingHistory(), pulls: [pending] },
    { refusal: latest, pulls: [pending] },
  ]);
  expect(h.result).toEqual({ status: "rejected", reason: latest.condition, refusal: latest });
  expect(h.written).toEqual(["Gamma's end remains pending. Pull again to settle it."]);
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference }))).toEqual(h.primary);
  expect(await h.retry()).toMatchObject({ status: "renamed" });
});

it.each(["designation", "state-failure"] as const)("ends a later history round on %s while preserving all notices", async kind => {
  const latest = missingHistory([secondHistory], "The cohort history is not local.");
  const h = await renameWithHistoryRounds([
    { refusal: missingHistory(), pulls: [pending] },
    { refusal: latest,
      pulls: kind === "state-failure" ? [{ ...offline("state"), notices: pending.notices }] : [],
      states: kind === "designation" ? [{ status: "designation-needed", remote: "backup", choices: ["push", "read", "off"],
        remedy: { text: "Choose the backup role.", argv: ["arc", "store", "remote", "backup", "push"] } }] : [],
    },
  ]);
  expect(h.result).toEqual({ status: "rejected", reason: latest.condition, refusal: latest });
  expect(h.written).toEqual(["Gamma's end remains pending. Pull again to settle it.", kind === "designation"
    ? "Remote backup needs a store designation. Choose the backup role. arc store remote backup push"
    : "Gamma's end remains pending. Pull again to settle it."]);
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference }))).toEqual(h.primary);
  expect(await h.retry()).toMatchObject({ status: "renamed" });
});
