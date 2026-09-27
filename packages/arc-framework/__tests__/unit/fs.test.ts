/**
 * Unit tests for shared filesystem utilities.
 *
 * @module
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, mkdir, chmod, readdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

import {
  atomicWriteJson,
  createAtomicFileCreator,
  retryTransientFileSystemRefusal,
  toForwardSlash,
  type AtomicCreateFileContext,
} from "../../src/lib/fs.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeAtomicCreateContext(files: Map<string, string>, writeGate: ReturnType<typeof deferred>): {
  context: AtomicCreateFileContext;
  writeStarted: Promise<void>;
} {
  const writeStarted = deferred();
  return {
    writeStarted: writeStarted.promise,
    context: {
      mkdir: async () => undefined,
      writeFile: async (path, content) => {
        if (files.has(path)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
        files.set(path, content.slice(0, 1));
        writeStarted.resolve();
        await writeGate.promise;
        files.set(path, content);
      },
      link: async (source, target) => {
        if (files.has(target)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
        const content = files.get(source);
        if (content === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
        files.set(target, content);
      },
      unlink: async (path) => { files.delete(path); },
      randomId: () => "generation",
    },
  };
}

describe("atomicCreateFile", () => {
  it("keeps the target absent until the complete payload is publishable", async () => {
    const files = new Map<string, string>();
    const writeGate = deferred();
    const fixture = fakeAtomicCreateContext(files, writeGate);
    const create = createAtomicFileCreator(fixture.context);
    const publication = create("/repo/meta.md", "complete");

    await fixture.writeStarted;
    expect(files.get("/repo/meta.md")).toBeUndefined();
    writeGate.resolve();
    await publication;

    expect(files).toEqual(new Map([["/repo/meta.md", "complete"]]));
  });

  it("does not replace an existing target when publication loses the create race", async () => {
    const files = new Map([["/repo/meta.md", "winner"]]);
    const writeGate = deferred();
    writeGate.resolve();
    const fixture = fakeAtomicCreateContext(files, writeGate);
    const create = createAtomicFileCreator(fixture.context);

    await expect(create("/repo/meta.md", "loser")).rejects.toMatchObject({ code: "EEXIST" });
    expect(files).toEqual(new Map([["/repo/meta.md", "winner"]]));
  });
});

describe("atomicWriteJson", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "arc-fs-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes JSON to a new file atomically", async () => {
    const target = join(tempDir, "manifest.json");
    const data = { framework_version: "1.0.0", files: {} };

    await atomicWriteJson(target, data);

    const content = await readFile(target, "utf-8");
    expect(JSON.parse(content)).toEqual(data);
    // Pretty-printed with trailing newline
    expect(content).toBe(JSON.stringify(data, null, 2) + "\n");
  });

  it("atomically replaces an existing file", async () => {
    const target = join(tempDir, "manifest.json");
    const original = { version: "1.0.0" };
    const updated = { version: "2.0.0" };

    await writeFile(target, JSON.stringify(original, null, 2) + "\n", "utf-8");
    await atomicWriteJson(target, updated);

    const content = await readFile(target, "utf-8");
    expect(JSON.parse(content)).toEqual(updated);
  });

  it("uses a temp file in the same directory as the target", async () => {
    const target = join(tempDir, "pristine.json");
    const data = { content: "test" };

    // After successful write, temp file should be cleaned up
    await atomicWriteJson(target, data);

    // Verify no .tmp file remains
    const files = (await import("node:fs/promises")).readdir;
    const entries = await files(tempDir);
    expect(entries).toEqual(["pristine.json"]);
  });

  it("creates parent directories when they do not exist", async () => {
    const target = join(tempDir, "nonexistent", "subdir", "manifest.json");

    await atomicWriteJson(target, { version: "2.0.0" });

    const content = await readFile(target, "utf-8");
    expect(JSON.parse(content)).toEqual({ version: "2.0.0" });
  });

  it.skipIf(process.platform === "win32")("cleans up temp file on write failure", async () => {
    // Create a target directory, then make it read-only to trigger rename failure
    const subDir = join(tempDir, "readonly");
    await mkdir(subDir);
    const target = join(subDir, "manifest.json");

    // Write original
    await writeFile(target, '{"v":1}\n', "utf-8");

    // Make directory read-only to prevent temp file creation
    await chmod(subDir, 0o444);

    try {
      await expect(atomicWriteJson(target, { v: 2 })).rejects.toThrow();

      // No temp files left behind
      await chmod(subDir, 0o755);
      const entries = (await readdir(subDir))
        .filter((f: string) => f.endsWith(".tmp"));
      expect(entries).toEqual([]);
    } finally {
      // Restore permissions for cleanup
      await chmod(subDir, 0o755);
    }
  });

  it("works when parent directories already exist", async () => {
    const subDir = join(tempDir, "system", ".internal");
    await mkdir(subDir, { recursive: true });
    const target = join(subDir, "manifest.json");

    await atomicWriteJson(target, { ok: true });

    const content = await readFile(target, "utf-8");
    expect(JSON.parse(content)).toEqual({ ok: true });
  });

  it.skipIf(process.platform !== "win32")("retries Windows rename-over after a reader releases the target", async () => {
    const target = join(tempDir, "held.json");
    await writeFile(target, '{"version":1}\n');
    const probe = join(tempDir, "probe.tmp");
    await writeFile(probe, "probe");
    const escapedTarget = target.replace(/'/g, "''");
    const script = `
$held = [System.IO.FileStream]::new('${escapedTarget}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
try {
  [Console]::Out.WriteLine('READY')
  [Console]::Out.Flush()
  [void][Console]::In.ReadLine()
} finally {
  $held.Dispose()
}
`;
    const holder = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let holderError = "";
    holder.stderr.setEncoding("utf8");
    holder.stderr.on("data", (chunk: string) => { holderError += chunk; });
    const closed = new Promise<number | null>((resolve) => { holder.once("close", resolve); });
    const ready = new Promise<void>((resolve, reject) => {
      let stdout = "";
      holder.stdout.setEncoding("utf8");
      holder.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (stdout.includes("READY")) resolve();
      });
      holder.once("error", reject);
      holder.once("close", (code) => { reject(new Error(`Windows holder exited early (${code}): ${holderError}`)); });
    });
    let publication: Promise<void> | undefined;
    let published = false;
    let publicationError: unknown;
    try {
      await ready;
      await expect(rename(probe, target)).rejects.toMatchObject({
        code: expect.stringMatching(/^(EPERM|EACCES|EBUSY)$/),
      });
      publication = atomicWriteJson(target, { version: 2 }).then(
        () => { published = true; },
        (error: unknown) => { published = true; publicationError = error; },
      );
      await delay(100);
      expect(published).toBe(false);
      expect(await readFile(target, "utf8")).toBe('{"version":1}\n');
    } finally {
      holder.stdin.end("\n");
      expect(await closed).toBe(0);
    }
    await publication;
    if (publicationError) throw publicationError;
    expect(await readFile(target, "utf8")).toBe('{\n  "version": 2\n}\n');
  }, 15_000);
});

describe("retryTransientFileSystemRefusal", () => {
  it.each(["EPERM", "EBUSY", "EACCES"])("retries a temporary %s refusal", async (code) => {
    let attempts = 0;
    const delays: number[] = [];
    const result = await retryTransientFileSystemRefusal(async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("busy"), { code });
      return "published";
    }, { sleep: async (ms) => { delays.push(ms); }, random: () => 0 });

    expect(result).toBe("published");
    expect(attempts).toBe(3);
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[1]).toBeGreaterThan(delays[0] ?? 0);
  });

  it("does not retry another filesystem error", async () => {
    const failure = Object.assign(new Error("missing"), { code: "ENOENT" });
    let attempts = 0;
    await expect(retryTransientFileSystemRefusal(async () => {
      attempts += 1;
      throw failure;
    }, { sleep: async () => { throw new Error("unexpected delay"); } })).rejects.toBe(failure);
    expect(attempts).toBe(1);
  });

  it("ends a persistent refusal after a bounded delay", async () => {
    const failure = Object.assign(new Error("blocked"), { code: "EPERM" });
    let attempts = 0;
    const delays: number[] = [];
    await expect(retryTransientFileSystemRefusal(async () => {
      attempts += 1;
      throw failure;
    }, { sleep: async (ms) => { delays.push(ms); }, random: () => 0 })).rejects.toBe(failure);
    expect(attempts).toBeGreaterThan(1);
    expect(attempts).toBeLessThanOrEqual(10);
    expect(delays.reduce((total, delay) => total + delay, 0)).toBeLessThanOrEqual(1_000);
  });
});

describe("toForwardSlash", () => {
  it("replaces backslashes with forward slashes", () => {
    expect(toForwardSlash("system\\.internal\\file.json")).toBe("system/.internal/file.json");
  });

  it("leaves forward slashes unchanged", () => {
    expect(toForwardSlash("system/.internal/file.json")).toBe("system/.internal/file.json");
  });

  it("handles mixed separators", () => {
    expect(toForwardSlash("user\\alice/SESSION-NOTES.md")).toBe("user/alice/SESSION-NOTES.md");
  });

  it("handles empty string", () => {
    expect(toForwardSlash("")).toBe("");
  });
});
