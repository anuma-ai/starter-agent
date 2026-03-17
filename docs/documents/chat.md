# Chat

The `chat` command starts an interactive session that streams responses from the Anuma Portal API. It uses `runToolLoop` from `@anuma/sdk/server` to handle the full request cycle: sending messages, streaming tokens, executing client-side tools, and feeding results back to the model.

## The Tool Loop

Each user message goes through `runToolLoop`, which manages streaming and multi-turn tool execution in a single call. The SDK handles SSE parsing, tool call detection, executor dispatch, and continuation requests internally.

```ts
        const result = await runToolLoop({
          messages: messages as any,
          model,
          token: apiKey,
          baseUrl,
          headers: sdkHeaders(apiKey),
          apiType: "completions",
          ...(opts.tools && { tools }),
          onData: (chunk: string) => {
            if (firstToken) {
              spinner.stop();
              firstToken = false;
            }
            process.stdout.write(chunk);
          },
          onError: () => {
            if (firstToken) {
              spinner.stop();
              firstToken = false;
            }
          },
        });
```

[src/commands/chat.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/commands/chat.ts#L326-L347)

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
  .option("--resume <id>", "Resume a previous conversation by ID")
  .option("--reset", "Delete all conversations and start fresh")
  .action(async (opts: { model: string; system?: string; apiUrl?: string; tools: boolean; resume?: string; reset?: boolean }) => {
    if (opts.reset) {
      rmSync(DATA_DIR, { recursive: true, force: true });
      console.log(chalk.dim("All conversations deleted.\n"));
    }

    const baseUrl = opts.apiUrl ?? getApiUrl();
    const apiKey = getApiKey();
    const ctx = getStorageContext();
    const messages: Message[] = [];

    // Resolve or lazily create a conversation
    let conversationId: string | null = null;
    let isNewConversation = false;

    if (opts.system) {
      messages.push({ role: "system", content: [{ type: "text", text: opts.system }] });
    }

    if (opts.resume) {
      const conv = await getConversationOp(ctx, opts.resume);
      if (!conv) {
        console.error(chalk.red(`Conversation not found: ${opts.resume}`));
        process.exit(1);
      }
      conversationId = conv.conversationId;
      const restored = await loadConversation(conversationId);
      messages.push(...restored);
      console.log(chalk.dim(`Resumed "${conv.title}" (${restored.length} messages)\n`));
    }

    let model = opts.model;

    console.log(
      chalk.dim(`Model: ${model}. Type /new, /history, /model, /exit.\n`),
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

      if (input.trim() === "/history") {
        rl.close();
        const picked = await pickConversation();
        if (picked?.action === "resume") {
          conversationId = picked.conversation.conversationId;
          messages.length = 0;
          if (opts.system) {
            messages.push({ role: "system", content: [{ type: "text", text: opts.system }] });
          }
          const restored = await loadConversation(conversationId);
          messages.push(...restored);
          console.log(chalk.dim(`Switched to "${picked.conversation.title}" (${restored.length} messages)\n`));
        } else if (picked?.action === "delete") {
          await deleteConversationOp(ctx, picked.conversation.conversationId);
          if (conversationId === picked.conversation.conversationId) {
            conversationId = null;
            isNewConversation = false;
            messages.length = 0;
            if (opts.system) {
              messages.push({ role: "system", content: [{ type: "text", text: opts.system }] });
            }
          }
          console.log(chalk.dim(`Deleted "${picked.conversation.title}"\n`));
        }
        rl = createInterface({ input: process.stdin, output: process.stdout });
        closed = false;
        rl.on("close", () => { closed = true; });
        continue;
      }
      if (input.trim() === "/new") {
        conversationId = null;
        isNewConversation = false;
        messages.length = 0;
        if (opts.system) {
          messages.push({ role: "system", content: [{ type: "text", text: opts.system }] });
        }
        console.log(chalk.dim("Started new conversation.\n"));
        continue;
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

      // Lazily create a conversation on first user message.
      if (!conversationId) {
        const truncated = input.length > 60 ? input.slice(0, 57) + "…" : input;
        const conv = await createConversationOp(ctx, undefined, truncated);
        conversationId = conv.conversationId;
        isNewConversation = true;
      }

      // Generate a proper title in the background after the first message.
      if (isNewConversation) {
        isNewConversation = false;

        const targetConversationId = conversationId!;
        postApiV1ChatCompletions({
          baseUrl,
          headers: sdkHeaders(apiKey),
          body: {
            model,
            messages: [
              { role: "system", content: [{ type: "text", text: "Generate a short (max 6 words) conversation title for the user message below. Reply with the title only, no quotes or punctuation." }] },
              { role: "user", content: [{ type: "text", text: input }] },
            ],
          },
        }).then(async (res) => {
          const title = (res.data as any)?.choices?.[0]?.message?.content?.trim();
          if (title) {
            await updateConversationTitleOp(ctx, targetConversationId, title);
          }
        }).catch(() => {});
      }

      process.stdout.write("\n");
      const spinner = ora({ color: "cyan" }).start();
      let firstToken = true;

      // Store user message
      const userText = input;
      await createMessageOp(ctx, { conversationId: conversationId!, role: "user", content: userText, model });

      try {
        const result = await runToolLoop({
          messages: messages as any,
          model,
          token: apiKey,
          baseUrl,
          headers: sdkHeaders(apiKey),
          apiType: "completions",
          ...(opts.tools && { tools }),
          onData: (chunk: string) => {
            if (firstToken) {
              spinner.stop();
              firstToken = false;
            }
            process.stdout.write(chunk);
          },
          onError: () => {
            if (firstToken) {
              spinner.stop();
              firstToken = false;
            }
          },
        });

        if (firstToken) spinner.stop();

        if (result.error) {
          console.error(chalk.red(`Error: ${String(result.error)}`));
        } else {
          process.stdout.write("\n");
          const d = result.data as any;
          const text: string =
            d?.choices?.[0]?.message?.content ??
            d?.output?.find?.((o: any) => o.type === "message")?.content
              ?.find?.((c: any) => c.type === "output_text")?.text ??
            "";

          messages.push({ role: "assistant", content: text });

          // Store assistant message
          if (text) {
            await createMessageOp(ctx, { conversationId: conversationId!, role: "assistant", content: text, model });
          }

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

[src/commands/chat.ts](https://github.com/anuma-ai/starter-agent/blob/main/src/commands/chat.ts#L147-L383)

The REPL supports two slash commands: `/model` opens a fuzzy-search picker (or sets a model by name), and `/exit` quits the session.

## Streaming

Tokens stream directly to stdout via the `onData` callback. A spinner shows while waiting for the first token, then stops as soon as content arrives. This gives immediate feedback without buffering the full response.
