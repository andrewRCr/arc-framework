/** The machine reader owns only the flat runner setting. */
import { dirname, join, resolve } from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { readMachineCheckRunner } from "../../../../../src/lib/checks/runner/machine-config.js";

const home = () => resolve("machine-home");
const file = join(home(), ".arc", "config.yml");

it.each(["", "# machine settings\n", "---\n", "identity: owner\n", "checks:\n  runner: ignored\n"])(
  "leaves a missing flat key unconfigured in %j", async text => {
    expect(await readMachineCheckRunner({ runner: true }, { home, readFile: async () => text })).toBeUndefined();
  },
);

it("leaves an absent machine file unconfigured", async () => {
  expect(await readMachineCheckRunner({ runner: true }, { home, readFile: async () => {
    throw Object.assign(new Error("missing file"), { code: "ENOENT" });
  } })).toBeUndefined();
});

it("reads only literal argv while leaving unrelated machine settings unowned", async () => {
  const argv = ["runner", "", "$HOME", "~", "$(command)", "a b", "a\nb", " "];
  const text = JSON.stringify({ "checks.runner": argv, identity: { arbitrary: null }, checks: { runner: "ignored" } });
  expect(await readMachineCheckRunner({ runner: true }, { home, readFile: async () => text })).toEqual({ file, argv });
});

it("reads the machine file beneath the supplied operating-system home", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-machine-runner-"));
  try {
    await mkdir(join(root, ".arc"));
    const machineFile = join(root, ".arc", "config.yml");
    await writeFile(machineFile, 'checks.runner: ["runner", "--profile", "development"]\n');
    expect(await readMachineCheckRunner({ runner: true }, { home: () => root })).toEqual({
      file: machineFile, argv: ["runner", "--profile", "development"],
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each([
  { label: "null runner", text: "checks.runner: null\n" },
  { label: "scalar runner", text: "checks.runner: private-unrelated-setting\n" },
  { label: "empty argv", text: "checks.runner: []\n" },
  { label: "empty executable", text: JSON.stringify({ "checks.runner": ["", "argument"] }) },
  { label: "nonstrings", text: JSON.stringify({ "checks.runner": ["runner", null] }) },
  { label: "NUL executable", text: JSON.stringify({ "checks.runner": ["private\u0000runner"] }) },
  { label: "NUL argument", text: JSON.stringify({ "checks.runner": ["runner", "private\u0000argument"] }) },
  { label: "null document", text: "null\n" },
  { label: "scalar document", text: "private-unrelated-setting\n" },
  { label: "sequence document", text: "- private-unrelated-setting\n" },
  { label: "timestamp document", text: "2026-01-01\n" },
  { label: "binary document", text: '!!binary "cHJpdmF0ZQ=="\n' },
  { label: "malformed YAML", text: "identity: [private-unrelated-setting\n" },
])("refuses $label with a redacted machine-file repair route", async ({ text }) => {
  const result = readMachineCheckRunner({ runner: true }, { home, readFile: async () => text });
  await expect(result).rejects.toThrow(/checks\.runner.*remove.*repair.*retry/iu);
  try { await result; } catch (error) {
    expect(String(error)).toContain(file);
    expect(String(error)).not.toContain("private");
  }
});

it("refuses an unreadable machine file instead of treating it as unconfigured", async () => {
  const result = readMachineCheckRunner({ runner: true }, { home, readFile: async () => {
    throw Object.assign(new Error("private filesystem detail"), { code: "EACCES" });
  } });
  await expect(result).rejects.toThrow(/checks\.runner.*remove.*repair.*retry/iu);
  try { await result; } catch (error) {
    expect(String(error)).toContain(file);
    expect(String(error)).not.toContain("private");
  }
});

it.each(["./team runner", "../runner", "bin/runner", "~/runner", "$HOME/runner"])(
  "resolves directory-bearing executable %j from the machine file without expansion", async executable => {
    const argv = [executable, "--profile", ""];
    const configured = await readMachineCheckRunner({ runner: true }, { home,
      readFile: async () => JSON.stringify({ "checks.runner": argv }) });
    expect(configured).toEqual({ file, argv: [resolve(dirname(file), executable), "--profile", ""] });
  },
);

it("preserves an absolute executable and its literal arguments", async () => {
  const argv = [process.execPath, "--profile", ""];
  expect(await readMachineCheckRunner({ runner: true }, { home,
    readFile: async () => JSON.stringify({ "checks.runner": argv }) })).toEqual({ file, argv });
});

it("does not consult OS home or the machine file for an ordinary native check", async () => {
  expect(await readMachineCheckRunner({ runner: false }, { home: () => { throw new Error("home must not be read"); },
    readFile: async () => { throw new Error("file must not be read"); } })).toBeUndefined();
});

it("supports repair and removal of the runner key in the same machine file", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-machine-runner-repair-"));
  try {
    await mkdir(join(root, ".arc"));
    const machineFile = join(root, ".arc", "config.yml");
    const io = { home: () => root };
    await writeFile(machineFile, "checks.runner: null\nidentity: untouched\n");
    await expect(readMachineCheckRunner({ runner: true }, io)).rejects.toThrow(/remove.*repair.*retry/iu);
    await writeFile(machineFile, 'checks.runner: ["./adapter", ""]\nidentity: untouched\n');
    expect(await readMachineCheckRunner({ runner: true }, io)).toEqual({
      file: machineFile, argv: [join(root, ".arc", "adapter"), ""],
    });
    await writeFile(machineFile, "identity: untouched\n");
    expect(await readMachineCheckRunner({ runner: true }, io)).toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});
