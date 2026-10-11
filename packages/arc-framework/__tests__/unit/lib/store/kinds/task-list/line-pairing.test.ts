/** Task-list pairing follows identifiers and source order rather than titles or roles. */
import { expect, it } from "vitest";
import { pairTaskLines } from "../../../../../../src/lib/store/kinds/task-list/line-pairing.js";
const list = (...lines: string[]) => `# Tasks\n\n## **Phase 1:** Work\n\n${lines.join("\n\n")}\n`;
const parent = (id: string, title: string, marker = " ") => `### \`[${marker}]\` **${id} ${title}**`;
it("pairs an unchanged identifier across title and marker changes", () => {
  const result = pairTaskLines(list(parent("1.1", "Original")), list(parent("1.1", "Renamed", "x")));
  expect(result.pairs).toMatchObject([{ prior: { marker: " ", item: { id: "1.1", title: "Original" } },
    next: { marker: "x", item: { id: "1.1", title: "Renamed" } } }]);
  expect(result.removed).toEqual([]);
});
it("pairs repeated identifiers in file order and leaves an extra next occurrence added", () => {
  const result = pairTaskLines(list(parent("1.1", "First"), parent("1.1", "Second")),
    list(parent("1.1", "Second"), parent("1.1", "First"), parent("1.1", "Third")));
  expect(result.pairs.map(({ prior, next }) => [prior?.item.title, next.item.title]))
    .toEqual([["First", "Second"], ["Second", "First"], [undefined, "Third"]]);
});
it("keeps unmatched prior lines in their own file order", () => {
  const result = pairTaskLines(list(parent("1.1", "First"), parent("1.2", "Middle"), parent("1.1", "Last")),
    list(parent("1.1", "Kept")));
  expect(result.removed.map(({ item }) => item.title)).toEqual(["Middle", "Last"]);
});
it("pairs an identifier across parent and subtask roles", () => {
  const result = pairTaskLines(list(parent("1.1", "Original")),
    list(parent("2.1", "Container"), "    - `[ ]` **1.1 Moved**"));
  expect(result.pairs).toMatchObject([{ next: { item: { id: "2.1" } } },
    { prior: { type: "parent", item: { id: "1.1" } }, next: { type: "subtask", item: { id: "1.1" } } }]);
});
it("treats a newly introduced identifier as added", () => {
  const result = pairTaskLines(list(parent("1.1", "Old")), list(parent("1.2", "New")));
  expect(result.pairs).toHaveLength(1);
  expect(result.pairs[0]?.prior).toBeUndefined();
  expect(result.pairs[0]?.next.item.id).toBe("1.2");
  expect(result.removed.map(({ item }) => item.id)).toEqual(["1.1"]);
});
it("pairs no prior line when the stored list fails its scanner", () => {
  const result = pairTaskLines(list(parent("1.1.1", "Bad")), list(parent("1.1", "Repaired")));
  expect(result.priorReadable).toBe(false);
  expect(result.pairs).toHaveLength(1);
  expect(result.pairs[0]?.prior).toBeUndefined();
  expect(result.removed).toEqual([]);
});
it("supplies no next lines when the proposed scan fails", () => {
  const result = pairTaskLines(list(parent("1.1", "Old")), list(parent("1.1.1", "Bad")));
  expect(result.nextReadable).toBe(false);
  expect(result.pairs).toEqual([]);
  expect(result.removed.map(({ item }) => item.id)).toEqual(["1.1"]);
});
it("treats creation lines as added and removal lines as unmatched", () => {
  const content = list(parent("1.1", "Task"));
  expect(pairTaskLines(undefined, content).pairs).toHaveLength(1);
  expect(pairTaskLines(content, undefined).removed).toHaveLength(1);
});
it("ignores task-shaped examples in fenced blocks and a delivery-plan section", () => {
  const result = pairTaskLines(undefined, list("```md", parent("1.1", "Fenced"), "```", parent("1.2", "Real"),
    "## Delivery Plan", parent("1.3", "Delivery example")));
  expect(result.pairs.map(({ next }) => next.item.id)).toEqual(["1.2"]);
});
