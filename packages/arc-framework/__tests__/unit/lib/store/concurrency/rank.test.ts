/** Stored rank format and ordering behavior. */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { generateRankBetween, placeRankedStub } from "../../../../../src/lib/store/concurrency/rank.js";

describe("fractional ranks", () => {
  it("keeps the classic stored base-62 key format", () => {
    expect(generateRankBetween(null, null)).toBe("a0");
    expect(generateRankBetween("a0", null)).toBe("a1");
    expect(generateRankBetween(null, "a0")).toBe("Zz");
    expect(generateRankBetween("a0", "a1")).toBe("a0V");
    expect(generateRankBetween("a0", "a0V")).toBe("a0G");
  });
});


describe("ranked stub placement", () => {
  it("rekeys the moved stub and only tied successors above its position", () => {
    const list = [{uid:"a",rank:"a0"}, {uid:"b",rank:"a0"}, {uid:"c",rank:"a0"}, {uid:"d",rank:"a1"}];
    const changes = placeRankedStub(list, 1, "z");
    expect(changes.map((stub) => stub.uid)).toEqual(["z", "b", "c"]);
    expect(changes[0]!.rank > "a0").toBe(true);
    expect(changes[2]!.rank < "a1").toBe(true);
    expect(changes[0]!.rank < changes[1]!.rank).toBe(true);
    expect(changes[1]!.rank < changes[2]!.rank).toBe(true);
    expect(placeRankedStub(list, 0, "z")).toHaveLength(1);
    expect(placeRankedStub(list, 4, "z")).toHaveLength(1);
    expect(placeRankedStub(list, 2, "a").map((stub) => stub.uid)).toEqual(["a"]);
  });

  it("refuses reversed neighbours and malformed lists instead of guessing", () => {
    expect(() => generateRankBetween("a1", "a0")).toThrow();
    expect(() => generateRankBetween("a0", "a0")).toThrow();
    expect(() => generateRankBetween("bogus!", null)).toThrow();
    expect(() => placeRankedStub([{uid:"b",rank:"a0"},{uid:"a",rank:"a0"}],1,"z")).toThrow();
    expect(() => placeRankedStub([{uid:"a",rank:"a0"},{uid:"a",rank:"a1"}],1,"z")).toThrow();
    expect(() => placeRankedStub([], -1, "z")).toThrow();
    expect(() => placeRankedStub([], 1, "z")).toThrow();
  });
});


describe("rank properties", () => {
  it("sorts strictly between ordered bounds including open ends", () => {
    fc.assert(fc.property(fc.array(fc.nat(100), {maxLength:60}), fc.nat(), (steps, draw) => {
      const keys: string[] = [];
      for (const step of steps) {
        const position = step % (keys.length + 1);
        keys.splice(position, 0, generateRankBetween(keys[position - 1] ?? null, keys[position] ?? null));
      }
      const position = draw % (keys.length + 1);
      const lower = keys[position - 1] ?? null;
      const upper = keys[position] ?? null;
      const key = generateRankBetween(lower, upper);
      expect(lower === null || lower < key).toBe(true);
      expect(upper === null || key < upper).toBe(true);
    }), {numRuns:300});
  });

  it("lands at every generated list position and rekeys only tied successors", () => {
    fc.assert(fc.property(fc.array(fc.nat(8), {maxLength:40}), fc.nat(), (ranks, draw) => {
      const keys: string[] = [];
      for (let index=0; index<9; index++) keys.push(generateRankBetween(keys.at(-1) ?? null,null));
      const list = ranks.map((rank,index) => ({rank:keys[rank]!,uid:String(index).padStart(3,"0")}))
        .sort((left,right) => left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : left.uid < right.uid ? -1 : 1);
      const position = draw % (list.length + 1);
      const changes = placeRankedStub(list,position,"new");
      const changed = new Map(changes.map((stub) => [stub.uid,stub.rank]));
      const merged = [...list.map((stub) => ({...stub,rank:changed.get(stub.uid) ?? stub.rank})),changes[0]!]
        .sort((left,right) => left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : left.uid < right.uid ? -1 : 1);
      expect(merged[position]!.uid).toBe("new");
      const tie = list[position-1]?.rank === list[position]?.rank && position > 0 && position < list.length;
      const successors = tie ? list.slice(position).filter((stub) => stub.rank === list[position]!.rank) : [];
      expect(changes.map((stub) => stub.uid)).toEqual(["new", ...successors.map((stub) => stub.uid)]);
    }), {numRuns:300});
  });
});
