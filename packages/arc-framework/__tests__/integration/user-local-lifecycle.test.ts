/** Integration cases for local user state and worktree lifecycle. */

import {
  registerUserAddTests,
  registerUserCloseTests,
  registerUserLoadBackupTests,
  registerUserOpenTests,
  registerUserSaveAndLoadTests,
  registerUserSplitSourceTests,
  registerUserStatusTests,
  registerUserWorkspaceRenameTests,
} from "./user.cases.js";

registerUserSaveAndLoadTests();
registerUserWorkspaceRenameTests();
registerUserLoadBackupTests();
registerUserSplitSourceTests();
registerUserAddTests();
registerUserStatusTests();
registerUserOpenTests();
registerUserCloseTests();
