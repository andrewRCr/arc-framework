/** Observable three-way text merge behavior and byte preservation. */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { lint } from "markdownlint/promise";
import { displayWidth } from "../../../../../src/lib/markdown/display-width.js";
import type { RecordReference } from "../../../../../src/lib/store/identity.js";
import { mergeLineText, type MergeTextInput } from "../../../../../src/lib/store/concurrency/line-merge.js";

const record = {owner:{type:"person",name:"owner"},kind:"personal/document",key:"notes.md"} as RecordReference;
const currentLabel = {actor:"current-session",time:"2026-10-01T00:00:00Z"};
const incomingLabel = {actor:"incoming-session",time:"2026-10-01T01:00:00Z"};
function input(base: string,current: string,incoming: string): MergeTextInput {
  return {base,current,incoming,record,currentLabel,incomingLabel};
}

function table(width: number, first = "a", last = "c"): string {
  return [
    `| Key | ${"Value".padEnd(width)} |`,
    `| --- | ${"-".repeat(width)} |`,
    `| one | ${first.padEnd(width)} |`,
    `| two | ${"b".padEnd(width)} |`,
    `| tri | ${last.padEnd(width)} |`,
  ].join("\n");
}

describe("Markdown table padding", () => {
  it("merges separated row edits that widen aligned columns", () => {
    const result = mergeLineText(input(table(5), table(12, "current-wide"), table(15, "a", "incoming-longer")));
    expect(result).toEqual({content:table(15, "current-wide", "incoming-longer"),conflicts:[]});
  });

  it("records only the real clash using original padded sides and base indices", () => {
    const base = table(5), current = table(12, "current-wide"), incoming = table(15, "incoming-longer", "last-edit");
    const result = mergeLineText(input(base, current, incoming));
    expect(result.content).toBe(table(12, "current-wide", "last-edit"));
    expect(result.conflicts).toEqual([{record,location:{kind:"hunk",start:2,end:3},base:base.split("\n")[2],
      current:{content:current.split("\n")[2],label:currentLabel},incoming:{content:incoming.split("\n")[2],label:incomingLabel}}]);
  });

  it("retains an aligned current table's wider padding beside an incoming row edit", () => {
    expect(mergeLineText(input(table(5),table(20),table(5,"edit"))))
      .toEqual({content:table(20,"edit"),conflicts:[]});
  });

  it("accepts identical row insertions with different padding without a false conflict", () => {
    const insert = (width:number) => table(width).replace(`| two | ${"b".padEnd(width)} |`,
      `| new | ${"inserted".padEnd(width)} |\n| two | ${"b".padEnd(width)} |`);
    expect(mergeLineText(input(table(5),insert(12),insert(15))))
      .toEqual({content:insert(12),conflicts:[]});
  });

  it("retains padding across optional outer pipes and a one-hyphen delimiter", () => {
    const unbordered = (width:number,first:string,last:string) => table(width,first,last).split("\n")
      .map((line) => line.slice(2,-2)).join("\n");
    const base = unbordered(5,"a","c").replace("--- | -----","| - | - |");
    const result = mergeLineText(input(base,unbordered(12,"current-wide","c"),unbordered(15,"a","incoming-longer")));
    expect(result).toEqual({content:table(15,"current-wide","incoming-longer"),conflicts:[]});
  });

  it("keeps compact current tables compact when the base was aligned", () => {
    const compact = (first:string,last:string) => `Key|Value\n---|-----\none|${first}\ntwo|b\ntri|${last}`;
    expect(mergeLineText(input(table(5),compact("current-wide","c"),compact("a","incoming-longer"))))
      .toEqual({content:compact("current-wide","incoming-longer"),conflicts:[]});
  });

  it.each(["表","e\u0301","👩‍💻","🧑🏽‍💻","🇺🇸","1\u20e3",String.raw`left\|right`,String.raw`left\\\|right`])(
    "retains raw %s text and produces padding accepted by MD060", async (value) => {
      const aligned = (width:number,first:string,last:string) => table(width)
        .replace(`a${" ".repeat(width-1)}`,first+" ".repeat(width-displayWidth(first)))
        .replace(`c${" ".repeat(width-1)}`,last+" ".repeat(width-displayWidth(last)));
      const first = `wide-${value}`;
      const currentWidth = Math.max(5,displayWidth(first));
      const result = mergeLineText(input(aligned(5,"a","c"),aligned(currentWidth,first,"c"),aligned(20,"a","incoming-longer")));
      expect(result.conflicts).toEqual([]);
      expect(result.content).toContain(first);
      expect(result.content).toContain("incoming-longer");
      expect((await lint({strings:{"merged.md":result.content},config:{default:false,MD060:{style:"aligned"}}}))["merged.md"])
        .toEqual([]);
    });

  it.each([
    ["```markdown\n","\n```"], ["~~~~md\n","\n~~~~~"], ["<!--\n","\n-->"],
  ])("normalizes real tables while leaving table-shaped code or HTML opaque: %s", (opening,closing) => {
    expect(mergeLineText(input(table(5),table(12,"current-wide"),table(15,"a","incoming-longer"))).conflicts).toEqual([]);
    const wrap = (text:string) => opening+text+closing;
    const base = wrap(table(5)), current = wrap(table(12,"current-wide")), incoming = wrap(table(15,"a","incoming-longer"));
    const result = mergeLineText(input(base,current,incoming));
    expect(result.content).toBe(current);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.location).toEqual({kind:"hunk",start:1,end:6});
  });

  it("keeps alignment colons meaningful while ignoring delimiter hyphen counts", () => {
    const base = table(5).replace("| --- | ----- |","| --- | :---: |");
    const current = table(12,"current-wide").replace("| --- | ------------ |","| --- | :----------: |");
    const incoming = table(15,"a","incoming-longer").replace("| --- | --------------- |","| --- | :-------------: |");
    expect(mergeLineText(input(base,current,incoming)))
      .toEqual({content:table(15,"current-wide","incoming-longer").replace("| --- | --------------- |","| --- | :-------------: |"),conflicts:[]});
    const clash = mergeLineText(input(base,current.replace(":----------:",":-----------"),incoming.replace(":-------------:","--------------:")));
    expect(clash.conflicts[0]).toMatchObject({location:{kind:"hunk",start:1,end:3},
      base:base.split("\n").slice(1,3).join("\n")});
  });

  it.each([[":----","----:"],["----:",":----"]])(
    "preserves delimiter-only conflicts between %s and %s", (left,right) => {
      const base = table(5);
      const current = base.replace("-----",left);
      const incoming = base.replace("-----",right);
      expect(mergeLineText(input(base,current,incoming))).toEqual({content:current,conflicts:[{
        record,location:{kind:"hunk",start:1,end:2},base:base.split("\n")[1],
        current:{content:current.split("\n")[1],label:currentLabel},
        incoming:{content:incoming.split("\n")[1],label:incomingLabel},
      }]});
    });

  it.each([[":----",":-----------",":--------------"],["----:","-----------:","--------------:"],
    [":---:",":----------:",":-------------:"]])(
    "ignores delimiter hyphen-count changes while retaining %s alignment", (original,left,right) => {
      const base = table(5).replace("-----",original);
      const current = table(12,"current-wide").replace("------------",left);
      const incoming = table(15,"a","incoming-longer").replace("---------------",right);
      expect(mergeLineText(input(base,current,incoming)))
        .toEqual({content:table(15,"current-wide","incoming-longer").replace("---------------",right),conflicts:[]});
    });

  it("tracks the current table through inserted lines and differing table widths", () => {
    const base = `Opening\n\n${table(5)}\n\nBetween\n\n${table(5)}\n`;
    const current = `New opening\nExtra\n\n${table(12,"current-wide")}\n\nBetween\n\n${table(20)}\n`;
    const incoming = `Opening\n\n${table(15,"a","incoming-longer")}\n\nBetween\n\n${table(5,"edit")}\n`;
    expect(mergeLineText(input(base,current,incoming)))
      .toEqual({content:`New opening\nExtra\n\n${table(15,"current-wide","incoming-longer")}\n\nBetween\n\n${table(20,"edit")}\n`,conflicts:[]});
  });

  it.each(["\n","\r\n"])("preserves untouched table bytes beside prose-only edits: %j", (newline) => {
    const unchanged = "| A | B |\n| - | - |\n| x | y |";
    const document = (opening:string,footer:string) => `${opening}\n\n${unchanged}\n\n${footer}\n`.replaceAll("\n",newline);
    const base = document("Opening","Footer");
    const current = document("Current opening\nExtra","Footer");
    const incoming = document("Opening","Incoming footer");
    expect(mergeLineText(input(base,current,incoming)))
      .toEqual({content:document("Current opening\nExtra","Incoming footer"),conflicts:[]});
  });

  it("preserves an untouched table while repadding another edited table", () => {
    const unchanged = "| A | B |\n| - | - |\n| x | y |";
    const document = (opening:string,body:string) => `${opening}\n\n${unchanged}\n\nBetween\n\n${body}`;
    const result = mergeLineText(input(document("Opening",table(5)),
      document("Current opening",table(12,"current-wide")),document("Opening",table(15,"a","incoming-longer"))));
    expect(result).toEqual({content:document("Current opening",table(15,"current-wide","incoming-longer")),conflicts:[]});
  });

  it.each(["\n","\r\n"])("preserves current container prefixes and newline bytes: %j", (newline) => {
    const wrap = (text:string) => text.split("\n").map((line)=>`> ${line}`).join(newline)+newline;
    expect(mergeLineText(input(wrap(table(5)),wrap(table(12,"current-wide")),wrap(table(15,"a","incoming-longer")))))
      .toEqual({content:wrap(table(15,"current-wide","incoming-longer")),conflicts:[]});
  });
});

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
