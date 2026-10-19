/** The synchronization adapter projects one selected Store's results without losing partial evidence. */
import { expect, it } from "vitest";
import { bindStoreSyncPort } from "../../../../src/lib/store/operational-sync.js";
import { PullResultSchema } from "../../../../src/lib/store/sync.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { readStateHistory } from "../../../../src/lib/handoff/state-history.js";
import { HistoryRefSchema, StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

const remedy = { text: "Repair the remote and retry.", argv: ["arc", "store", "remote"] };
const pulled = { status: "pulled", remote: "origin", role: "state", families: ["work-item"], notices: [] };
const notice = { kind: "end-pending", item: { type: "work-item", name: "alpha" },
  ref: "refs/arc/work/11111111-1111-4111-8111-111111111111", condition: "The end remains pending.", remedy };
const unreachable = { code: "unreachable", class: "recoverable", cause: "network", condition: "Remote offline.", remedy };
const refused = { code: "refused", class: "terminal", message: "Policy refusal.", condition: "Policy refusal.", remedy };

function binding(value: unknown) {
  const f = createReferenceFixture();
  const result = PullResultSchema.parse(value);
  f.store.pull = async () => ({ status: "ok", result });
  return { port: bindStoreSyncPort(f.store), result };
}

it.each([
  { value: { states: [{ status: "no-remote" }], pulls: [] }, expected: { status: "no-remote" } },
  { value: { states: [], pulls: [pulled] }, expected: { status: "pulled" } },
  { value: { states: [], pulls: [{ ...pulled, status: "noop" }] }, expected: { status: "noop" } },
  { value: { states: [{ status: "no-identity", families: ["personal"], remedy }], pulls: [] }, expected: { status: "no-identity", remedy } },
  { value: { states: [{ status: "designation-needed", remote: "backup", choices: ["push", "read", "off"], remedy }], pulls: [] },
    expected: { status: "designation-needed", remote: "backup", choices: ["push", "read", "off"], remedy } },
  { value: { states: [], pulls: [{ ...pulled, notices: [notice] }] }, expected: { status: "pulled", notices: [notice] } },
])("projects the selected Store's $expected.status outcome", async ({ value, expected }) => {
  expect(await binding(value).port.pull()).toEqual(expected);
});

it.each([
  { value: { states: [], pulls: [{ ...pulled, status: "failed", failure: unreachable }] }, status: "unreachable", condition: "Remote offline." },
  { value: { states: [], pulls: [{ ...pulled, status: "failed", failure: refused, notices: [notice] }] }, status: "incomplete", condition: "Policy refusal." },
  { value: { states: [], pulls: [pulled, { ...pulled, remote: "backup", status: "failed", failure: unreachable, notices: [notice] }] },
    status: "incomplete", condition: "Remote offline." },
  { value: { states: [{ status: "move-incomplete", condition: "Move not complete.", remedy }], pulls: [] }, status: "incomplete", condition: "Move not complete." },
  { value: { states: [{ status: "move-unfinished", condition: "Move unfinished.", remedy }], pulls: [] }, status: "incomplete", condition: "Move unfinished." },
])("preserves a partial result as $status with its condition and remedy", async ({ value, status, condition }) => {
  const { port, result } = binding(value);
  expect(await port.pull()).toEqual({ status, condition, remedy, partial: result });
});

it("retains every independent configuration and remote failure in an incomplete pull", async () => {
  const { port, result } = binding({ states: [{ status: "designation-ambiguous", remotes: ["origin", "backup"], remedy },
    { status: "moved", remote: "new-home", remedy: { text: "Follow the forwarding record." } }],
  pulls: [{ ...pulled, status: "failed", failure: refused }] });
  const outcome = await port.pull();
  expect(outcome).toMatchObject({ status: "incomplete", partial: result, condition: expect.stringContaining("origin"),
    remedy: { text: expect.stringContaining("Follow the forwarding record.") } });
  expect(JSON.stringify(outcome)).toContain("Policy refusal.");
});

it.each([null, [{ ref: "refs/arc/project/inbox", commits: 2, diskBytes: 42 }]])("returns the selected Store's actual maintenance measurements: %j", async measurements => {
  const f = createReferenceFixture();
  f.store.maintain = async () => ({ status: "ok", result: { measurements } });
  expect(await bindStoreSyncPort(f.store).maintain()).toEqual({ measurements });
});

it("retries a saved read after pulling exactly its named history refs", async () => {
  const f = createReferenceFixture();
  const ref = HistoryRefSchema.parse("refs/arc/history/work/11111111-1111-4111-8111-111111111111");
  let available = false;
  f.store.pull = async input => {
    available = input?.history?.length === 1 && input.history[0] === ref;
    return { status: "ok", result: PullResultSchema.parse({ states: [], pulls: [pulled] }) };
  };
  const read = () => Promise.resolve(available ? { status: "ok" as const, result: "saved state" } : { status: "refused" as const,
    refusal: { code: "state-unresolvable" as const, class: "recoverable" as const, condition: "Saved state unavailable.",
      remedy: { text: "Restore the named history." }, historyRefs: [ref] } });
  expect(await readStateHistory(read, bindStoreSyncPort(f.store))).toBe("saved state");
});

it.each([unreachable, refused])("keeps the original saved-state repair actionable after $code fetch failure", async failure => {
  const { port } = binding({ states: [], pulls: [{ ...pulled, status: "failed", failure }] });
  const read = () => Promise.resolve({ status: "refused" as const, refusal: { code: "state-unresolvable" as const,
    class: "recoverable" as const, condition: "Saved state unavailable.", remedy: { text: "Restore the named history." },
    historyRefs: [HistoryRefSchema.parse("refs/arc/history/work/11111111-1111-4111-8111-111111111111")] } });
  await expect(readStateHistory(read, port)).rejects.toThrow(
    /Saved state unavailable\..*Restore the named history\..*(?:Remote offline\.|Policy refusal\.).*Repair the remote and retry\./u);
});

it.each([unreachable, { code: "namespace-corrupt", class: "terminal", namespace: "project", condition: "Project namespace corrupt.", remedy }] as const)(
  "retains an outer $code refusal and succeeds after the selected store is repaired", async refusal => {
    const f = createReferenceFixture();
    f.store.pull = async () => ({ status: "refused", refusal: StoreRefusalSchema.parse(refusal) });
    const port = bindStoreSyncPort(f.store);
    expect(await port.pull()).toEqual({ status: refusal.code === "unreachable" ? "unreachable" : "incomplete", condition: refusal.condition, remedy });
    f.store.pull = async () => ({ status: "ok", result: PullResultSchema.parse({ states: [], pulls: [pulled] }) });
    expect(await port.pull()).toEqual({ status: "pulled" });
  });

it("preserves a maintenance refusal's condition and remedy and returns measurements after repair", async () => {
  const f = createReferenceFixture();
  f.store.maintain = async () => ({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: "maintenance",
    condition: "Maintenance is locked.", remedy: { text: "Release the maintenance lock and retry." } } });
  const port = bindStoreSyncPort(f.store);
  await expect(port.maintain()).rejects.toThrow("Maintenance is locked. Release the maintenance lock and retry.");
  f.store.maintain = async () => ({ status: "ok", result: { measurements: [] } });
  expect(await port.maintain()).toEqual({ measurements: [] });
});
