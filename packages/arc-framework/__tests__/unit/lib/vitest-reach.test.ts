/** Suites run by reach: what a change reaches, which form a run takes, and what each tier leaves to the reach check. */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../src/lib/checks/declaration.js";
import { resolveCheckForecast } from "../../../src/lib/checks/forecast.js";
import { portabilityTakesReachSuites, reachSuiteExclusions } from "../../../src/lib/local-vitest-runner.js";
import { describeReachSelection } from "../../../src/lib/reach-check.js";
import {
  globPattern, locateFromOwnPath, ReachDeclarationSchema, ReachError, resolveReachForm, selectionPathsChanged,
  selectReachSuites, type ReachDeclaration, type ReachFiles, type ReachForm,
} from "../../../src/lib/vitest-reach.js";

const repositoryRoot = resolve(import.meta.dirname, "../../../../..");
/** The separate layout's whole-run conformance files: its three item ranges, each split into parts. */
const SEPARATE_CONFORMANCE_PARTS = ["reads-1", "reads-2", "reads-3", "reads-4", "records-1", "records-2", "records-3",
  "records-4", "sync-1", "sync-2", "sync-3"];

/** A repository held in memory: every file and its text. */
function memoryFiles(files: Record<string, string>): ReachFiles {
  return {
    kind: path => path in files ? "file"
      : Object.keys(files).some(file => file.startsWith(`${path}/`)) ? "directory" : undefined,
    read: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error(`no file ${path}`);
      return text;
    },
    list: directory => Object.keys(files).filter(path => path.startsWith(directory)),
  };
}

function declaration(overrides: Partial<ReachDeclaration> = {}): ReachDeclaration {
  return ReachDeclarationSchema.parse({
    name: "probe suites", package: "pkg", check: { id: "test:probe", declaration: "checks.yml" },
    ask: "ARC_PROBE_CHECK", suites: ["pkg/tests/probe-*.test.ts"], fullOnly: ["pkg/tests/probe-whole.test.ts"],
    environment: [{ suites: ["pkg/tests/probe-gated.test.ts"], variable: "ARC_PROBE_GATE", value: "1" }],
    scripts: ["pkg/fixtures/"],
    locating: [{ module: "pkg/src/paths.ts", finds: ["pkg/content/**", "pkg/recipe.json"] }],
    widening: ["pkg/package.json", { closureOf: ["pkg/config.ts"] }],
    selection: ["run-probe.mjs", "pkg/src/reach.ts"],
    ...overrides,
  });
}

const repository: Record<string, string> = {
  "run-probe.mjs": "",
  "pkg/src/reach.ts": "",
  "pkg/package.json": "{}",
  "pkg/recipe.json": "{}",
  "pkg/content/rules.md": "# Rules\n",
  "pkg/config.ts": 'import "./config-helper.js";\n',
  "pkg/config-helper.ts": "",
  "pkg/cli.ts": 'import "./src/command.js";\n',
  "pkg/src/command.ts": "",
  "pkg/src/paths.ts": 'export const root = new URL("..", import.meta.url);\n',
  "pkg/src/store.ts": 'import "./paths.js";\n',
  "pkg/src/lock.ts": "",
  "pkg/helpers/only-one.ts": "",
  "pkg/helpers/commands.ts": 'import { resolve } from "node:path";\nexport const cli = resolve(import.meta.dirname, "../cli.ts");\n',
  "pkg/helpers/spawn.ts": 'export const worker = new URL("../fixtures/worker.ts", import.meta.url);\n',
  "pkg/fixtures/worker.ts": 'import "../src/lock.js";\n',
  "pkg/tests/probe-one.test.ts": 'import "../helpers/only-one.js";\nimport "../src/store.js";\n',
  "pkg/tests/probe-two.test.ts": 'import "../src/store.js";\nimport "../helpers/commands.js";\n',
  "pkg/tests/probe-three.test.ts": 'import "../helpers/spawn.js";\n',
  "pkg/tests/probe-whole.test.ts": 'import "../src/store.js";\n',
  "pkg/tests/probe-gated.test.ts": 'import "../src/store.js";\n',
};

function select(form: ReachForm, changed: string[], files = repository, environment = {}) {
  return selectReachSuites(declaration(), memoryFiles(files), { form, changed, environment });
}

describe("selection by reach", () => {
  it("selects the suites whose import closure holds a changed path and names the paths that reached them", () => {
    const selection = select("reach", ["pkg/helpers/only-one.ts", "pkg/unrelated.md"]);
    expect(selection.suites).toEqual(["pkg/tests/probe-one.test.ts"]);
    expect(selection.reachedBy).toEqual(["pkg/helpers/only-one.ts"]);
    expect(select("reach", ["pkg/src/store.ts"]).suites)
      .toEqual(["pkg/tests/probe-one.test.ts", "pkg/tests/probe-two.test.ts"]);
  });

  it("passes a change reaching no suite with a report saying so", () => {
    const selection = select("reach", ["README.md"]);
    expect(selection.suites).toEqual([]);
    expect(describeReachSelection(declaration(), selection)[0]).toBe("probe suites: the change reaches none of 5 suites");
  });

  it("leaves out the whole-only suite and an environment-gated suite with their reasons", () => {
    const selection = select("reach", ["pkg/src/store.ts"]);
    expect(selection.left).toHaveLength(2);
    expect(selection.left).toEqual(expect.arrayContaining([
      { suite: "pkg/tests/probe-gated.test.ts", reason: "runs with ARC_PROBE_GATE=1" },
      { suite: "pkg/tests/probe-whole.test.ts", reason: "runs only in a full run" },
    ]));
    expect(select("reach", ["pkg/src/store.ts"], repository, { ARC_PROBE_GATE: "1" }).suites)
      .toContain("pkg/tests/probe-gated.test.ts");
  });

  it("selects through a deleted path a declared locating module finds", () => {
    expect(select("reach", ["pkg/content/removed.md"]).suites)
      .toEqual(["pkg/tests/probe-one.test.ts", "pkg/tests/probe-two.test.ts"]);
  });

  it("fails when a suite still imports a deleted module", () => {
    const remaining = Object.fromEntries(Object.entries(repository).filter(([path]) => path !== "pkg/helpers/only-one.ts"));
    expect(() => select("reach", ["pkg/helpers/only-one.ts"], remaining))
      .toThrow(/pkg\/tests\/probe-one\.test\.ts imports \.\.\/helpers\/only-one\.js, which resolves to no file/u);
  });

  it("follows a located script under the scripts directory through its imports, and takes any other file by itself", () => {
    expect(select("reach", ["pkg/src/lock.ts"]).suites).toEqual(["pkg/tests/probe-three.test.ts"]);
    expect(select("reach", ["pkg/fixtures/worker.ts"]).suites).toEqual(["pkg/tests/probe-three.test.ts"]);
    expect(select("reach", ["pkg/cli.ts"]).suites).toEqual(["pkg/tests/probe-two.test.ts"]);
    expect(select("reach", ["pkg/src/command.ts"]).suites).toEqual([]);
  });

  it("fails on a path built from a module's location that it can neither resolve to a file nor find declared", () => {
    const built = { ...repository,
      "pkg/helpers/only-one.ts": 'import { join } from "node:path";\nconst name = "x";\nexport const p = join(import.meta.dirname, name);\n' };
    expect(() => select("reach", [], built)).toThrow(/pkg\/helpers\/only-one\.ts:3 builds a path from its own location/u);
    const missing = { ...repository, "pkg/helpers/only-one.ts": 'export const p = new URL("./absent.json", import.meta.url);\n' };
    expect(() => select("reach", [], missing)).toThrow(/locates pkg\/helpers\/absent\.json, which is not a file/u);
    const directory = { ...repository, "pkg/helpers/only-one.ts": 'export const p = new URL("../content", import.meta.url);\n' };
    expect(() => select("reach", [], directory)).toThrow(/locates pkg\/content, which is not a file/u);
  });

  it("takes a declared locating module's finds in place of evaluating its own paths", () => {
    const declared = declaration({ locating: [...declaration().locating,
      { module: "pkg/helpers/only-one.ts", finds: ["pkg/recipe.json"] }] });
    const built = { ...repository,
      "pkg/helpers/only-one.ts": 'import { join } from "node:path";\nexport const p = (name: string) => join(import.meta.dirname, name);\n' };
    const selection = selectReachSuites(declared, memoryFiles(built), { form: "reach", changed: ["pkg/recipe.json"], environment: {} });
    expect(selection.suites).toEqual(["pkg/tests/probe-one.test.ts", "pkg/tests/probe-two.test.ts"]);
  });

  it("selects every suite in its per-change form on a change to a widening input or what a widening closure imports", () => {
    const every = ["pkg/tests/probe-one.test.ts", "pkg/tests/probe-three.test.ts", "pkg/tests/probe-two.test.ts"];
    expect(select("reach", ["pkg/package.json"]).suites).toEqual(every);
    expect(select("reach", ["pkg/config-helper.ts"]).suites).toEqual(every);
    expect(select("reach", ["pkg/config-helper.ts"]).reachedBy).toEqual(["pkg/config-helper.ts"]);
  });

  it("fails when no suite matches or a declared path is not a file", () => {
    expect(() => selectReachSuites(declaration({ suites: ["pkg/tests/none-*.test.ts"] }), memoryFiles(repository),
      { form: "reach", changed: [], environment: {} })).toThrow(/no file matches the suites/u);
    expect(() => selectReachSuites(declaration({ widening: ["pkg/absent.json"] }), memoryFiles(repository),
      { form: "reach", changed: [], environment: {} })).toThrow(/declared path pkg\/absent\.json is not a file/u);
  });
});

describe("the form a run takes", () => {
  it("runs in full with no base or on a change to the selection, and by reach otherwise", () => {
    expect(resolveReachForm(undefined, { hasBase: false, selectionChanged: false })).toBe("full");
    expect(resolveReachForm("", { hasBase: true, selectionChanged: true })).toBe("full");
    expect(resolveReachForm(undefined, { hasBase: true, selectionChanged: false })).toBe("reach");
  });

  it("takes the form an ask sets, even on a change to the selection, and refuses an unknown ask", () => {
    expect(resolveReachForm("every", { hasBase: true, selectionChanged: true })).toBe("every");
    expect(resolveReachForm("every", { hasBase: false, selectionChanged: false })).toBe("every");
    expect(resolveReachForm("full", { hasBase: true, selectionChanged: false })).toBe("full");
    expect(() => resolveReachForm("most", { hasBase: true, selectionChanged: false })).toThrow(ReachError);
  });

  it("counts the data file and the selection's code as the selection", () => {
    expect(selectionPathsChanged(declaration(), "pkg/reach.json", ["pkg/reach.json", "pkg/src/reach.ts", "README.md"]))
      .toEqual(["pkg/reach.json", "pkg/src/reach.ts"]);
  });

  it("runs every suite, the whole-only one among them, in full, and every suite but it per change", () => {
    expect(select("full", []).suites).toContain("pkg/tests/probe-whole.test.ts");
    expect(select("every", []).suites).toEqual(
      ["pkg/tests/probe-one.test.ts", "pkg/tests/probe-three.test.ts", "pkg/tests/probe-two.test.ts"]);
    expect(describeReachSelection(declaration(), select("every", []))[0])
      .toBe("probe suites: per-change run of every suite, 3 of 5");
  });
});

describe("the store check's declaration", () => {
  it("runs once per gate without widening, withholding its paths and selected by deletions", async () => {
    const reach = ReachDeclarationSchema.parse(JSON.parse(await readFile(
      resolve(repositoryRoot, "packages/arc-framework/__tests__/reach/store-suites.json"), "utf8")));
    const checks = CheckDeclarationSchema.parse(load(await readFile(resolve(repositoryRoot, reach.check.declaration), "utf8")));
    expect(checks.checks[reach.check.id]).toMatchObject({ gate: "merge", mode: "files", widen: false, pass_paths: false });
  });

  it("leaves every file of the separate layout's whole run, and only those, to a full run", async () => {
    const reach = ReachDeclarationSchema.parse(JSON.parse(await readFile(
      resolve(repositoryRoot, "packages/arc-framework/__tests__/reach/store-suites.json"), "utf8")));
    const directory = "packages/arc-framework/__tests__/integration";
    const files = (await readdir(resolve(repositoryRoot, directory))).map(name => `${directory}/${name}`);
    expect(files.filter(file => reach.fullOnly.some(glob => globPattern(glob).test(file))).sort()).toEqual(
      SEPARATE_CONFORMANCE_PARTS.map(part => `${directory}/store-ref-separate-conformance-${part}.test.ts`).sort());
  });

  it("forecasts six CI shards, each handing its shard to the runner, while a local run stays one", async () => {
    const reach = ReachDeclarationSchema.parse(JSON.parse(await readFile(
      resolve(repositoryRoot, "packages/arc-framework/__tests__/reach/store-suites.json"), "utf8")));
    const checks = CheckDeclarationSchema.parse(load(await readFile(resolve(repositoryRoot, reach.check.declaration), "utf8")));
    const forecast = resolveCheckForecast(checks.checks[reach.check.id]!, repositoryRoot, [], "linux");
    const [run] = forecast.batches;
    expect(forecast.batches).toHaveLength(1);
    expect(run?.some(argument => argument.startsWith("--shard"))).toBe(false);
    expect(forecast.shards).toEqual([1, 2, 3, 4, 5, 6].map(index => ({ index, batches: [[...run!, `--shard=${index}/6`]] })));
  });
});

describe("tiers that leave reach suites to their check", () => {
  const suites = ["__tests__/integration/store-ref-*.test.ts"];
  it("leaves them out of the integration tier, the lane, and a pull request's portability run", () => {
    const excluded = ["--exclude", "__tests__/integration/store-ref-*.test.ts"];
    expect(reachSuiteExclusions("integration", {}, suites)).toEqual(excluded);
    expect(reachSuiteExclusions("lane", {}, suites)).toEqual(excluded);
    expect(reachSuiteExclusions("portability", { ARC_PORTABILITY_FORM: "pull-request" }, suites)).toEqual(excluded);
  });

  it("keeps them in other portability runs, which take them by reach, the full tier, and the store tier", () => {
    expect(reachSuiteExclusions("portability", {}, suites)).toEqual([]);
    expect(reachSuiteExclusions("full", {}, suites)).toEqual([]);
    expect(reachSuiteExclusions("store", {}, suites)).toEqual([]);
  });

  it("has a portability run take all of a declaration's suites unless its change reaches none", () => {
    expect(portabilityTakesReachSuites({ form: "reach", suites: [] })).toBe(false);
    expect(portabilityTakesReachSuites({ form: "reach", suites: ["packages/arc-framework/__tests__/integration/store-ref-a.test.ts"] }))
      .toBe(true);
    expect(portabilityTakesReachSuites({ form: "full", suites: [] })).toBe(true);
    expect(portabilityTakesReachSuites({ form: "every", suites: [] })).toBe(true);
  });
});

describe("paths and locations", () => {
  it("matches globs within and across path segments", () => {
    expect(globPattern("a/*.ts").test("a/b.ts")).toBe(true);
    expect(globPattern("a/*.ts").test("a/b/c.ts")).toBe(false);
    expect(globPattern("a/**").test("a/b/c.ts")).toBe(true);
    expect(globPattern("a/**/c.ts").test("a/c.ts")).toBe(true);
    expect(globPattern("tsconfig*.json").test("tsconfig.test.json")).toBe(true);
  });

  it("evaluates the literal forms and leaves location text inside strings alone", () => {
    const text = [
      'const a = new URL("../fixtures/w.ts", import.meta.url);',
      'const b = resolve(import.meta.dirname, "..", "cli.ts");',
      'const c = path.join(import.meta.dirname, `x.json`);',
      'const d = fileURLToPath(import.meta.url);',
      'const e = "resolve(import.meta.dirname, \'nope\')";',
    ].join("\n");
    expect(locateFromOwnPath("pkg/helpers/m.ts", text)).toEqual([
      { line: 1, path: "pkg/fixtures/w.ts" }, { line: 2, path: "pkg/cli.ts" },
      { line: 3, path: "pkg/helpers/x.json" }, { line: 4 },
    ]);
  });
});

describe("computed module location reach", () => {
  it("requires declared finds for a destructured location", () => {
    const files = memoryFiles({ ...repository, "pkg/helpers/only-one.ts": "const { dirname } = import.meta; export const p = dirname;" });
    expect(() => selectReachSuites(declaration(), files, { form: "reach", changed: [], environment: {} }))
      .toThrow(/builds a path from its own location/u);
  });

  it("ignores statically unrelated metadata fields", () => {
    const files = { ...repository, "pkg/helpers/only-one.ts":
      'export const mode = import.meta["env"]; export const main = import.meta.main;' };
    expect(select("reach", ["unrelated.txt"], files).suites).toEqual([]);
  });

  it.each([
    'new URL("../located.json", import.meta["url"])',
    'resolve(import.meta["dirname"], "../located.json")',
    'join(import.meta[`dirname`], "../located.json")',
  ])("selects a changed literal file from %s", expression => {
    const files = { ...repository, "pkg/located.json": "{}", "pkg/helpers/only-one.ts": `export const p = ${expression};` };
    expect(select("reach", ["pkg/located.json"], files).suites).toContain("pkg/tests/probe-one.test.ts");
  });

  it.each([
    'new URL(name, import.meta["url"])',
    'resolve(import.meta["dirname"], name)',
    'import.meta["filename"]',
    'import.meta["resolve"]("./data.json")',
    'import.meta[field]',
    'locate(import.meta)',
    '(({ dirname }) => dirname)(import.meta)',
    'locate(__dirname)',
  ])("requires declared finds for unresolved %s and accepts repaired declaration", expression => {
    const files = memoryFiles({ ...repository, "pkg/helpers/only-one.ts":
      `const unrelated = import.meta["env"]; export const p = ${expression};` });
    expect(() => selectReachSuites(declaration(), files, { form: "reach", changed: [], environment: {} }))
      .toThrow(/builds a path from its own location/u);
    const repaired = declaration({ locating: [...declaration().locating,
      { module: "pkg/helpers/only-one.ts", finds: ["pkg/recipe.json"] }] });
    expect(selectReachSuites(repaired, files, { form: "reach", changed: ["pkg/recipe.json"], environment: {} }).suites)
      .toContain("pkg/tests/probe-one.test.ts");
  });
});
