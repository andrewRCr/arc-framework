/** Integration cases for remote-bearing user synchronization and retirement. */

import {
  registerUserPushPullTests,
  registerUserRetiredSubdirTests,
  registerUserSubdirectoryTests,
} from "./user.cases.js";

registerUserRetiredSubdirTests();
registerUserSubdirectoryTests();
registerUserPushPullTests();
