/** Editor command selection and literal argument transport through harmless recorders. */

import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { launchViewEditor, type ViewEditorSpawn } from "../../../src/handlers/view-editor.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { createExecaGitExec } from "../../../src/lib/git/process-executor.js";

function quote(commandPath: string): string {
  return `'${commandPath.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
}

describe("launchViewEditor", () => {
  let cwd: string;
  let output: string;
  let command: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-editor-"));
    output = join(cwd, "record.json");
    const recorder = join(cwd, "recorder with spaces.cjs");
    await writeFile(recorder, [
      "const fs = require('node:fs');",
      "fs.writeFileSync(process.env.ARC_EDITOR_TEST_OUTPUT, JSON.stringify(process.argv.slice(2)));",
    ].join("\n"));
    command = `${quote(process.execPath)} ${quote(recorder)} --wait "$ARC_EDITOR_TEST_TOKEN"`;
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  function environment(override?: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ARC_EDITOR: override,
      ARC_EDITOR_TEST_OUTPUT: output,
      ARC_EDITOR_TEST_TOKEN: "expanded argument",
    };
  }

  it("prefers ARC_EDITOR and preserves command arguments and literal filenames", async () => {
    const path = join(cwd, "file 'quoted' $(touch injected); & $HOME `echo bad`.md");
    const exec = vi.fn<GitExec>().mockRejectedValue(new Error("Git selection must be unused"));
    await launchViewEditor(path, cwd, { exec, env: environment(command) });
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(["--wait", "expanded argument", path]);
    expect(exec).not.toHaveBeenCalled();
  });

  it.each([undefined, ""])("delegates an %s override to Git's selected command", async (override) => {
    const path = join(cwd, "artifact.md");
    const exec: GitExec = async (_cmd, args, options) => {
      if (args.join(" ") !== "var GIT_EDITOR" || options?.cwd !== cwd) {
        throw new Error("Unexpected Git selection context");
      }
      return { stdout: command };
    };
    await launchViewEditor(path, cwd, { exec, env: environment(override) });
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(["--wait", "expanded argument", path]);
  });

  it("preserves an escaped trailing space in Git's selected command", async () => {
    const path = join(cwd, "artifact.md");
    vi.stubEnv("GIT_EDITOR", `${command} label\\ `);
    await launchViewEditor(path, cwd, { exec: createExecaGitExec(), env: environment() });
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(["--wait", "expanded argument", "label ", path]);
  });

  it.runIf(process.platform !== "win32").each(["selected", "missing"])(
    "keeps a Git helper from replacing a %s editor command", async (editor) => {
      const bin = join(cwd, "bin");
      const helperLog = join(cwd, "helper.log");
      const helper = join(bin, "git-arc-view-editor");
      const path = join(cwd, "artifact.md");
      await mkdir(bin);
      await writeFile(helper, `#!/bin/sh\nprintf shadowed > ${quote(helperLog)}\n`);
      await chmod(helper, 0o755);
      vi.stubEnv("PATH", `${bin}${delimiter}${process.env.PATH ?? ""}`);
      const exec = createExecaGitExec();
      await exec("git", ["arc-view-editor", path], { cwd });
      expect(await readFile(helperLog, "utf8")).toBe("shadowed");
      await rm(helperLog);
      const pending = launchViewEditor(path, cwd, {
        exec, env: environment(editor === "selected" ? command : "arc-editor-does-not-exist"),
      });
      if (editor === "missing") await expect(pending).rejects.toThrow(/ARC_EDITOR/);
      else {
        await pending;
        expect(JSON.parse(await readFile(output, "utf8"))).toEqual(["--wait", "expanded argument", path]);
      }
      await expect(access(helperLog)).rejects.toThrow();
    },
  );

  it("accepts Git's ordinary fallback and waits with inherited terminal streams", async () => {
    const child = new ChildProcess();
    const createProcess: ViewEditorSpawn = (_command, _args, options) => {
      expect(options.stdio).toBe("inherit");
      return child;
    };
    let finished = false;
    const pending = launchViewEditor(join(cwd, "artifact.md"), cwd, {
      exec: async () => ({ stdout: "vi" }), spawn: createProcess, env: environment(),
    }).then(() => { finished = true; });
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(finished).toBe(false);
    child.emit("close", 0, null);
    await pending;
    expect(finished).toBe(true);
  });

  it.each(["empty", "failed"])("reports %s Git selection without attempting a launch", async (failure) => {
    const exec: GitExec = async () => {
      if (failure === "failed") throw new Error("selection failed");
      return { stdout: "" };
    };
    const createProcess = vi.fn<ViewEditorSpawn>();
    await expect(launchViewEditor(join(cwd, "artifact.md"), cwd, {
      exec, spawn: createProcess, env: environment(),
    })).rejects.toThrow(/ARC_EDITOR/);
    expect(createProcess).not.toHaveBeenCalled();
  });

  it.each(["throw", "error", "exit", "signal", "unknown"])("reports a process %s with an override remedy", async (failure) => {
    const createProcess: ViewEditorSpawn = () => {
      if (failure === "throw") throw new Error("launch failed");
      const child = new ChildProcess();
      queueMicrotask(() => {
        if (failure === "error") child.emit("error", new Error("spawn failed"));
        else child.emit("close", failure === "exit" ? 7 : null, failure === "signal" ? "SIGTERM" : null);
      });
      return child;
    };
    await expect(launchViewEditor(join(cwd, "artifact.md"), cwd, {
      exec: async () => ({ stdout: "unused" }), spawn: createProcess, env: environment(command),
    })).rejects.toThrow(/ARC_EDITOR/);
  });

  it("does not fall back after an unsuccessful command and succeeds after configuration repair", async () => {
    const exec = vi.fn<GitExec>().mockRejectedValue(new Error("No fallback"));
    const path = join(cwd, "artifact.md");
    await expect(launchViewEditor(path, cwd, {
      exec, env: environment(`${quote(process.execPath)} -e 'process.exit(3)'`),
    })).rejects.toThrow(/status 3.*ARC_EDITOR/);
    await launchViewEditor(path, cwd, { exec, env: environment(command) });
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(["--wait", "expanded argument", path]);
    expect(exec).not.toHaveBeenCalled();
  });
});
