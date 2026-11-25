/** Interruptible file capture transfers every allocated resource to cleanup before observing abort. */
import { afterEach, expect, it } from "vitest";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureEnvironmentInputs } from "../../../../../src/lib/checks/environment-inputs.js";
import type { EnvironmentInputFile, EnvironmentInputWriter } from "../../../../../src/lib/checks/environment-file.js";
import { interruptibleCaptureIO } from "../../../../../src/lib/checks/runner/execution-capture-io.js";
import { nodeSourcePresentationIO } from "../../../../../src/lib/checks/runner/source-io.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it.each(["allocation", "input open", "output open", "copy"])("cleans captured resources when cancellation races %s", async point => {
  const directory = await mkdtemp(join(tmpdir(), "arc-capture-interruption-"));
  directories.push(directory);
  await writeFile(join(directory, "original"), Buffer.alloc(256 * 1024, 42));
  const controller = new AbortController();
  let capturedDirectory: string | undefined;
  let openedInput: EnvironmentInputFile | undefined;
  let openedOutput: EnvironmentInputWriter | undefined;
  const files = { ...nodeSourcePresentationIO.files,
    createDirectory: async () => {
      capturedDirectory = await nodeSourcePresentationIO.files.createDirectory();
      directories.push(capturedDirectory);
      if (point === "allocation") controller.abort();
      return capturedDirectory;
    },
    openInput: async (path: string) => {
      const input = await nodeSourcePresentationIO.files.openInput(path);
      openedInput = input;
      if (point === "input open") controller.abort();
      return { ...input, read: async (buffer: Buffer) => {
        const bytes = await input.read(buffer);
        if (point === "copy") controller.abort();
        return bytes;
      } };
    },
    openOutput: async (path: string) => {
      openedOutput = await nodeSourcePresentationIO.files.openOutput(path);
      if (point === "output open") controller.abort();
      return openedOutput;
    },
  };
  const io = interruptibleCaptureIO({ git: async () => ({ stdout: "" }), gitRaw: async () => ({ stdout: Buffer.alloc(0) }),
    source: { ...nodeSourcePresentationIO, files } }, controller.signal);
  let unexpected: Awaited<ReturnType<typeof captureEnvironmentInputs>> | undefined;
  try {
    await expect(captureEnvironmentInputs({ FILE: "file" }, directory, { environment: { FILE: "original" }, io: io.source.files })
      .then(result => { unexpected = result; return result; })).rejects.toThrow(/repair.*retry/iu);
    expect(capturedDirectory).toBeDefined();
    await expect(access(capturedDirectory!)).rejects.toMatchObject({ code: "ENOENT" });
    if (openedInput !== undefined) await expect(openedInput.stat()).rejects.toMatchObject({ code: "EBADF" });
    if (openedOutput !== undefined) await expect(openedOutput.write(Buffer.from("later"))).rejects.toMatchObject({ code: "EBADF" });
  } finally { await unexpected?.dispose(); }
});
