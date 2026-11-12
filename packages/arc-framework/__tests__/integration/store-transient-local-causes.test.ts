/** Local identity failures retain their original cause rather than inventing byte corruption. */
import { expect, it, onTestFinished } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { ArcError } from "../../src/lib/kernel/errors.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { TransientIdentityRecordSchema, serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { errandsRef, readRefTip } from "../../src/lib/errand/ref-tree.js";
import { setupMultiClone } from "../helpers/multi-clone.js";
import { makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
import { success } from "../helpers/store/suite-tools.js";

type Stage = "hash" | "tip" | "tree" | "blob" | "common-base" | "cleanup";
const stages: Stage[] = ["hash","tip","tree","blob","common-base","cleanup"];
function input(name:string) {
  const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({type:"work-item",name}));
  const content = serializeTransientIdentityRecord(TransientIdentityRecordSchema.parse({version:3,kind:"errand",slug:name,claimId:"a".repeat(32),purpose:"errand",origin:"description",originEntry:null,intent:name,branch:`chore/${name}`,state:"open",savedHead:null,changeRequest:null,createdAt:"2026-07-18T00:00:00.000Z",updatedAt:"2026-07-18T00:00:00.000Z"}));
  return {action:"put" as const,reference,content,expected:null,placement:{kind:"active" as const},provenance:{verb:"arc errand",lifecycleAction:"create"}};
}
function matches(stage:Stage,args:readonly string[]): boolean {
  if (stage === "tip") return args[0] === "rev-parse" && args.includes("--verify");
  if (stage === "tree") return args[0] === "ls-tree";
  if (stage === "blob") return args[0] === "cat-file";
  if (stage === "common-base") return args[0] === "merge-base";
  return stage === "cleanup" && args[0] === "update-ref" && args[1] === "-d";
}
async function originalCause(operation:Promise<unknown>,original:Error) {
  const failure:unknown = await operation.catch((error:unknown)=>error);
  expect(failure).toBeInstanceOf(ArcError);
  if (!(failure instanceof ArcError)) throw new Error("Expected an unclassified local failure");
  expect(failure.code).toBe("store.operation-failed");
  const wrapped = failure.cause;
  expect(wrapped).toBeInstanceOf(Error);
  if (!(wrapped instanceof Error)) throw new Error("Expected the producer failure wrapper");
  expect(wrapped.cause).toBe(original);
}

const cases = stages.flatMap((stage)=>(["EIO","typed-process"] as const).map((kind)=>({stage,kind})));
it.each(cases)("keeps the original $kind from $stage and leaves the identity tip unchanged", async ({stage,kind}) => {
  const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
  const exec = makeGitExec(clones.cloneA),execInput = makeGitExecInput(clones.cloneA);
  const ports = testStorePorts(clones.cloneA,exec,execInput);
  ports.identity = async()=>SlugSchema.parse("andrew");
  ports.remote = async()=>stage === "common-base" || stage === "cleanup" ? "origin" : null;
  const original = kind === "EIO" ? Object.assign(new Error(`Local ${stage} IO failed`),{code:"EIO"})
    : new GitProcessError({kind:"spawn-failure",command:"git",args:[stage],stderr:"Local process could not start"});
  const store = createStore(ports);
  const alpha = success(await store.write(input("alpha")));
  if (stage === "common-base") { ports.remote = async()=>null; success(await store.write(input("beta"))); ports.remote = async()=>"origin"; }
  const before = await readRefTip(exec,errandsRef("andrew"));
  let hashes = 0;
  ports.exec = async(command,args,options)=>{if (matches(stage,args)) throw original;return exec(command,args,options);};
  ports.execInput = async(args,content,options)=>{if (stage === "hash" && args[0] === "hash-object" && ++hashes === 2) throw original;return execInput(args,content,options);};
  const write = stage === "cleanup" ? {...input("alpha"),expected:alpha.version!} : input(stage === "common-base" ? "gamma" : "beta");
  await originalCause(store.write(write),original);
  expect(await readRefTip(exec,errandsRef("andrew"))).toBe(before);
});

const readCases = (["read","lookup","history"] as const).flatMap((operation)=>(["tip","tree","blob"] as const)
  .filter((stage)=>operation !== "history" || stage !== "blob").map((stage)=>({operation,stage})));
it.each(readCases)("preserves the original $stage $operation failure", async ({stage,operation}) => {
  const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
  const exec = makeGitExec(clones.cloneA);
  const ports = testStorePorts(clones.cloneA,exec,makeGitExecInput(clones.cloneA));
  ports.identity = async()=>SlugSchema.parse("andrew");
  const store = createStore(ports),write = input("alpha");
  success(await store.write(write));
  const original = Object.assign(new Error(`Local ${stage} read failed`),{code:"EIO"});
  ports.exec = async(command,args,options)=>{if (matches(stage,args)) throw original;return exec(command,args,options);};
  const run = operation === "read" ? store.read({reference:write.reference}) : operation === "history"
    ? store.history({reference:write.reference}) : store.lookup({kind:"slug",slug:write.reference.owner.name});
  await originalCause(run,original);
});

it("preserves a failure resolving an immutable historical identity snapshot", async () => {
  const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
  const exec = makeGitExec(clones.cloneA);
  const ports = testStorePorts(clones.cloneA,exec,makeGitExecInput(clones.cloneA));
  ports.identity = async()=>SlugSchema.parse("andrew");
  const store = createStore(ports),write = input("alpha");
  success(await store.write(write));
  const original = Object.assign(new Error("Historical identity tip unreadable"),{code:"EIO"});
  ports.exec = async(command,args,options)=>{
    if (args[0] === "rev-parse" && /^[0-9a-f]{40}\^\{commit\}$/u.test(args.at(-1) ?? "")) throw original;
    return exec(command,args,options);
  };
  await originalCause(store.history({reference:write.reference}),original);
});
