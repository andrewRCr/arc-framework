import { Command } from "commander";

const program = new Command();

program
  .name("arc")
  .description("CLI for installing, updating, and managing ARC framework files")
  .version("0.0.0");

program
  .command("init")
  .description("Initialize ARC framework in the current project")
  .action(() => {
    console.log("arc init — not yet implemented");
  });

program
  .command("update")
  .description("Update ARC framework files to the latest version")
  .action(() => {
    console.log("arc update — not yet implemented");
  });

program
  .command("status")
  .description("Show status of installed ARC framework files")
  .action(() => {
    console.log("arc status — not yet implemented");
  });

program
  .command("diff")
  .description("Show differences between installed and latest framework files")
  .action(() => {
    console.log("arc diff — not yet implemented");
  });

program.parse();
