// #region toolRegistry
import type { ToolConfig } from "@anuma/sdk/server";
import { listFiles } from "./list-files.js";

export const tools: ToolConfig[] = [listFiles];
// #endregion toolRegistry
