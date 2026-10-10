/** Configured project membership determines focused runtime need before any preparation. */
import { expect, it, vi } from "vitest";
import { discoverVitestSelection } from "../../src/lib/vitest-discovery.js";
import { makeVitestControllerFake } from "../helpers/vitest-controller-fake.js";

it.each([
  { projects: ["unit"], runtime: false },
  { projects: ["unit", "unit-mocks"], runtime: false },
  { projects: ["integration"], runtime: true },
  { projects: ["e2e"], runtime: true },
  { projects: ["unit", "integration", "e2e"], runtime: true },
])("derives runtime need $runtime for configured $projects", async ({ projects, runtime }) => {
  for (const key of ["TEST", "VITEST", "NODE_ENV"]) vi.stubEnv(key, process.env[key]);
  const fake = makeVitestControllerFake(projects.map((project) => ({ path: `${project}.test.ts`, project })));
  try {
    const selected = await discoverVitestSelection([], {}, undefined, fake.create);
    expect(selected.requiresRuntime).toBe(runtime);
    expect(selected.specifications.map(({ project }) => project.name)).toEqual(projects);
    expect(fake.events).toEqual(["initialized"]);
  } finally { vi.unstubAllEnvs(); }
});
