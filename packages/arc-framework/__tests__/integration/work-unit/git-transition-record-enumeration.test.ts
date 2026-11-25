import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { RawGitExec } from "../../../src/lib/git/exec.js";
import { createExecaGitExec } from "../../../src/lib/git/process-executor.js";
import { createRawGitExec } from "../../../src/lib/io-context.js";
import {
  enumerateGitTransitionRecords,
  queryGitTransitionDisposition,
} from "../../../src/lib/work-unit/git-transition-record-enumeration.js";
import { LineageRecordSchema, writeLineageRecord, type LineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import { TRANSITION_RECORD_NAMESPACE } from "../../../src/lib/work-unit/transition-record-store.js";

const encoder = new TextEncoder();
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function treeLine(oid: string, filename: string): Uint8Array {
  return encoder.encode(`100644 blob ${oid}\t${TRANSITION_RECORD_NAMESPACE}/${filename}\0`);
}

function selectedRefExec(): RawGitExec {
  const selectedOid = "a".repeat(40);
  const otherOid = "b".repeat(40);
  const selected = writeLineageRecord(LineageRecordSchema.parse({
    schemaVersion: 2,
    origin: { name: "selected" },
    kind: "abandon",
    successors: [],
    incoming: [],
  }));
  const other = writeLineageRecord(LineageRecordSchema.parse({
    schemaVersion: 2,
    origin: { name: "other" },
    kind: "abandon",
    successors: [],
    incoming: [],
  }));
  return async (args) => {
    if (args[0] === "ls-tree") {
      return {
        stdout: args.includes("refs/heads/selected")
          ? treeLine(selectedOid, "selected.json")
          : treeLine(otherOid, "other.json"),
      };
    }
    if (args[0] === "cat-file" && args[2] === selectedOid) {
      return { stdout: encoder.encode(selected) };
    }
    if (args[0] === "cat-file" && args[2] === otherOid) {
      return { stdout: encoder.encode(other) };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
}

function singleRecordExec(candidate: LineageRecord): RawGitExec {
  const oid = "e".repeat(40);
  return async (args) => {
    if (args[0] === "ls-tree") return { stdout: treeLine(oid, `${candidate.origin.name}.json`) };
    if (args[0] === "cat-file" && args[2] === oid) {
      return { stdout: encoder.encode(writeLineageRecord(candidate)) };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
}

describe("Git transition record enumeration", () => {
  it("resolves records only from the requested ref", async () => {
    await expect(enumerateGitTransitionRecords(
      selectedRefExec(),
      "refs/heads/selected",
    )).resolves.toEqual({
      status: "valid",
      groups: [{
        origin: "selected",
        records: [{
          schemaVersion: 2,
          origin: { name: "selected" },
          kind: "abandon",
          successors: [],
          incoming: [],
        }],
      }],
    });
  });

  it("ignores unreachable malformed bytes but poisons the selected tree", async () => {
    const validOid = "c".repeat(40);
    const malformedOid = "d".repeat(40);
    const valid = writeLineageRecord(LineageRecordSchema.parse({
      schemaVersion: 2,
      origin: { name: "reachable" },
      kind: "abandon",
      successors: [],
      incoming: [],
    }));
    const exec: RawGitExec = async (args) => {
      if (args[0] === "ls-tree") {
        return {
          stdout: args.includes("refs/heads/selected")
            ? treeLine(validOid, "reachable.json")
            : treeLine(malformedOid, "malformed.json"),
        };
      }
      if (args[0] === "cat-file" && args[2] === validOid) {
        return { stdout: encoder.encode(valid) };
      }
      if (args[0] === "cat-file" && args[2] === malformedOid) {
        return { stdout: Uint8Array.from([0xc3, 0x28]) };
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };

    await expect(enumerateGitTransitionRecords(exec, "refs/heads/selected"))
      .resolves.toMatchObject({ status: "valid" });
    await expect(enumerateGitTransitionRecords(exec, "refs/heads/selected-malformed"))
      .resolves.toEqual({ status: "namespace-corrupt", filename: "malformed.json" });
  });

  it("preserves invalid record bytes through the production Git process boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-transition-bytes-"));
    roots.push(root);
    const exec = createExecaGitExec();
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.name", "ARC Test"], { cwd: root });
    await exec("git", ["config", "user.email", "arc@example.test"], { cwd: root });
    const recordDir = join(root, TRANSITION_RECORD_NAMESPACE);
    await mkdir(recordDir, { recursive: true });
    const prefix = encoder.encode(
      '{"schemaVersion":2,"origin":{"name":"bad"},"kind":"decompose","successors":[{"name":"successor"}],"outgoing":[],"incoming":['
      + '{"dependent":{"name":"consumer"},"disposition":{"kind":"drop","reason":"',
    );
    const suffix = encoder.encode('"}}]}\n');
    await writeFile(join(recordDir, "bad.json"), Uint8Array.from([...prefix, 0xc3, 0x28, ...suffix]));
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "invalid bytes"], { cwd: root });

    await expect(enumerateGitTransitionRecords(createRawGitExec(root), "HEAD"))
      .resolves.toEqual({ status: "namespace-corrupt", filename: "bad.json" });
  });

  it("returns the selected ref's transition answer across divergent histories", async () => {
    await expect(queryGitTransitionDisposition(
      selectedRefExec(),
      "refs/heads/selected",
      { origin: "selected", dependentSlug: "consumer" },
    )).resolves.toEqual({
      status: "unique",
      disposition: { kind: "abandoned" },
    });
  });

  it("consults authored dependent edges rather than successor membership", async () => {
    const exec = singleRecordExec(LineageRecordSchema.parse({
      schemaVersion: 2,
      origin: { name: "origin" },
      kind: "decompose",
      successors: [{ name: "consumer" }],
      incoming: [{ dependent: { name: "authored" }, disposition: { kind: "drop", reason: "retired" } }],
      outgoing: [],
    }));

    await expect(queryGitTransitionDisposition(
      exec,
      "refs/heads/selected",
      { origin: "origin", dependentSlug: "consumer" },
    )).resolves.toEqual({ status: "unmapped-dependent" });
    await expect(queryGitTransitionDisposition(
      exec,
      "refs/heads/selected",
      { origin: "origin", dependentSlug: "authored" },
    )).resolves.toEqual({
      status: "unique",
      disposition: { kind: "drop", reason: "retired" },
    });
  });
});
