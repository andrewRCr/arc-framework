/** Whole-queue ordering changes only the necessary entry rank fields. */
import { describe, expect, it } from "vitest";
import { queueRankAssignments } from "../../../../src/lib/inbox/queue-ranks.js";

const member = (id: string, rank: string) => ({ id, rank, inbox: "personal" as const });
const request = (...ids: string[]) => ids.map((id) => ({ id, inbox: "personal" as const }));
describe("queue rank assignment", () => {
  it("keeps the earliest current longest subsequence, moving only the other member", () => {
    const assignments = queueRankAssignments([member("a", "a0"), member("b", "a1"), member("c", "a2")], request("b", "a", "c"));
    expect(assignments.map(({ uid }) => uid)).toEqual(["b"]);
    expect((assignments[0]?.rank ?? "") < "a0").toBe(true);
  });
  it("rekeys tied successors in the same assignment when placing after a tied lower rank", () => {
    const assignments = queueRankAssignments([member("a", "a0"), member("b", "a0")], request("a", "new", "b"));
    expect(assignments.map(({ uid }) => uid)).toEqual(["new", "b"]);
    expect((assignments[0]?.rank ?? "") < (assignments[1]?.rank ?? "")).toBe(true);
  });
  it("assigns only a newly appended member and retains unchanged rank keys", () => {
    const assignments = queueRankAssignments([member("a", "a0"), member("b", "a1")], request("a", "b", "new"));
    expect(assignments.map(({ uid }) => uid)).toEqual(["new"]);
    expect((assignments[0]?.rank ?? "") > "a1").toBe(true);
  });
});
