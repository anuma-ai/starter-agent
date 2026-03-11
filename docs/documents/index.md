# Anuma Starter Agent

An interactive CLI chat agent built with the [Anuma SDK](https://github.com/anuma-ai/sdk). Supports streaming responses, model switching, and client-side tool execution via the SDK's `runToolLoop`.

## Setup

```bash
pnpm install
```

Sign in at [dashboard.anuma.ai](https://dashboard.anuma.ai/) and create an app to get your API key. Then save it:

```bash
pnpm agent login --api-key <your-key>
```

## Usage

Start a chat session:

```bash
pnpm agent chat
```

Options:

```
--model <name>      Model to use (default: "openai/gpt-4o")
--system <prompt>   System prompt
--api-url <url>     API base URL
--no-tools          Disable client-side tools
```

### Chat commands

- `/model` — open the model picker (fuzzy search)
- `/model <name>` — switch to a model by name
- `/exit` — quit the session

## Adding tools

Tools live in `src/tools/`. Each tool is a `ToolConfig` object with a function schema and an `executor` that runs locally when the model calls it.

Create a new file in `src/tools/`:

```typescript
import type { ToolConfig } from "@anuma/sdk/server";

export const myTool: ToolConfig = {
  type: "function",
  function: {
    name: "my_tool",
    description: "What this tool does",
    parameters: {
      type: "object",
      properties: {
        arg: { type: "string", description: "Argument description" },
      },
      required: ["arg"],
    },
  },
  executor: async ({ arg }) => {
    // Your logic here — runs on the user's machine
    return { result: "..." };
  },
};
```

Then register it in `src/tools/index.ts`:

```typescript
import { myTool } from "./my-tool.js";

export const tools: ToolConfig[] = [listFiles, myTool];
```

The included `list_files` tool demonstrates this pattern — it reads the local filesystem, something only a client-side tool can do.

## Build

```bash
pnpm build
```

After building, the CLI is available as `anuma-agent` (via the `bin` field in package.json).
