/** Editor opt-in changes only the settings it owns and preserves user JSONC. */
import { parse } from "jsonc-parser";
import { expect, it } from "vitest";
import { mergeEditorSettings } from "../../../src/lib/editor-settings.js";

it("adds permission-aware read-only handling without rewriting comments or other settings", () => {
  const input = '{\r\n  // Keep this theme.\r\n  "workbench.colorTheme" : "Dark",\r\n  "window.zoomLevel" : 1\r\n}\r\n';
  const result = mergeEditorSettings(input, "vscode");
  expect(result.status).toBe("ok");
  if (result.status !== "ok" || result.content === null) throw new Error("No edited settings");
  expect(parse(result.content)).toMatchObject({ "files.readonlyFromPermissions": true,
    "workbench.colorTheme": "Dark", "window.zoomLevel": 1 });
  expect(result.content).toContain('// Keep this theme.\r\n  "workbench.colorTheme" : "Dark"');
  expect(result.content).toContain('"window.zoomLevel" : 1');
  expect(mergeEditorSettings(result.content, "vscode")).toEqual(result);
});

it.each([
  '{"files.readonlyFromPermissions":true, // Keep this setting.\r\n "keep" : 1}',
  '{"before":2,"files.readonlyFromPermissions" /* permission */ : true, // Keep this setting.\r\n "keep" : 1}',
  '{ // Keep this setting.\r\n "keep" : 1, "files.readonlyFromPermissions":true /* trailing */}',
])("removes its permission key without swallowing surrounding comments: %s", input => {
  const result = mergeEditorSettings(input, "vscode", true);
  if (result.status !== "ok" || result.content === null) throw new Error("No removed settings");
  expect(parse(result.content)).not.toHaveProperty("files.readonlyFromPermissions");
  expect(result.content).toContain('// Keep this setting.\r\n "keep" : 1');
  for (const comment of ["/* permission */", "/* trailing */"].filter(comment => input.includes(comment))) {
    expect(result.content).toContain(comment);
  }
});

it.each(['{"files.readonlyFromPermissions": false, "keep" : 1}', '{"keep" : 1}'])(
  "leaves settings byte-identical when removal finds no ARC value: %s", input => {
    expect(mergeEditorSettings(input, "vscode", true)).toEqual({ status: "ok", content: input });
  },
);

const inclusions = ["...", ".arc/active/**", ".arc/backlog/**", ".arc/completed/**", ".arc/user/*/**"];

it.each(['"custom/**", /* default */ "...", ".arc/active/**"', '/* default */ "custom/**", ".arc/active/**"'])(
  "keeps Zed defaults first, retains custom inclusions and comments, and adds each missing root once: %s", list => {
  const input = `{\n "theme" : "Custom",\n "file_scan_inclusions": [${list}]\n}\n`;
  const result = mergeEditorSettings(input, "zed");
  if (result.status !== "ok" || result.content === null) throw new Error("No Zed settings");
  expect(parse(result.content)).toEqual({ theme: "Custom", file_scan_inclusions: ["...", "custom/**", ...inclusions.slice(1)] });
  expect(result.content).toContain('"theme" : "Custom"');
  expect(result.content).toContain("/* default */");
  expect(mergeEditorSettings(result.content, "zed")).toEqual(result);
});

it.each([
  '[".arc/active/**", // Keep custom.\r\n "custom/**", "..."]',
  '["...", ".arc/active/**", // Keep custom.\r\n "custom/**",]',
  '["...", // Keep custom.\r\n "custom/**", ".arc/active/**" /* last */]',
])("removes Zed root globs while preserving custom elements and comments: %s", list => {
  const result = mergeEditorSettings(`{"file_scan_inclusions":${list}, "other" : true}`, "zed", true);
  if (result.status !== "ok" || result.content === null) throw new Error("No remaining Zed settings");
  expect(parse(result.content)).toMatchObject({ file_scan_inclusions: expect.arrayContaining(["...", "custom/**"]), other: true });
  expect(parse(result.content).file_scan_inclusions).not.toContain(".arc/active/**");
  expect(result.content).toContain('// Keep custom.\r\n "custom/**"');
  expect(result.content).toContain('"other" : true');
  if (list.includes("/* last */")) expect(result.content).toContain("/* last */");
});

it("creates only the permission key for missing VS Code settings", () => {
  const result = mergeEditorSettings(null, "vscode");
  if (result.status !== "ok" || result.content === null) throw new Error("No new settings");
  expect(parse(result.content)).toEqual({ "files.readonlyFromPermissions": true });
});

it.each(["vscode", "zed"] as const)("removing %s settings never creates a missing file", editor => {
  expect(mergeEditorSettings(null, editor, true)).toEqual({ status: "ok", content: null });
});

it("removes the ARC-only Zed property and keeps comments inside it and on its neighbors", () => {
  const input = `{"before":1, /* about before */ "file_scan_inclusions": ["...", /* roots */ ${inclusions.slice(1).map(root => JSON.stringify(root)).join(",")}], // Keep next.\n "after" : 2}`;
  const result = mergeEditorSettings(input, "zed", true);
  if (result.status !== "ok" || result.content === null) throw new Error("No remaining user settings");
  expect(parse(result.content)).toEqual({ before: 1, after: 2 });
  expect(result.content).toContain("/* about before */");
  expect(result.content).toContain("/* roots */");
  expect(result.content).toContain('// Keep next.\n "after" : 2');
});

it("creates only Zed's keys for a missing file", () => {
  const result = mergeEditorSettings(null, "zed");
  if (result.status !== "ok" || result.content === null) throw new Error("No new settings");
  expect(parse(result.content)).toEqual({ file_scan_inclusions: inclusions });
});

it.each([
  { source: '{"broken": }', reason: "ValueExpected", repaired: '{"broken": null}' },
  { source: "[]", reason: "object", repaired: "{}" },
  { source: '{"file_scan_inclusions": [7]}', reason: "string array", repaired: '{"file_scan_inclusions": ["custom/**"]}' },
  { source: '{"file_scan_inclusions": "custom/**"}', reason: "string array", repaired: '{"file_scan_inclusions": ["custom/**"]}' },
])("refuses malformed or incompatible settings and accepts their repair: $source", ({ source, reason, repaired }) => {
  for (const remove of [false, true]) {
    expect(mergeEditorSettings(source, "zed", remove)).toEqual({ status: "refused", condition: expect.stringContaining(reason) });
    expect(mergeEditorSettings(repaired, "zed", remove).status).toBe("ok");
  }
});
