# Tools

Client-side tools let the model interact with the user's local environment. Each tool has a JSON schema that the model sees, and an `executor` function that runs on the user's machine when the model calls it. The SDK's `runToolLoop` handles execution automatically.

## Tool Definition

A tool is a `ToolConfig` object that combines an OpenAI-compatible function schema with a local executor. Here's the included `list_files` tool:

```ts
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
};
```

[src/tools/list-files.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/tools/list-files.ts#L2-L44)

The `function` object describes the tool to the model: its name, what it does, and what arguments it accepts. The `executor` receives parsed arguments and returns a result that gets sent back to the model as a tool response.

## Executor

The executor runs locally and can do anything a Node.js process can. In this case it reads the filesystem, but you could call local APIs, run shell commands, query databases, or interact with hardware.

```ts
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
```

[src/tools/list-files.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/tools/list-files.ts#L23-L42)

Return values are serialized to JSON and sent back to the model. Returning an `error` field is a convention that helps the model understand failures.

## Tool Registry

All tools are collected in a single array and passed to `runToolLoop`:

```ts
import type { ToolConfig } from "@anuma/sdk/server";
import { listFiles } from "./list-files.js";

export const tools: ToolConfig[] = [listFiles];
```

[src/tools/index.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/tools/index.ts#L2-L5)

To add a new tool, create a file in `src/tools/`, define a `ToolConfig`, and add it to this array. The model will see it in the next request.

## Disabling Tools

Pass `--no-tools` to run without client-side tools:

```bash
anuma-agent chat --no-tools
```

This omits the `tools` array from the request entirely, so the model won't attempt any tool calls. Server-side tools (if configured on the Portal) still work regardless of this flag.
