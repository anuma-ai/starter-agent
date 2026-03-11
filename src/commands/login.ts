import { Command } from "commander";
import chalk from "chalk";
import { setApiKey } from "../config.js";

export const login = new Command("login")
  .description("Save your API key")
  .requiredOption("--api-key <key>", "API key")
  .action((opts: { apiKey: string }) => {
    setApiKey(opts.apiKey);
    console.log(chalk.green("API key saved."));
  });
