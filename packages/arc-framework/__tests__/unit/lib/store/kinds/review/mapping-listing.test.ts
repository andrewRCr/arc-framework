/** Import source coverage retains full path identities and aggregates leftover worktrees once. */
import { expect, it } from "vitest";
import { collectReviewMappingSources, reviewMappingListingEntry } from "../../../../../../src/lib/store/kinds/review/mapping-listing.js";
import type { ReviewMappingInput } from "../../../../../../src/lib/store/kinds/review/mapping-types.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../../src/lib/store/identity.js";

const uid = "123e4567-e89b-42d3-a456-426614174000";

function input(): ReviewMappingInput {
  return { projectId: "project-1", workItems: [{ kind: "work-unit", slug: "example", uid, live: true }],
    gate: [{ path: "arc/review-gate/operations/operation-a.json", bytes: new TextEncoder().encode("{}") }],
    candidates: [{ workItem: uid, versions: ["a", "b"].map((character) => ({ commit: character.repeat(40), content: "{}" })),
      boundary: "{}" }] };
}

it("accounts for every supplied gate file, Candidate version, and boundary under its complete source identity", () => {
  const sources = collectReviewMappingSources(input());
  expect(sources.map(({ source }) => source)).toEqual([
    "arc/review-gate/operations/operation-a.json",
    `.arc/system/.internal/candidates/example.json@${"a".repeat(40)}`,
    `.arc/system/.internal/candidates/example.json@${"b".repeat(40)}`,
    ".arc/system/.internal/candidates/example.boundary.json",
  ]);
  expect(sources.map(({ kind }) => kind)).toEqual(["gate", "candidate", "candidate", "boundary"]);
});

it("lists a partially mapped receipt ledger once with its produced references and leftover entry identities", () => {
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid });
  const reference = recordReferences["review/outcome"](owner, "local-result-1");
  const source = "arc/review-gate/evidence/receipts-v2.json";
  expect(reviewMappingListingEntry({ source, records: [reference],
    leftBehind: ["ended request receipt-a", "unjoined receipt-b"] }))
    .toEqual({ source, outcome: "mapped", records: [reference], reason: "Left behind: ended request receipt-a; unjoined receipt-b" });
});

it("lists each leftover materialization once by its trailing-slash folder without listing descendants again", () => {
  const value = input();
  const first = `arc/review-gate/materializations/local-${"a".repeat(64)}/`;
  const second = `arc/review-gate/materializations/local-${"b".repeat(64)}/`;
  value.gate = [`${first}.git`, `${first}src/main.ts`, `${second}src/nested/other.ts`]
    .map((path) => ({ path, bytes: new TextEncoder().encode("working materialization") }));
  value.candidates = [];
  expect(collectReviewMappingSources(value)).toEqual([
    { kind: "materialization", source: first },
    { kind: "materialization", source: second },
  ]);
});

it("marks an in-flight source without retaining any of that file's mapped references", () => {
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid });
  const reference = recordReferences["review/outcome"](owner, "local-result-1");
  const source = "arc/review-gate/operations/operation-a.json";
  expect(reviewMappingListingEntry({ source, records: [reference], leftBehind: [], inFlight: "Pending attempt local-2" }))
    .toEqual({ source, outcome: "in-flight", reason: "Pending attempt local-2", records: [] });
});

it("lists a source with no portable records as left behind with its supplied reason", () => {
  const source = "arc/review-gate/identity/repository-identity.json";
  expect(reviewMappingListingEntry({ source, records: [], leftBehind: ["Repository identity becomes the project ID."] }))
    .toEqual({ source, outcome: "left-behind", reason: "Repository identity becomes the project ID.", records: [] });
});
