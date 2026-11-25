/** Run the admitted native import shared by the window's post-import scenarios. */
import type { MigrateReport } from "../../../src/lib/store/commands.js";
import type { windowFixture } from "./fixture.js";
import { checkFixture } from "./check.js";
import { saveImportPersonal } from "../store/import-fixture.js";
import { invokeStoreRemote } from "../store/remote-command.js";

/** Admit, save and publish personal inputs, then import the fixture through the production handler. */
export async function importWindowFixture(h: Awaited<ReturnType<typeof windowFixture>>, command = false): Promise<MigrateReport> {
  const checked = await checkFixture(h);
  if (checked.exit !== 0) throw new Error(checked.report);
  await saveImportPersonal(h.root, false);
  const published = await invokeStoreRemote(["origin", "push"], { cwd: h.root });
  if (published.result.status !== "ok") throw new Error(JSON.stringify(published));
  const imported = await (command ? h.migrateCommand() : h.migrate());
  if (imported.status !== "ok") throw new Error(JSON.stringify(imported));
  return imported.result;
}
