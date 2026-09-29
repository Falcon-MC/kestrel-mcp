import fs from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Instances, KestrelInstance } from "../instance.js";

export type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export type ToolResult = { content: Content[]; isError?: boolean };

export function text(value: unknown): ToolResult {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

export function isToolResult(value: unknown): value is ToolResult {
  return typeof value === "object" && value !== null && Array.isArray((value as ToolResult).content);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Minecraft colour and style codes, which only get in the way of reading.
 */
export function plain(value: string): string {
  return value.replace(/§./g, "");
}

export interface ToolContext {
  server: McpServer;
  instances: Instances;
}

const instanceShape = {
  instance: z.string().optional().describe('Which Kestrel to act on when several run; "default" when left out'),
};

/**
 * Registers a tool that works on one Kestrel instance. Whatever the handler
 * returns becomes pretty JSON unless it already is a tool result, and thrown
 * errors come back as tool errors the agent can read.
 */
export function define<Shape extends z.ZodRawShape>(
  context: ToolContext,
  name: string,
  description: string,
  shape: Shape,
  handler: (args: z.infer<z.ZodObject<Shape>>, kestrel: KestrelInstance) => Promise<unknown>,
  annotations?: ToolAnnotations,
): void {
  const inputSchema = { ...shape, ...instanceShape };
  context.server.registerTool(name, { description, inputSchema, annotations }, (async (args: Record<string, unknown>) => {
    try {
      const kestrel = context.instances.get((args.instance as string | undefined) ?? "default");
      const result = await handler(args as z.infer<z.ZodObject<Shape>>, kestrel);
      return isToolResult(result) ? result : text(result ?? { ok: true });
    } catch (error) {
      return { ...text((error as Error).message), isError: true };
    }
  }) as any);
}

export interface ScreenshotOptions {
  maxWidth?: number;
  crop?: { x: number; y: number; width: number; height: number };
  savePath?: string;
}

export async function screenshot(kestrel: KestrelInstance, options: ScreenshotOptions = {}): Promise<ToolResult> {
  const shot = await kestrel.call("screenshot", { maxWidth: options.maxWidth ?? 1280, crop: options.crop });
  const { png, ...meta } = shot as { png: string } & Record<string, unknown>;
  if (options.savePath) {
    await fs.writeFile(options.savePath, Buffer.from(png, "base64"));
    meta.savedTo = options.savePath;
  }
  return {
    content: [
      { type: "image", data: png, mimeType: "image/png" },
      { type: "text", text: JSON.stringify(meta) },
    ],
  };
}

/**
 * Adds a screenshot to a result once the screen had time to settle, for
 * tools that change what is on screen.
 */
export async function withScreenshot(kestrel: KestrelInstance, result: unknown, wanted: boolean | undefined, settleMs = 450): Promise<unknown> {
  if (!wanted || kestrel.mode === "headless") {
    return result;
  }
  await sleep(settleMs);
  const shot = await screenshot(kestrel, { maxWidth: 1280 });
  return { content: [text(result).content[0], ...shot.content] };
}

export const screenshotFlag = z.boolean().optional().describe("Attach a screenshot taken after the screen settles");
