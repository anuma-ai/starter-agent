# Chat

The `chat` command starts an interactive session that streams responses from the Anuma Portal API. It uses `runToolLoop` from `@anuma/sdk/server` to handle the full request cycle: sending messages, streaming tokens, executing client-side tools, and feeding results back to the model.

## The Tool Loop

Each user message goes through `runToolLoop`, which manages streaming and multi-turn tool execution in a single call. The SDK handles SSE parsing, tool call detection, executor dispatch, and continuation requests internally.

{@includeCode ../src/commands/chat.ts#runToolLoop}

The key options:

- `messages` is the full conversation history, formatted as content arrays
- `token` and `headers` handle authentication (the Portal API uses `X-API-Key`)
- `apiType: "completions"` targets the `/api/v1/chat/completions` endpoint
- `tools` are only included when `--no-tools` is not set
- `onData` streams tokens to stdout as they arrive

When the model calls a tool that has an `executor`, the SDK runs it automatically and sends the result back. This loop continues until the model responds with text or hits the max rounds limit (default 3).

## Command Definition

The full command handles the REPL loop, model switching, and error display:

{@includeCode ../src/commands/chat.ts#chatCommand}

The REPL supports two slash commands: `/model` opens a fuzzy-search picker (or sets a model by name), and `/exit` quits the session.

## Streaming

Tokens stream directly to stdout via the `onData` callback. A spinner shows while waiting for the first token, then stops as soon as content arrives. This gives immediate feedback without buffering the full response.
