/** Frozen explicit bindings retain presence independently of caller and transport locations. */
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindCapturedEnvironment, captureEnvironmentInputs } from "../../../../src/lib/checks/environment-inputs.js";
import { nodeEnvironmentCaptureIO } from "../../../../src/lib/checks/environment-file.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("explicit environment capture", () => {
  it("replays literal and file bindings and deletes absent worker values without mutating ambient policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-env-bind-"));
    roots.push(root);
    await writeFile(join(root, "input"), "frozen bytes");
    const capture = await captureEnvironmentInputs({ ABSENT: "value", MODE: "value", FILE_ABSENT: "file",
      FILE_EMPTY: "file", DATA: "file" }, root, { environment: { MODE: "literal\nvalue", FILE_EMPTY: "", DATA: "input" } });
    const ambient = Object.freeze({ ABSENT: "worker", MODE: "worker", FILE_ABSENT: "/worker", FILE_EMPTY: "/worker",
      DATA: "/worker", CONTROL: "provider", GIT_SSH_COMMAND: "ssh" });
    try {
      const rebound = bindCapturedEnvironment(capture.bindings, ambient);
      expect(rebound).not.toHaveProperty("ABSENT");
      expect(rebound).not.toHaveProperty("FILE_ABSENT");
      expect(rebound).toMatchObject({ MODE: "literal\nvalue", FILE_EMPTY: "", CONTROL: "provider", GIT_SSH_COMMAND: "ssh" });
      expect(await readFile(rebound.DATA ?? "", "utf8")).toBe("frozen bytes");
      expect(ambient).toMatchObject({ ABSENT: "worker", MODE: "worker", DATA: "/worker" });
    } finally { await capture.dispose(); }
  });

  it.each(["linux", "win32"] as const)("applies %s environment-name semantics without leaking ambient case aliases", async platform => {
    const capture = await captureEnvironmentInputs({ MODE: "value", ABSENT: "file" }, "/unused", { environment: { MODE: "fixed" } });
    try {
      expect(bindCapturedEnvironment(capture.bindings, { mode: "ambient", AbSeNt: "worker", CONTROL: "kept" }, platform))
        .toEqual(platform === "win32" ? { MODE: "fixed", CONTROL: "kept" }
          : { MODE: "fixed", mode: "ambient", AbSeNt: "worker", CONTROL: "kept" });
    } finally { await capture.dispose(); }
  });

  it("retains frozen literals and file bytes after original edits and ignores original/copy locations in identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-env-identity-"));
    roots.push(root);
    await writeFile(join(root, "first"), "same bytes");
    await writeFile(join(root, "second"), "same bytes");
    const environment = { DATA: "first", MODE: "original" };
    const captures: Awaited<ReturnType<typeof captureEnvironmentInputs>>[] = [];
    try {
      const first = await captureEnvironmentInputs({ DATA: "file", MODE: "value" }, root, { environment });
      captures.push(first);
      await writeFile(join(root, "first"), "other data");
      environment.MODE = "later";
      const bound = bindCapturedEnvironment(first.bindings, {});
      expect(bound.MODE).toBe("original");
      expect(await readFile(bound.DATA ?? "", "utf8")).toBe("same bytes");
      const relocated = await captureEnvironmentInputs({ MODE: "value", DATA: "file" }, root,
        { environment: { MODE: "original", DATA: "second" } });
      captures.push(relocated);
      expect(relocated.identity).toBe(first.identity);
      const changed = await captureEnvironmentInputs({ DATA: "file", MODE: "value" }, root,
        { environment: { DATA: "first", MODE: "original" } });
      captures.push(changed);
      expect(changed.identity).not.toBe(first.identity);
    } finally { await Promise.all(captures.map(capture => capture.dispose())); }
  });

  it("keys explicit scalar absence, emptiness and literal changes independently", async () => {
    const captures: Awaited<ReturnType<typeof captureEnvironmentInputs>>[] = [];
    try {
      for (const value of [undefined, "", "one", "two"]) {
        captures.push(await captureEnvironmentInputs({ MODE: "value" }, "/unused", { environment: { MODE: value } }));
      }
      expect(new Set(captures.map(capture => capture.identity)).size).toBe(4);
    } finally { await Promise.all(captures.map(capture => capture.dispose())); }
  });

  it("keys file absence, empty paths, zero-byte files and nonempty files as distinct inputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-env-file-presence-"));
    roots.push(root);
    await writeFile(join(root, "zero"), "");
    await writeFile(join(root, "data"), "bytes");
    const captures: Awaited<ReturnType<typeof captureEnvironmentInputs>>[] = [];
    try {
      for (const value of [undefined, "", "zero", "data"]) {
        captures.push(await captureEnvironmentInputs({ INPUT: "file" }, root, { environment: { INPUT: value } }));
      }
      expect(new Set(captures.map(capture => capture.identity)).size).toBe(4);
    } finally { await Promise.all(captures.map(capture => capture.dispose())); }
  });

  it("removes partial captures while preserving original inputs after a later binding fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-env-partial-"));
    roots.push(root);
    await writeFile(join(root, "original"), "original data");
    const owned = join(root, "owned");
    const io = { ...nodeEnvironmentCaptureIO, createDirectory: async () => { await mkdir(owned); return owned; } };
    await expect(captureEnvironmentInputs({ FIRST: "file", SECOND: "file" }, root,
      { environment: { FIRST: "original", SECOND: "missing" }, io })).rejects.toThrow(/binding SECOND.*retry/u);
    await expect(readFile(join(owned, "0.input"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(root, "original"), "utf8")).toBe("original data");
  });

  it("disposes owned copies once and makes repeated settled disposal succeed", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-env-dispose-"));
    roots.push(root);
    await writeFile(join(root, "original"), "keep me");
    const owned = join(root, "owned");
    const io = { ...nodeEnvironmentCaptureIO, createDirectory: async () => { await mkdir(owned); return owned; },
      removeDirectory: (path: string) => rm(path, { recursive: true }) };
    const capture = await captureEnvironmentInputs({ INPUT: "file" }, root, { environment: { INPUT: "original" }, io });
    await capture.dispose();
    await expect(readFile(join(owned, "0.input"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(capture.dispose()).resolves.toBeUndefined();
    expect(await readFile(join(root, "original"), "utf8")).toBe("keep me");
  });

  it("redacts disposal failures and supports cleanup retry after access is repaired", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-env-dispose-retry-"));
    roots.push(root);
    await writeFile(join(root, "original"), "keep me");
    const owned = join(root, "private-owned-storage");
    let unavailable = true;
    const io = { ...nodeEnvironmentCaptureIO, createDirectory: async () => { await mkdir(owned); return owned; },
      removeDirectory: async (path: string) => {
        if (unavailable) throw Object.assign(new Error(`EACCES: ${path}`), { code: "EACCES" });
        await rm(path, { recursive: true });
      } };
    const capture = await captureEnvironmentInputs({ INPUT: "file" }, root, { environment: { INPUT: "original" }, io });
    const failed = capture.dispose();
    await expect(failed).rejects.toThrow(/frozen environment inputs.*retry cleanup/u);
    await expect(failed).rejects.not.toThrow(owned);
    unavailable = false;
    await expect(capture.dispose()).resolves.toBeUndefined();
    await expect(capture.dispose()).resolves.toBeUndefined();
    expect(await readFile(join(root, "original"), "utf8")).toBe("keep me");
  });

  it("preserves valid own environment names and does not capture inherited object properties", async () => {
    const declarations = { ["__proto__"]: "value" as const, constructor: "value" as const };
    const capture = await captureEnvironmentInputs(declarations, "/unused", { environment: { ["__proto__"]: "literal" } });
    try {
      expect(capture.bindings.constructor).toEqual({ kind: "value", state: "unset" });
      expect(Reflect.get(capture.bindings, "__proto__")).toEqual({ kind: "value", state: "set", value: "literal" });
      const bound = bindCapturedEnvironment(capture.bindings, { constructor: "ambient" });
      expect(Object.hasOwn(bound, "__proto__")).toBe(true);
      expect(Reflect.get(bound, "__proto__")).toBe("literal");
      expect(Object.hasOwn(bound, "constructor")).toBe(false);
      expect(Object.getPrototypeOf(bound)).toBe(Object.prototype);
    } finally { await capture.dispose(); }
  });

  it("distinguishes unset values, empty scalars and empty file-path strings without touching files", async () => {
    const environment = Object.freeze({ EMPTY: "", FILE_EMPTY: "", LITERAL: "a b\n\"quoted\"" });
    const capture = await captureEnvironmentInputs({ UNSET: "value", EMPTY: "value", LITERAL: "value",
      FILE_UNSET: "file", FILE_EMPTY: "file" }, "/unused", { environment });
    try {
      expect(capture.bindings).toEqual({ UNSET: { kind: "value", state: "unset" },
        EMPTY: { kind: "value", state: "set", value: "" }, LITERAL: { kind: "value", state: "set", value: "a b\n\"quoted\"" },
        FILE_UNSET: { kind: "file", state: "unset" }, FILE_EMPTY: { kind: "file", state: "empty" } });
      expect(environment).toEqual({ EMPTY: "", FILE_EMPTY: "", LITERAL: "a b\n\"quoted\"" });
      expect(capture.identity).toMatch(/^sha256:[a-f0-9]{64}$/u);
    } finally { await capture.dispose(); }
  });

  it("freezes zero-byte and streamed regular files relative to cwd, following explicit external symlink targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-env-files-"));
    roots.push(root);
    const cwd = join(root, "cwd");
    await mkdir(cwd);
    const bytes = Buffer.alloc(180_000, 0x61);
    await writeFile(join(root, "empty"), "");
    await writeFile(join(root, "payload"), bytes);
    await symlink("../payload", join(cwd, "linked"));
    const capture = await captureEnvironmentInputs({ ZERO: "file", DATA: "file" }, cwd,
      { environment: { ZERO: "../empty", DATA: "linked" } });
    try {
      const zero = capture.bindings.ZERO;
      const data = capture.bindings.DATA;
      expect(zero).toMatchObject({ kind: "file", state: "file", bytes: 0,
        digest: `sha256:${createHash("sha256").update("").digest("hex")}` });
      expect(data).toMatchObject({ kind: "file", state: "file", bytes: bytes.length,
        digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` });
      if (zero?.state !== "file" || data?.state !== "file") throw new Error("Expected captured files");
      expect(await readFile(zero.path)).toEqual(Buffer.alloc(0));
      expect(await readFile(data.path)).toEqual(bytes);
      expect(data.path).not.toBe(join(root, "payload"));
    } finally { await capture.dispose(); }
  });

  it("refuses nonregular inputs with a repaired retry and no original path in the diagnostic", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-env-refusal-"));
    roots.push(root);
    const options = { environment: { INPUT: root } };
    await expect(captureEnvironmentInputs({ INPUT: "file" }, root, options)).rejects.toThrow(/INPUT:.*regular file.*retry/u);
    await writeFile(join(root, "repaired"), "usable");
    const repaired = await captureEnvironmentInputs({ INPUT: "file" }, root, { environment: { INPUT: "repaired" } });
    try { expect(repaired.bindings.INPUT).toMatchObject({ state: "file", bytes: 6 }); }
    finally { await repaired.dispose(); }
  });

  it("redacts unreadable file paths and names the binding to repair", async () => {
    const original = "/private/secret-file";
    const result = captureEnvironmentInputs({ INPUT: "file" }, "/unused", { environment: { INPUT: original },
      io: { ...nodeEnvironmentCaptureIO, openInput: async () => { throw Object.assign(new Error(`EACCES: ${original}`), { code: "EACCES" }); } } });
    await expect(result).rejects.toThrow(/environment_inputs binding INPUT:.*retry/u);
    await expect(result).rejects.not.toThrow(original);
  });

  it("rejects detected file changes while copying and succeeds with a repaired stable input", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-env-changing-"));
    roots.push(root);
    const path = join(root, "input");
    await writeFile(path, Buffer.alloc(180_000, 0x61));
    let changed = false;
    const io = { ...nodeEnvironmentCaptureIO, createDirectory: () => mkdtemp(join(root, "capture-")), openInput: async (source: string) => {
      const file = await nodeEnvironmentCaptureIO.openInput(source);
      return { ...file, read: async (buffer: Buffer) => {
        const count = await file.read(buffer);
        if (!changed) { changed = true; await writeFile(path, "changed"); }
        return count;
      } };
    } };
    await expect(captureEnvironmentInputs({ INPUT: "file" }, root, { environment: { INPUT: path }, io }))
      .rejects.toThrow(/INPUT: input changed during capture.*retry/u);
    const repaired = await captureEnvironmentInputs({ INPUT: "file" }, root, { environment: { INPUT: path } });
    try { expect(repaired.bindings.INPUT).toMatchObject({ state: "file", bytes: 7 }); }
    finally { await repaired.dispose(); }
  });

  it("refuses growth beyond the opened size without following a continuously appending producer", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-env-growing-"));
    roots.push(root);
    const path = join(root, "input");
    await writeFile(path, "initial");
    let reads = 0;
    const io = { ...nodeEnvironmentCaptureIO, createDirectory: () => mkdtemp(join(root, "capture-")),
      openInput: async (source: string) => {
        const file = await nodeEnvironmentCaptureIO.openInput(source);
        return { ...file, read: async (buffer: Buffer) => {
          if (++reads > 3) throw new Error("producer continued appending instead of settling");
          await appendFile(path, Buffer.alloc(64 * 1024, 0x62));
          return file.read(buffer);
        } };
      } };
    await expect(captureEnvironmentInputs({ INPUT: "file" }, root, { environment: { INPUT: path }, io }))
      .rejects.toThrow(/INPUT: input changed during capture.*retry/u);
  });
});
