/** The import's publication reaches the mirror: every ref the state push publishes, at the copy's object. */
import { expect, it } from "vitest";
import { unpublishedRehearsalRefs } from "../../../../src/scripts/cutover-window/rehearse-publication.js";

const registry = "refs/arc/project/registry";
const work = "refs/arc/work/00a08287-e096-4f6e-aa79-d05c1dc89857";
const personal = "refs/arc/user/andrew/personal";
const a = "a".repeat(40), b = "b".repeat(40), c = "c".repeat(40), d = "d".repeat(40), e = "e".repeat(40);
const f = "f".repeat(40), x = "9".repeat(40);

it("names each published ref the mirror lacks or holds at another object", () => {
  const local = new Map([[registry, a], [work, b], [personal, c]]);
  expect(unpublishedRehearsalRefs(local, new Map([[registry, a], [work, x]]), "andrew")).toEqual([
    `${work}: copy ${b}, mirror ${x}`, `${personal}: copy ${c}, mirror absent`]);
});

it("leaves out refs the state push never publishes", () => {
  const local = new Map([[registry, a], ["refs/arc/user/andrew/errands", d], ["refs/arc/user/bea/personal", e],
    ["refs/arc/tmp/migrate/import/kept/main", f]]);
  expect(unpublishedRehearsalRefs(local, new Map([[registry, a]]), "andrew")).toEqual([]);
});

it("publishes no personal ref without a configured identity", () => {
  expect(unpublishedRehearsalRefs(new Map([[registry, a], [personal, c]]), new Map([[registry, a]]), null)).toEqual([]);
});
