// #region config
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
// #endregion config
