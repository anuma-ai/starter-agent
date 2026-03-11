// #region listFilesTool
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ToolConfig } from "@anuma/sdk/server";

export const listFiles: ToolConfig = {
  type: "function",
  function: {
    name: "list_files",
    description:
      "List files and directories in a given path on the user's machine. Returns names, types, and sizes.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative directory path. Defaults to the current working directory.",
        },
      },
    },
  },
  // #region executor
  executor: async ({ path }) => {
    const dir = String(path || ".");
    try {
      const entries = readdirSync(dir).map((name) => {
        try {
          const stat = statSync(join(dir, name));
          return {
            name,
            type: stat.isDirectory() ? "directory" : "file",
            size: stat.size,
          };
        } catch {
          return { name, type: "unknown", size: 0 };
        }
      });
      return { path: dir, entries };
    } catch (err: any) {
      return { error: err.message };
    }
  },
  // #endregion executor
};
// #endregion listFilesTool
