/** Closed lineage references and terminal-transition invariants. */
import { describe, it } from "vitest";
import { LineageRecordSchema } from "../../../../../../src/lib/store/kinds/lineage/schema.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../../../helpers/schema-assertion.js";

const ref = (name: string) => ({ name });
const replacement = (names = ["new-a", "new-b"]) => ({ kind: "replace", replacementTargets: names.map(ref) });
const incoming = (name = "consumer", disposition: ReturnType<typeof replacement> & Record<string, unknown> = replacement()) =>
  ({ dependent: ref(name), disposition });
const outgoing = (names = ["new-a", "new-b"]) => ({ prerequisite: ref("foundation"), members: names.map(ref) });
const record = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2, origin: ref("origin"), kind: "decompose", successors: [ref("new-a"), ref("new-b")],
  incoming: [incoming()], outgoing: [outgoing()], ...overrides,
});
const direct = (kind: "rename" | "abandon", overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2, origin: ref("origin"), kind, successors: kind === "rename" ? [ref("new-a")] : [],
  incoming: [], ...overrides,
});

describe("lineage record schema", () => {
  it.each([
    ["version one", record({ schemaVersion: 1 }), record()],
    ["extra record property", record({ sealed: true }), record()],
    ["primitive origin", record({ origin: "origin" }), record()],
    ["unsafe origin", record({ origin: ref("Origin_") }), record()],
    ["extra reference property", record({ origin: { ...ref("origin"), former: true } }), record()],
    ["decomposition without successors", record({ successors: [] }), record()],
    ["unordered successors", record({ successors: [ref("new-b"), ref("new-a")] }), record()],
    ["duplicate successor names", record({ successors: [ref("new-a"), { name: "new-a", uid: "6c45c1ac-1371-4cde-bc39-d3f832bfa8db" }] }), record()],
    ["unsafe successor", record({ successors: [ref("new_a")] }), record()],
    ["rename without a successor", direct("rename", { successors: [] }), direct("rename")],
    ["rename with two successors", direct("rename", { successors: [ref("new-a"), ref("new-b")] }), direct("rename")],
    ["abandonment with a successor", direct("abandon", { successors: [ref("new-a")] }), direct("abandon")],
    ["extra incoming property", record({ incoming: [{ ...incoming(), edgeId: "extra" }] }), record()],
    ["unsafe dependent", record({ incoming: [incoming("consumer_")] }), record()],
    ["duplicate dependents", record({ incoming: [incoming(), incoming()] }), record()],
    ["extra disposition property", record({ incoming: [incoming("consumer", { ...replacement(), extra: true })] }), record()],
    ["unsafe replacement target", record({ incoming: [incoming("consumer", replacement(["new_a"]))] }), record()],
    ["unordered replacement targets", record({ incoming: [incoming("consumer", replacement(["new-b", "new-a"]))] }), record()],
    ["duplicate replacement targets", record({ incoming: [incoming("consumer", replacement(["new-a", "new-a"]))] }), record()],
    ["blank drop reason", record({ incoming: [{ dependent: ref("consumer"), disposition: { kind: "drop", reason: " \t" } }] }),
      record({ incoming: [{ dependent: ref("consumer"), disposition: { kind: "drop", reason: "No remaining dependency" } }] })],
    ["unknown disposition", record({ incoming: [{ dependent: ref("consumer"), disposition: { kind: "retarget" } }] }), record()],
    ["rename with incoming", direct("rename", { incoming: [incoming()] }), direct("rename")],
    ["abandonment with incoming", direct("abandon", { incoming: [incoming()] }), direct("abandon")],
    ["decomposition without outgoing", record({ outgoing: undefined }), record({ outgoing: [] })],
    ["rename with outgoing", direct("rename", { outgoing: [] }), direct("rename")],
    ["abandonment with outgoing", direct("abandon", { outgoing: [] }), direct("abandon")],
    ["extra outgoing property", record({ outgoing: [{ ...outgoing(), reason: "extra" }] }), record()],
    ["unsafe prerequisite", record({ outgoing: [{ ...outgoing(), prerequisite: ref("bad_") }] }), record()],
    ["duplicate prerequisites", record({ outgoing: [outgoing(), outgoing([])] }), record()],
    ["unsafe member", record({ outgoing: [outgoing(["bad_"])] }), record()],
    ["unordered members", record({ outgoing: [outgoing(["new-b", "new-a"])] }), record()],
    ["duplicate members", record({ outgoing: [outgoing(["new-a", "new-a"])] }), record()],
    ["outgoing of wrong shape", record({ outgoing: [outgoing(["new-a", "new-a"])] }),
      record({ incoming: [incoming("consumer", replacement([]))], outgoing: [outgoing(["existing-home"])] })],
    ["missing required list", record({ incoming: undefined }), record({ incoming: [], outgoing: [outgoing([])] })],
  ])("refuses %s and admits its valid counterpart", (_label, invalid, valid) => {
    assertSchemaRefuses(LineageRecordSchema, invalid);
    assertSchemaAccepts(LineageRecordSchema, valid);
  });

  it.each(["origin", "successor", "dependent", "replacement", "prerequisite", "member"])(
    "validates the optional UID on each %s reference", (location) => {
      const withUid = (uid: string) => {
        const value = record();
        const reference = location === "origin" ? value.origin : location === "successor" ? value.successors[0]
          : location === "dependent" ? value.incoming[0]?.dependent
            : location === "replacement" ? value.incoming[0]?.disposition.replacementTargets[0]
              : location === "prerequisite" ? value.outgoing[0]?.prerequisite : value.outgoing[0]?.members[0];
        Object.assign(reference ?? {}, { uid });
        return value;
      };
      assertSchemaRefuses(LineageRecordSchema, withUid("not-a-uuid"));
      assertSchemaAccepts(LineageRecordSchema, withUid("6c45c1ac-1371-4cde-bc39-d3f832bfa8db"));
    },
  );
});
