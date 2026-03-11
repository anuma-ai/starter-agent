import { Command } from "commander";
import { createInterface } from "readline";
import chalk from "chalk";
import ora from "ora";
import search from "@inquirer/search";
import { runToolLoop } from "@anuma/sdk/server";
import { getApiV1Models } from "@anuma/sdk/client";
import { getApiKey, getApiUrl } from "../config.js";
import { tools } from "../tools/index.js";

interface Message {
  role: "user" | "assistant" | "system";
  content: Array<{ type: string; text: string }>;
}

function sdkHeaders(apiKey: string) {
  return { "X-API-Key": apiKey };
}

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

  const selected = await search({
    message: "Select a model",
    source: (input) => {
      const term = (input ?? "").toLowerCase();
      return modelIds
        .filter((id) => id.toLowerCase().includes(term))
        .map((id) => ({ name: id, value: id }));
    },
  });

  return selected;
}

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
