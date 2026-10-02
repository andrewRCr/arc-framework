/** Concurrent identity-keyed entry operations and observed removals. */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { keyedReference, OwnerIdentitySchema } from "../../../../../src/lib/store/identity.js";
import { splitEntryList, type EntryListConfig } from "../../../../../src/lib/store/concurrency/entries.js";
import { mergeEntryText } from "../../../../../src/lib/store/concurrency/entry-merge.js";

const record = keyedReference(OwnerIdentitySchema.parse({type:"person",name:"owner"}),"personal/document","list.md");
const currentLabel = {actor:"current",time:"2026-10-01T00:00:00Z"};
const incomingLabel = {actor:"incoming",time:"2026-10-01T01:00:00Z"};
const config: EntryListConfig = {shape:"heading",sections:["One","Two"]};
function entry(id: string,text = id,title = id): string {return `### **${title}**\n\n- _Id:_ \`${id}\`\n\n${text}\n\n`;}
function doc(one: string,two = "",opening = "Opening"): string {return `${opening}\n\n## One\n\n${one}## Two\n\n${two}---\nFooter\n`;}
function merge(base:string,current:string,incoming:string) {return mergeEntryText({base,current,incoming,record,currentLabel,incomingLabel},config);}
function entries(content:string) {return splitEntryList(content,config).parts.filter((part)=>part.kind === "entry");}

describe("entry insertion", () => {
  it("merges disjoint insertions deterministically including at the same anchor", () => {
    const base = doc(entry("11111111"));
    const current = doc(entry("11111111")+entry("33333333"));
    const incoming = doc(entry("11111111")+entry("22222222"));
    const forward = merge(base,current,incoming);
    expect(forward.conflicts).toEqual([]);
    expect(entries(forward.content).map((value)=>value.id)).toEqual(["11111111","22222222","33333333"]);
    expect(merge(base,incoming,current).content).toBe(forward.content);
    const disjoint = merge(doc(entry("11111111"),entry("44444444")),doc(entry("11111111")+entry("22222222"),entry("44444444")),doc(entry("11111111"),entry("44444444")+entry("33333333")));
    expect(entries(disjoint.content).map((value)=>value.id)).toEqual(["11111111","22222222","44444444","33333333"]);
    expect(disjoint.conflicts).toEqual([]);
  });
});

describe("whole-entry editing", () => {
  it("takes a one-sided edit and treats an identity-preserving retitle as that edit", () => {
    const base = doc(entry("11111111","body","Old"));
    const edited = doc(entry("11111111","new body","New"));
    expect(merge(base,base,edited)).toEqual({content:edited,conflicts:[]});
    expect(merge(base,edited,base)).toEqual({content:edited,conflicts:[]});
  });

  it("accepts identical edits without a clash", () => {
    const base = doc(entry("11111111"));
    const edited = doc(entry("11111111","edited"));
    expect(merge(base,edited,edited)).toEqual({content:edited,conflicts:[]});
  });

  it("keeps the current whole entry and labels both sides of a differing edit", () => {
    const original = entry("11111111","base");
    const a = entry("11111111","a\nunchanged");
    const b = entry("11111111","base\nb");
    const result = merge(doc(original),doc(a),doc(b));
    expect(entries(result.content)[0]!.bytes).toBe(a.trimEnd());
    expect(result.conflicts).toEqual([{record,location:{kind:"entry",id:"11111111"},base:original.trimEnd(),
      current:{content:a.trimEnd(),label:currentLabel},incoming:{content:b.trimEnd(),label:incomingLabel}}]);
  });

  it("makes a section move racing an edit a whole-entry clash", () => {
    const base = doc(entry("11111111"));
    const moved = doc("",entry("11111111"));
    const edited = doc(entry("11111111","edited"));
    const result = merge(base,moved,edited);
    expect(entries(result.content)[0]!.section).toBe("Two");
    expect(result.conflicts[0]!.location).toEqual({kind:"entry",id:"11111111"});
    expect(merge(base,edited,moved).conflicts).toHaveLength(1);
  });
});

describe("observed removal", () => {
  it("removes exactly the observed version while concurrent edits survive", () => {
    const base = doc(entry("11111111")+entry("22222222"));
    const removed = doc(entry("22222222"));
    const edited = doc(entry("11111111","edited")+entry("22222222"));
    expect(entries(merge(base,removed,base).content).map((value)=>value.id)).toEqual(["22222222"]);
    expect(entries(merge(base,base,removed).content).map((value)=>value.id)).toEqual(["22222222"]);
    expect(entries(merge(base,removed,removed).content).map((value)=>value.id)).toEqual(["22222222"]);
    for (const [current,incoming] of [[removed,edited],[edited,removed]]) {
      const result = merge(base,current!,incoming!);
      expect(entries(result.content).map((value)=>value.id)).toEqual(["11111111","22222222"]);
      expect(entries(result.content)[0]!.bytes).toContain("edited");
      expect(result.conflicts).toEqual([]);
    }
  });

  it("has no recency ordering in removal-versus-edit outcomes", () => {
    const base = doc(entry("11111111"));
    const edited = doc(entry("11111111","edited"));
    const removed = doc("");
    const result = mergeEntryText({base,current:removed,incoming:edited,record,currentLabel:incomingLabel,incomingLabel:currentLabel},config);
    expect(entries(result.content)[0]!.bytes).toContain("edited");
    expect(result.conflicts).toEqual([]);
  });
});

describe("surrounding prose", () => {
  it("merges disjoint prose edits beside concurrent entry insertions", () => {
    const base = doc(entry("11111111"));
    const current = doc(entry("11111111")+entry("22222222"),"","Opening edited");
    const incoming = doc(entry("11111111")+entry("33333333")).replace("Footer","Footer edited");
    const result = merge(base,current,incoming);
    expect(result.content).toContain("Opening edited");
    expect(result.content).toContain("Footer edited");
    expect(entries(result.content).map((value)=>value.id)).toEqual(["11111111","22222222","33333333"]);
    expect(result.conflicts).toEqual([]);
  });

  it("keeps a current prose clash and records the incoming text at its original base lines", () => {
    const base = doc(entry("11111111"));
    const result = merge(base,base.replace("Footer","Current footer"),base.replace("Footer","Incoming footer"));
    expect(result.content).toContain("Current footer");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({location:{kind:"hunk",start:base.split("\n").indexOf("Footer"),end:base.split("\n").indexOf("Footer")+1},base:"Footer",
      current:{content:"Current footer",label:currentLabel},incoming:{content:"Incoming footer",label:incomingLabel}});
  });

  it("retains comment prose and separators when its preceding entry moves or is removed", () => {
    const commented = doc(entry("11111111")+'<!-- retained comment -->\n\n'+entry("22222222"));
    const removed = commented.replace(entry("11111111"),"");
    const result = merge(commented,removed,commented.replace("Footer","edited footer"));
    expect(result.content).toContain("<!-- retained comment -->");
    expect(result.content.indexOf("retained comment")).toBeLessThan(result.content.indexOf("22222222"));
    expect(entries(result.content).map((value)=>value.id)).toEqual(["22222222"]);
    const moved = doc('<!-- retained comment -->\n\n'+entry("22222222"),entry("11111111"));
    const movement = merge(commented,moved,commented.replace("Footer","edited footer"));
    expect(movement.content.indexOf("retained comment")).toBeLessThan(movement.content.indexOf("22222222"));
    expect(movement.conflicts).toEqual([]);
  });

  it("merges a separator-only edit as prose without changing the entry body", () => {
    const base = doc(entry("11111111"));
    const extra = base.replace("11111111\n\n## Two","11111111\n\n\n## Two");
    const result = merge(base,extra,base.replace("Footer","edited"));
    expect(result.content).toContain("11111111\n\n\n## Two");
    expect(result.conflicts).toEqual([]);
  });
});


it("merges comment-only edits outside an entry without turning them into entry clashes", () => {
  const base = doc(entry("11111111")+'<!-- comment -->\n\n'+entry("22222222"));
  const current = base.replace("<!-- comment -->","<!-- edited comment -->");
  const incoming = base.replace("11111111\n\n<!--", "edited entry\n\n<!--");
  const result = merge(base,current,incoming);
  expect(result.conflicts).toEqual([]);
  expect(result.content).toContain("<!-- edited comment -->");
  expect(result.content).toContain("edited entry");
});

describe("entry merge properties", () => {
  const scenario = fc.record({
    size:fc.integer({min:1,max:12}),left:fc.array(fc.integer({min:0,max:3}),{minLength:12,maxLength:12}),
    right:fc.array(fc.integer({min:0,max:3}),{minLength:12,maxLength:12}),insert:fc.integer({min:0,max:12}),
  }).map(({size,left,right,insert}) => {
    const ids = Array.from({length:size},(_,index)=>(index+1).toString(16).padStart(8,"0"));
    const base = ids.map((id)=>entry(id));
    function side(actions:number[],extra:string): string {
      const entries = ids.flatMap((id,index)=>actions[index] === 0 ? [] : [entry(id,actions[index] === 1 ? id : `edit-${actions[index]}`)]);
      entries.splice(insert%(entries.length+1),0,entry(extra));
      return doc(entries.join(""));
    }
    return {base:doc(base.join("")),current:side(left,"aaaaaaaa"),incoming:side(right,"bbbbbbbb")};
  });

  it("swapping roles changes only each conflicted entry's retained side", () => {
    fc.assert(fc.property(scenario,({base,current,incoming})=> {
      const a = merge(base,current,incoming);
      const b = merge(base,incoming,current);
      const clashes = new Set(a.conflicts.flatMap((value)=>value.location.kind === "entry" ? [value.location.id] : []));
      const ae = new Map(entries(a.content).map((value)=>[value.id,value.bytes]));
      const be = new Map(entries(b.content).map((value)=>[value.id,value.bytes]));
      expect([...ae.keys()].sort()).toEqual([...be.keys()].sort());
      for (const [id,bytes] of ae) if (!clashes.has(id ?? "")) expect(be.get(id)).toBe(bytes);
      if (clashes.size === 0) expect(a.content).toBe(b.content);
      for (const clash of a.conflicts) {
        if (clash.location.kind !== "entry") continue;
        expect(ae.get(clash.location.id)).toBe(clash.current.content);
        expect(be.get(clash.location.id)).toBe(clash.incoming.content);
      }
    }),{numRuns:300});
  });

  it("loses no side's entry except a removal of its observed unchanged version", () => {
    fc.assert(fc.property(scenario,({base,current,incoming})=> {
      const original = new Map(entries(base).map((value)=>[value.id,value.bytes]));
      const left = new Map(entries(current).map((value)=>[value.id,value.bytes]));
      const right = new Map(entries(incoming).map((value)=>[value.id,value.bytes]));
      const expected = [...new Set([...left.keys(),...right.keys()])].filter((id)=> {
        return !((!left.has(id) && right.get(id) === original.get(id))
          || (!right.has(id) && left.get(id) === original.get(id)));
      });
      expect(entries(merge(base,current,incoming).content).map((value)=>value.id).sort()).toEqual(expected.sort());
    }),{numRuns:300});
  });

  it("returns the other side's entries when merging against an unchanged side", () => {
    fc.assert(fc.property(scenario,({base,current})=> {
      const expected = entries(current).map(({id,section,bytes})=>({id,section,bytes}));
      expect(entries(merge(base,base,current).content).map(({id,section,bytes})=>({id,section,bytes}))).toEqual(expected);
      expect(entries(merge(base,current,base).content).map(({id,section,bytes})=>({id,section,bytes}))).toEqual(expected);
    }),{numRuns:300});
  });
});

it("retains surrounding comments once when a removal races a surviving entry edit", () => {
  const base = doc(entry("11111111")+'<!-- retained -->\n\n'+entry("22222222"));
  const removed = base.replace(entry("11111111"),"");
  const edited = base.replace("11111111\n\n<!--", "edited\n\n<!--");
  const result = merge(base,removed,edited);
  expect(entries(result.content).map((value)=>value.id)).toEqual(["11111111","22222222"]);
  expect(result.content.match(/<!-- retained -->/g)).toHaveLength(1);
  expect(result.conflicts).toEqual([]);
});

it("keeps one-sided section moves beside independent prose edits whichever side moved", () => {
  const base = doc(entry("11111111")+entry("22222222"));
  const moved = doc(entry("22222222"),entry("11111111"));
  const prose = base.replace("Footer","edited footer");
  for (const [current,incoming] of [[moved,prose],[prose,moved]]) {
    const result = merge(base,current!,incoming!);
    expect(entries(result.content).find((value)=>value.id === "11111111")!.section).toBe("Two");
    expect(result.content).toContain("edited footer");
    expect(result.conflicts).toEqual([]);
  }
});

it("anchors insertions at the nearest surviving predecessor and reconciles retained reorderings", () => {
  const a = entry("11111111"),b = entry("22222222"),c = entry("33333333"),x = entry("aaaaaaaa");
  const base = doc(a+b+c);
  expect(entries(merge(base,doc(a+b+x+c),doc(a+c)).content).map((value)=>value.id)).toEqual(["11111111","aaaaaaaa","33333333"]);
  expect(entries(merge(base,doc(c+a+b),base).content).map((value)=>value.id)).toEqual(["33333333","11111111","22222222"]);
  expect(entries(merge(base,doc(c+a+b),doc(b+a+c)).content).map((value)=>value.id)).toEqual(["11111111","22222222","33333333"]);
});

it("merges field-header entries by stable IDs without retitle loss", () => {
  const field: EntryListConfig = {shape:"field-header",sections:["Memories"]};
  const value = (title:string,id:string,text:string)=>`**${title}:**\n_Remove when:_ condition\n_Id:_ \`${id}\`\n\n${text}\n\n`;
  const base = `## Memories\n\n${value("Old","11111111","body")}`;
  const current = `## Memories\n\n${value("Retitled","11111111","edited")}`;
  const incoming = base+value("New","22222222","another");
  const result = mergeEntryText({base,current,incoming,record,currentLabel,incomingLabel},field);
  expect(result.content).toContain("**Retitled:**");
  expect(result.content).toContain("**New:**");
  expect(result.content).not.toContain("**Old:**");
  expect(result.conflicts).toEqual([]);
});

it("refuses absent or duplicate identities before it can alias entries", () => {
  const missing = doc('### **Missing**\n\nbody\n\n');
  const duplicate = doc(entry("11111111")+entry("11111111","different"));
  expect(()=>merge(missing,missing,missing)).toThrow("distinct managed IDs");
  expect(()=>merge(duplicate,duplicate,duplicate)).toThrow("distinct managed IDs");
});
