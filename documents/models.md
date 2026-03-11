# Models

The agent defaults to `openai/gpt-4o` but can switch models at any time. You can set a model on startup with `--model` or change it mid-session with the `/model` command.

## Fetching Available Models

The `fetchModelIds` function queries the Portal API for all available models using the generated SDK client:

{@includeCode ../src/commands/chat.ts#fetchModels}

This uses `getApiV1Models` from `@anuma/sdk/client`, which hits the `/api/v1/models` endpoint.

## Interactive Picker

When you type `/model` without a name, the agent opens a fuzzy-search picker powered by `@inquirer/search`:

{@includeCode ../src/commands/chat.ts#pickModel}

The picker fetches the full model list, then filters in real time as you type. Select a model to switch to it for the rest of the session.

## Setting a Model

There are three ways to choose a model:

```bash
# At startup
anuma-agent chat --model anthropic/claude-3-7-sonnet

# During a session — interactive picker
> /model

# During a session — by name
> /model anthropic/claude-3-7-sonnet
```
