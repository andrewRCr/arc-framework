/** Git object wire fixtures for public ref-store reads, without child processes. */

import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { createRefStore } from "../../../src/lib/store/create.js";
import { RecordReferenceSchema, StateVersionSchema } from "../../../src/lib/store/identity.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";

export const metadataUid = "12345678-1234-4234-8234-123456789abc";
export const metadataRef = `refs/arc/work/${metadataUid}`;
export const metadataPath = `metadata-${metadataUid}.json`;
export const metadataValue = { formatVersion: 1, slug: "alpha", formats: {},
  primary: { role: "work-item/meta", placement: { kind: "active" } } };

type ObjectType = "blob" | "tree" | "commit";
interface GitObject { oid: string; type: ObjectType; bytes: Buffer }
interface Entry { name: string; mode: string; oid: string }
let fixtureSequence = 0;

/** A single live owner with real Git object identities and a retained manifest. */
export function refObjectReadFixture(options: {
  metadata?: string | Uint8Array | null;
  type?: ObjectType;
  metadataName?: string;
  missingMetadata?: boolean;
  missingTree?: boolean;
  missingRecord?: boolean;
  record?: boolean;
  transientMetadataAbsence?: boolean;
  archive?: { root: string; quarter: string };
} = {}) {
  const checkoutRoot = resolve("ref-object-fixtures", String(++fixtureSequence));
  const gitDir = join(checkoutRoot, ".git");
  const objects = new Map<string, GitObject>();
  function object(type: ObjectType, content: string | Uint8Array): GitObject {
    const bytes = Buffer.from(content);
    const oid = createHash("sha1").update(`${type} ${bytes.length}\0`).update(bytes).digest("hex");
    const value = { oid, type, bytes };
    objects.set(oid, value);
    return value;
  }
  function tree(entries: Entry[]): GitObject {
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.mode === "40000" ? "/" : "")),
      Buffer.from(b.name + (b.mode === "40000" ? "/" : ""))));
    return object("tree", Buffer.concat(entries.flatMap(entry => [Buffer.from(`${entry.mode} ${entry.name}\0`), Buffer.from(entry.oid, "hex")])));
  }
  const empty = tree([]);
  const commit = (root: string) => object("commit", `tree ${root}\nauthor Fixture <fixture@example.test> 0 +0000\ncommitter Fixture <fixture@example.test> 0 +0000\n\nFixture\n`);
  const type = options.type ?? "blob";
  const metadata = type === "tree" ? empty : type === "commit" ? commit(empty.oid)
    : object("blob", options.metadata ?? JSON.stringify(metadataValue));
  const record = object("blob", "kept");
  const entries: Entry[] = [
    ...options.metadata === null ? [] : [{ name: options.metadataName ?? metadataPath,
      mode: type === "tree" ? "40000" : type === "commit" ? "160000" : "100644", oid: metadata.oid }],
    ...options.record === false ? [] : [{ name: "extra-alpha.md", mode: "100644", oid: record.oid }],
  ];
  const content = tree(entries);
  const directory = options.archive ? { name: options.archive.root.replace(/\/$/u, ""), mode: "40000", oid: content.oid } : undefined;
  const root = directory ? tree([directory]) : content, tip = commit(root.oid);
  const namespace = options.archive ? `refs/arc/archive/${options.archive.quarter}` : metadataRef;
  const branch = tree([{ name: options.archive?.quarter ?? metadataUid, mode: "160000", oid: tip.oid }]);
  const manifest = tree([{ name: options.archive ? "archive" : "work", mode: "40000", oid: branch.oid }]);
  const paths = directory ? [directory, ...entries.map(entry => ({ ...entry, name: `${options.archive?.root}${entry.name}` }))] : entries;
  if (options.missingMetadata) objects.delete(metadata.oid);
  if (options.missingTree) objects.delete(root.oid);
  if (options.missingRecord) objects.delete(record.oid);

  const calls: string[][] = [];
  let transientMetadataAbsence = options.transientMetadataAbsence;
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected fixture I/O"); };
  const missing = (path: string) => Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
  const ports: RefStorePorts = {
    checkoutRoot, exec: unexpected, execInput: unexpected,
    rawExec: async (args, controls) => {
      calls.push(args);
      let stdout: Buffer;
      if (args[0] === "for-each-ref") stdout = Buffer.from(`${tip.oid} ${namespace}\n${manifest.oid} refs/arc/tmp/version\n`);
      else if (args[0] === "cat-file" && args[1] === "--batch") {
        const queries = Buffer.from(controls?.input ?? "").toString().trimEnd().split("\n");
        stdout = Buffer.concat(queries.map(query => {
          if (transientMetadataAbsence && query === `${metadataRef}:${metadataPath}`) {
            transientMetadataAbsence = false;
            return Buffer.from(`${query} missing\n`);
          }
          let oid = query === namespace ? tip.oid : query;
          if (query === `${tip.oid}^{tree}`) oid = root.oid;
          const prefix = [namespace, tip.oid].find(revision => query.startsWith(`${revision}:`));
          if (prefix) oid = objects.has(root.oid) ? paths.find(entry => entry.name === query.slice(prefix.length + 1))?.oid ?? "" : "";
          const value = objects.get(oid);
          return value ? Buffer.concat([Buffer.from(`${value.oid} ${value.type} ${value.bytes.length}\n`), value.bytes, Buffer.from("\n")])
            : Buffer.from(`${query} missing\n`);
        }));
      } else if (args[0] === "diff-tree") {
        stdout = Buffer.from(paths.length === 0 ? "" : `${empty.oid} ${root.oid}\n` + paths.map(entry =>
          `:000000 ${entry.mode.padStart(6, "0")} ${"0".repeat(40)} ${entry.oid} A\0${entry.name}\0`).join(""));
      } else throw new Error(`Unexpected Git fixture command: ${args.join(" ")}`);
      return { stdout, stderr: new Uint8Array() };
    },
    fs: { readFile: async path => {
      if (path === join(gitDir, "config")) return "";
      throw missing(path);
    }, lstat: async path => {
      if (path === gitDir) return { isDirectory: () => true } as Awaited<ReturnType<RefStorePorts["fs"]["lstat"]>>;
      throw missing(path);
    }, readBytes: unexpected, writeBytes: unexpected, readdir: unexpected, mkdir: unexpected,
    writeFile: unexpected, exclusiveCreate: unexpected, unlink: unexpected, realpath: unexpected,
    rename: unexpected, removeDirectory: unexpected },
    identity: async () => null, backingRepository: unexpected, actor: unexpected, lock: unexpected,
    clock: () => new Date(0), sleep: { wait: unexpected, bound: unexpected }, random: () => 0.5,
  };
  return { store: createRefStore(ports), calls, namespace, version: StateVersionSchema.parse(manifest.oid), reference: RecordReferenceSchema.parse({
    owner: { type: "work-item", name: "alpha", uid: metadataUid }, kind: "work-item/companion", key: "extra",
  }) };
}
