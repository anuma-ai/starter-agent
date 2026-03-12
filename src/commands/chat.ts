import { Command } from "commander";
import { createInterface } from "readline";
import chalk from "chalk";
import ora from "ora";
import search from "@inquirer/search";
import {
  runToolLoop,
  createConversationOp,
  createMessageOp,
  deleteConversationOp,
  getConversationsOp,
  getConversationOp,
  getMessagesOp,
  updateConversationTitleOp,
  type StoredConversation,
} from "@anuma/sdk/server";
import { getApiV1Models, postApiV1ChatCompletions } from "@anuma/sdk/client";
import { rmSync } from "node:fs";
import { getApiKey, getApiUrl } from "../config.js";
import { tools } from "../tools/index.js";
import { getStorageContext, DATA_DIR } from "../db.js";

type Message = { role: "user" | "assistant" | "system"; content: string | Array<{ type: string; text: string }> };

function sdkHeaders(apiKey: string) {
  return { "X-API-Key": apiKey };
}


// #region fetchModels
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
// #endregion fetchModels

// #region pickModel
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
// #endregion pickModel

// #region loadConversation
async function loadConversation(conversationId: string): Promise<Message[]> {
  const ctx = getStorageContext();
  const stored = await getMessagesOp(ctx, conversationId);
  return stored.map((m): Message => ({
    role: m.role,
    content: m.role === "assistant" ? m.content : [{ type: "text", text: m.content }],
  }));
}
// #endregion loadConversation

// #region pickConversation
type PickResult =
  | { action: "resume"; conversation: StoredConversation }
  | { action: "delete"; conversation: StoredConversation }
  | null;

async function pickConversation(): Promise<PickResult> {
  const ctx = getStorageContext();
  const conversations = await getConversationsOp(ctx);

  if (conversations.length === 0) {
    console.log(chalk.dim("No saved conversations.\n"));
    return null;
  }

  let picked: StoredConversation;
  try {
    picked = await search({
      message: "Select a conversation",
      source: (input) => {
        const term = (input ?? "").toLowerCase();
        return conversations
          .filter(
            (c) =>
              c.title.toLowerCase().includes(term) ||
              c.conversationId.toLowerCase().includes(term),
          )
          .map((c) => ({
            name: `${c.title}  ${chalk.dim(c.conversationId.slice(0, 12) + "…")}  ${chalk.dim(c.createdAt.toLocaleDateString())}`,
            value: c,
          }));
      },
    });
  } catch {
    return null;
  }

  let action: string;
  try {
    action = await search({
      message: `"${picked.title}"`,
      source: () => [
        { name: "Resume", value: "resume" },
        { name: chalk.red("Delete"), value: "delete" },
      ],
    });
  } catch {
    return null;
  }

  return { action: action as "resume" | "delete", conversation: picked };
}
// #endregion pickConversation

// #region chatCommand
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

      // #region slashHistory
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
      // #endregion slashHistory

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

      // #region ensureConversation
      // Lazily create a conversation on first user message.
      if (!conversationId) {
        const truncated = input.length > 60 ? input.slice(0, 57) + "…" : input;
        const conv = await createConversationOp(ctx, undefined, truncated);
        conversationId = conv.conversationId;
        isNewConversation = true;
      }
      // #endregion ensureConversation

      // #region generateTitle
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
      // #endregion generateTitle

      process.stdout.write("\n");
      const spinner = ora({ color: "cyan" }).start();
      let firstToken = true;

      // Store user message
      const userText = input;
      await createMessageOp(ctx, { conversationId: conversationId!, role: "user", content: userText, model });

      try {
        // #region runToolLoop
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
        // #endregion runToolLoop

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
// #endregion chatCommand
