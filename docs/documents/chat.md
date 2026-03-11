# Chat

The `chat` command starts an interactive session that streams responses from the Anuma Portal API. It uses `runToolLoop` from `@anuma/sdk/server` to handle the full request cycle: sending messages, streaming tokens, executing client-side tools, and feeding results back to the model.

## The Tool Loop

Each user message goes through `runToolLoop`, which manages streaming and multi-turn tool execution in a single call. The SDK handles SSE parsing, tool call detection, executor dispatch, and continuation requests internally.

```ts
        const result = await runToolLoop({
          messages,
          model,
          token: apiKey,
          baseUrl,
          headers: { "X-API-Key": apiKey },
          apiType: "completions",
          ...(opts.tools && { tools }),
          onData: (chunk) => {
            if (firstToken) {
              spinner.stop();
              firstToken = false;
            }
            process.stdout.write(chunk);
          },
          onError: (err) => {
            spinner.stop();
            console.error(chalk.red(`Error: ${err.message}`));
          },
        });
```

[src/commands/chat.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/commands/chat.ts#L144-L163)

The key options:

- `messages` is the full conversation history, formatted as content arrays
- `token` and `headers` handle authentication (the Portal API uses `X-API-Key`)
- `apiType: "completions"` targets the `/api/v1/chat/completions` endpoint
- `tools` are only included when `--no-tools` is not set
- `onData` streams tokens to stdout as they arrive

When the model calls a tool that has an `executor`, the SDK runs it automatically and sends the result back. This loop continues until the model responds with text or hits the max rounds limit (default 3).

## Command Definition

The full command handles the REPL loop, model switching, and error display:

```ts
export const chat = new Command("chat")
  .description("Start an interactive chat session")
  .option("--api-url <url>", "API base URL")
  .option("--model <name>", "Model to use", "openai/gpt-4o")
  .option("--system <prompt>", "System prompt")
  .option("--no-tools", "Disable client-side tools")
  .action(async (opts: { model: string; system?: string; apiUrl?: string; tools: boolean }) => {
    const baseUrl = opts.apiUrl ?? getApiUrl();
    const apiKey = getApiKey();
    const messages: Message[] = [];

    if (opts.system) {
      messages.push({ role: "system", content: [{ type: "text", text: opts.system }] });
    }

    let model = opts.model;

    console.log(
      chalk.dim(`Model: ${model}. Type /model to switch, /exit to quit.\n`),
    );

    let rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let closed = false;
    rl.on("close", () => {
      closed = true;
    });

    const prompt = (): Promise<string | null> =>
      new Promise((resolve) => {
        if (closed) return resolve(null);
        rl.question(chalk.green("> "), (answer) => resolve(answer));
      });

    while (true) {
      const input = await prompt();
      if (input === null) break;
      if (!input.trim()) continue;
      if (input.trim() === "/exit") {
        rl.close();
        break;
      }

      if (input.trim().startsWith("/model")) {
        const name = input.trim().slice(6).trim();
        if (name) {
          model = name;
        } else {
          rl.close();
          model = await pickModel(model, baseUrl);
          rl = createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          closed = false;
          rl.on("close", () => {
            closed = true;
          });
        }
        console.log(chalk.dim(`Model: ${model}\n`));
        continue;
      }

      messages.push({ role: "user", content: [{ type: "text", text: input }] });

      process.stdout.write("\n");
      const spinner = ora({ color: "cyan" }).start();
      let firstToken = true;

      try {
        const result = await runToolLoop({
          messages,
          model,
          token: apiKey,
          baseUrl,
          headers: { "X-API-Key": apiKey },
          apiType: "completions",
          ...(opts.tools && { tools }),
          onData: (chunk) => {
            if (firstToken) {
              spinner.stop();
              firstToken = false;
            }
            process.stdout.write(chunk);
          },
          onError: (err) => {
            spinner.stop();
            console.error(chalk.red(`Error: ${err.message}`));
          },
        });

        if (firstToken) spinner.stop();

        if (result.error) {
          console.error(chalk.red(`Error: ${result.error}`));
        } else {
          process.stdout.write("\n");

          // Extract assistant text from the response for conversation history
          const response = result.data as any;
          const text =
            response?.choices?.[0]?.message?.content ??
            response?.output?.find?.((o: any) => o.type === "message")?.content
              ?.find?.((c: any) => c.type === "output_text")?.text ??
            "";

          messages.push({ role: "assistant", content: [{ type: "text", text }] });

          if ("autoExecutedToolResults" in result && result.autoExecutedToolResults?.length) {
            for (const tr of result.autoExecutedToolResults) {
              console.log(chalk.dim(`  [tool: ${tr.name}] → ${JSON.stringify(tr.result)}`));
            }
          }
        }

        console.log();
      } catch (err: any) {
        spinner.stop();
        console.error(chalk.red(`Error: ${err.message}`));
      }
    }
  });
```

[src/commands/chat.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/commands/chat.ts#L70-L196)

The REPL supports two slash commands: `/model` opens a fuzzy-search picker (or sets a model by name), and `/exit` quits the session.

## Streaming

Tokens stream directly to stdout via the `onData` callback. A spinner shows while waiting for the first token, then stops as soon as content arrives. This gives immediate feedback without buffering the full response.
