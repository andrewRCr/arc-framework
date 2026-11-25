/** Composite status exposes native in-flight view diagnostics through the registered CLI. */
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});

import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";

afterEach(() => { binding.store = null; beginProjectionCommand(); });

it("names an unknown view and missing pin through arc status without changing stored records", async () => {
  const { f } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  await seed(f, recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project" })),
    JSON.stringify({ projectId: "34567890-1234-4234-8234-123456789abc" }));
  await f.ports.exec("git", ["config", "arc.inflightView", "unknown"], { cwd: f.root });
  await f.ports.exec("git", ["config", "arc.inflightPin", "missing"], { cwd: f.root });
  const before = success(await f.store.version()), cwd = process.cwd(), exit = process.exitCode;
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    binding.store = f.store;
    process.chdir(f.root);
    process.exitCode = undefined;
    await dispatchRegisteredCli(["status", "--json"]);
  } finally {
    stdout.mockRestore(); stderr.mockRestore(); process.chdir(cwd); process.exitCode = exit;
  }
  const result: unknown = JSON.parse(output);
  expect(result).toMatchObject({ projection: { ok: true, value: { kind: "ready", view: { mode: "mine", pins: ["missing"],
    diagnostics: expect.arrayContaining([
      expect.objectContaining({ reason: expect.stringContaining('arc.inflightView value "unknown"') }),
      expect.objectContaining({ reason: expect.stringContaining('arc.inflightPin "missing"') }),
    ]),
  } } } });
  expect(success(await f.store.version())).toBe(before);
});
