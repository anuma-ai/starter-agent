// #region db
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import {
  DatabaseManager,
  serverPlatformStorage,
  type StorageOperationsContext,
  Conversation,
  Message,
} from "@anuma/sdk/server";

// WatermelonDB's LokiJS adapter is CJS — use createRequire for clean interop.
const require = createRequire(import.meta.url);
const LokiJSAdapter = require("@nozbe/watermelondb/adapters/lokijs").default;

// Silence WatermelonDB's [🍉] debug logs in CLI output.
const _log = console.log;
const _warn = console.warn;
console.log = (...args: any[]) => { if (typeof args[0] === "string" && args[0].includes("[🍉]")) return; _log(...args); };
console.warn = (...args: any[]) => { if (typeof args[0] === "string" && args[0].includes("[🍉]")) return; _warn(...args); };

// WatermelonDB requires globalThis.crypto
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto as Crypto,
    writable: true,
    configurable: true,
  });
}

export const DATA_DIR = join(homedir(), ".anuma", "data");

/**
 * Minimal LokiJS persistence adapter that reads/writes a single JSON file.
 * Compatible with the LokiMemoryAdapter interface expected by WatermelonDB.
 */
class LokiFsAdapter {
  loadDatabase(dbname: string, callback: (data: string | null) => void) {
    try {
      const data = readFileSync(dbname, "utf-8");
      callback(data);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        callback(null);
        return;
      }
      callback(null);
    }
  }

  saveDatabase(dbname: string, dbstring: string, callback: (err?: Error) => void) {
    try {
      mkdirSync(dirname(dbname), { recursive: true });
      writeFileSync(dbname, dbstring);
      callback();
    } catch (err: any) {
      callback(err);
    }
  }

  deleteDatabase(dbname: string, callback: (err?: Error) => void) {
    try {
      unlinkSync(dbname);
    } catch (err: any) {
      // Ignore missing file — DB may not have been saved yet.
      if (err.code !== "ENOENT") {
        callback(err);
        return;
      }
    }
    callback();
  }
}

// #region dbManager
const dbManager = new DatabaseManager({
  dbNamePrefix: join(DATA_DIR, "anuma-agent"),
  createAdapter: (dbName, schema, migrations) =>
    new LokiJSAdapter({
      schema,
      migrations,
      dbName,
      useWebWorker: false,
      useIncrementalIndexedDB: false,
      _testLokiAdapter: new LokiFsAdapter(),
    }),
  storage: serverPlatformStorage(),
});
// #endregion dbManager

// #region getStorageContext
/**
 * Get a storage operations context for the SDK's chat operations.
 * Uses a "guest" database (no wallet address).
 */
export function getStorageContext(): StorageOperationsContext {
  const database = dbManager.getDatabase();
  return {
    database,
    messagesCollection: database.get<Message>("history"),
    conversationsCollection: database.get<Conversation>("conversations"),
  };
}
// #endregion getStorageContext
// #endregion db
