#!/usr/bin/env node

// #region entrypoint
import { Command } from "commander";
import { login } from "./commands/login.js";
import { chat } from "./commands/chat.js";

const program = new Command();

program
  .name("anuma-agent")
  .description("Anuma starter agent – interactive chat CLI")
  .version("0.1.0");

program.addCommand(login);
program.addCommand(chat);

program.parse();
// #endregion entrypoint
