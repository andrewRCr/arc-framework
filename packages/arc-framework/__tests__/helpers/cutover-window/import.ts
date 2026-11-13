/** Run the admitted native import shared by the window's post-import scenarios. */
import type { windowFixture } from "./fixture.js";
import { checkFixture } from "./check.js";
import { saveImportPersonal } from "../store/import-fixture.js";
import { invokeStoreRemote } from "../store/remote-command.js";

/** Admit, save and publish personal inputs, then import the fixture through the production handler. */
export async function importWindowFixture(h: Awaited<ReturnType<typeof windowFixture>>): Promise<void> {
  const checked = await checkFixture(h);
  if (checked.exit !== 0) throw new Error(checked.report);
  await saveImportPersonal(h.root, false);
  const published = await invokeStoreRemote(["origin", "push"], { cwd: h.root });
  if (published.result.status !== "ok") throw new Error(JSON.stringify(published));
  const imported = await h.migrate();
  if (imported.status !== "ok") throw new Error(JSON.stringify(imported));
}
