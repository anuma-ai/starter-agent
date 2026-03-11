# Tools

Client-side tools let the model interact with the user's local environment. Each tool has a JSON schema that the model sees, and an `executor` function that runs on the user's machine when the model calls it. The SDK's `runToolLoop` handles execution automatically.

## Tool Definition

A tool is a `ToolConfig` object that combines an OpenAI-compatible function schema with a local executor. Here's the included `list_files` tool:

{@includeCode ../src/tools/list-files.ts#listFilesTool}

The `function` object describes the tool to the model: its name, what it does, and what arguments it accepts. The `executor` receives parsed arguments and returns a result that gets sent back to the model as a tool response.

## Executor

The executor runs locally and can do anything a Node.js process can. In this case it reads the filesystem, but you could call local APIs, run shell commands, query databases, or interact with hardware.

{@includeCode ../src/tools/list-files.ts#executor}

Return values are serialized to JSON and sent back to the model. Returning an `error` field is a convention that helps the model understand failures.

## Tool Registry

All tools are collected in a single array and passed to `runToolLoop`:

{@includeCode ../src/tools/index.ts#toolRegistry}

To add a new tool, create a file in `src/tools/`, define a `ToolConfig`, and add it to this array. The model will see it in the next request.

## Disabling Tools

Pass `--no-tools` to run without client-side tools:

```bash
anuma-agent chat --no-tools
```

This omits the `tools` array from the request entirely, so the model won't attempt any tool calls. Server-side tools (if configured on the Portal) still work regardless of this flag.
