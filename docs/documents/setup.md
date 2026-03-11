# Setup

The starter agent stores its configuration in `~/.anuma/config.json`. The config module reads and writes this file and provides helpers used by every command.

## Configuration

```ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
const CONFIG_FILE = join(homedir(), ".anuma", "config.json");
const DEFAULT_BASE_URL = "https://portal.anuma-dev.ai";

interface Config {
  apiKey?: string;
  apiUrl?: string;
}

function readConfig(): Config {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function getApiKey(): string {
  const config = readConfig();
  if (!config.apiKey) {
    console.error(
      "No API key configured. Run: anuma auth login --api-key <key>",
    );
    process.exit(1);
  }
  return config.apiKey;
}

export function setApiKey(apiKey: string): void {
  const config = readConfig();
  config.apiKey = apiKey;
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

export function getApiUrl(): string {
  const config = readConfig();
  return config.apiUrl ?? DEFAULT_BASE_URL;
}
```

[src/config.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/config.ts#L2-L42)

`getApiKey` exits the process if no key is found, so commands that need authentication fail early with a helpful message. `getApiUrl` falls back to the default Portal URL when no override is configured.

## Authentication

To get an API key, sign in at [dashboard.anuma.ai](https://dashboard.anuma.ai/) and create an app. This provisions the API account that powers AI responses.

The `login` command saves an API key to the config file:

```ts
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
```

[src/commands/login.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/commands/login.ts#L2-L12)

Run it once to authenticate:

```bash
anuma-agent login --api-key <your-key>
```

## Entry Point

The CLI entry point wires up the commands with [Commander](https://github.com/tj/commander.js):

```ts
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
```

[src/index.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/index.ts#L4-L18)
