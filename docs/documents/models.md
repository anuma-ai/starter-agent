# Models

The agent defaults to `openai/gpt-4o` but can switch models at any time. You can set a model on startup with `--model` or change it mid-session with the `/model` command.

## Fetching Available Models

The `fetchModelIds` function queries the Portal API for all available models using the generated SDK client:

```ts
async function fetchModelIds(baseUrl: string): Promise<string[]> {
  const apiKey = getApiKey();

  const { data, error } = await getApiV1Models({
    baseUrl,
    headers: sdkHeaders(apiKey),
  });

  if (error) throw new Error(`Failed to fetch models: ${JSON.stringify(error)}`);

  const models = (data as any)?.models ?? (data as any)?.data ?? data;
  if (!Array.isArray(models)) return [];
  return models.map((m: any) => m.id ?? m.name).filter(Boolean);
}
```

[src/commands/chat.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/commands/chat.ts#L31-L44)

This uses `getApiV1Models` from `@anuma/sdk/client`, which hits the `/api/v1/models` endpoint.

## Interactive Picker

When you type `/model` without a name, the agent opens a fuzzy-search picker powered by `@inquirer/search`:

```ts
async function pickModel(current: string, baseUrl: string): Promise<string> {
  const spinner = ora({ text: "Loading models…", color: "cyan" }).start();
  let modelIds: string[];
  try {
    modelIds = await fetchModelIds(baseUrl);
  } catch (err: any) {
    spinner.stop();
    console.error(chalk.red(`Error: ${err.message}`));
    return current;
  }
  spinner.stop();

  if (modelIds.length === 0) {
    console.log(chalk.dim("No models available"));
    return current;
  }

  try {
    return await search({
      message: "Select a model",
      source: (input) => {
        const term = (input ?? "").toLowerCase();
        return modelIds
          .filter((id) => id.toLowerCase().includes(term))
          .map((id) => ({ name: id, value: id }));
      },
    });
  } catch {
    return current;
  }
}
```

[src/commands/chat.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/commands/chat.ts#L48-L78)

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
