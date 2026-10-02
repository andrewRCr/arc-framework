/** Observable three-way text merge behavior and byte preservation. */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { RecordReference } from "../../../../../src/lib/store/identity.js";
import { mergeLineText, type MergeTextInput } from "../../../../../src/lib/store/concurrency/line-merge.js";

const record = {owner:{type:"person",name:"owner"},kind:"personal/document",key:"notes.md"} as RecordReference;
const currentLabel = {actor:"current-session",time:"2026-10-01T00:00:00Z"};
const incomingLabel = {actor:"incoming-session",time:"2026-10-01T01:00:00Z"};
function input(base: string,current: string,incoming: string): MergeTextInput {
  return {base,current,incoming,record,currentLabel,incomingLabel};
}

describe("three-way prose merge", () => {
  it("merges edits separated by unchanged regions", () => {
    expect(mergeLineText(input("a\nb\nc\nd\ne\n","A\nb\nc\nd\ne\n","a\nb\nc\nd\nE\n")))
      .toEqual({content:"A\nb\nc\nd\nE\n",conflicts:[]});
  });
});


it("preserves touching conflicting hunks as labelled data with a base line range", () => {
  const result = mergeLineText(input("a\nb\nc\nd","a\nB\nc\nd","a\nb\nC\nd"));
  expect(result.content).toBe("a\nB\nc\nd");
  expect(result.conflicts).toEqual([{record,location:{kind:"hunk",start:1,end:3},base:"b\nc",
    current:{content:"B\nc",label:currentLabel},incoming:{content:"b\nC",label:incomingLabel}}]);
  const overlap = mergeLineText(input("before\nbase\nafter","before\ncurrent\nafter","before\nincoming\nafter"));
  expect(overlap.content).toBe("before\ncurrent\nafter");
  expect(overlap.conflicts[0]!.location).toEqual({kind:"hunk",start:1,end:2});
});


it("merges a final newline added or removed by either writer independently", () => {
  expect(mergeLineText(input("base","base","base\n"))).toEqual({content:"base\n",conflicts:[]});
  expect(mergeLineText(input("base\n","base\n","base"))).toEqual({content:"base",conflicts:[]});
  expect(mergeLineText(input("base","base\n","base"))).toEqual({content:"base\n",conflicts:[]});
  expect(mergeLineText(input("base\n","base","base\n"))).toEqual({content:"base",conflicts:[]});
});


it("accepts identical edits on both sides without a false conflict", () => {
  expect(mergeLineText(input("before\nbase\nafter","before\nedit\nafter","before\nedit\nafter")))
    .toEqual({content:"before\nedit\nafter",conflicts:[]});
});

it("takes an emptied side against unchanged text and keeps empty as a real conflicting side", () => {
  expect(mergeLineText(input("base\n","base\n",""))).toEqual({content:"",conflicts:[]});
  expect(mergeLineText(input("base\n","","base\n"))).toEqual({content:"",conflicts:[]});
  const result = mergeLineText(input("base\n","","edited\n"));
  expect(result.content).toBe("");
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0]!.current.content).toBe("");
  expect(result.conflicts[0]!.incoming.content).toBe("edited");
});

it("returns the other side byte for byte when one side is unchanged", () => {
  const text = fc.array(fc.constantFrom("a","b","\n","\r"," ","\t","é","💡"),{maxLength:80}).map((characters) => characters.join(""));
  fc.assert(fc.property(text,text,(base,edit) => {
    expect(mergeLineText(input(base,base,edit))).toEqual({content:edit,conflicts:[]});
    expect(mergeLineText(input(base,edit,base))).toEqual({content:edit,conflicts:[]});
  }), {numRuns:400});
});
