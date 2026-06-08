"use server";

import { db } from "@/lib/db";
import { knowledgeNodes, knowledgeEdges } from "@/lib/db/schema";

// MCP 进程管理器（单例，存在全局）
const state = {
  process: null as ReturnType<typeof import("child_process").spawn> | null,
  status: "stopped" as "stopped" | "running",
  output: [] as string[],
};

export async function getMcpStatus() {
  return {
    status: state.status,
    output: state.output.slice(-50),
    pid: state.process?.pid ?? null,
  };
}

export async function startMcp() {
  if (state.status === "running") {
    return { success: false, message: "MCP 服务已在运行中" };
  }

  const { spawn } = await import("child_process");
  const path = await import("path");

  const serverPath = path.resolve(process.cwd(), "src/mcp/server.ts");

  // shell: true is required on Windows because npx is a .cmd file.
  // Safe here because all args are hardcoded, no user input.
  const proc = spawn("npx", ["tsx", serverPath], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });

  state.process = proc;
  state.output = [];
  state.status = "running";

  proc.stdout?.on("data", (data: Buffer) => {
    state.output.push(`[out] ${data.toString().trim()}`);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    state.output.push(`[err] ${data.toString().trim()}`);
  });

  proc.on("close", (code: number) => {
    state.output.push(`[exit] 进程退出，代码: ${code}`);
    state.status = "stopped";
    state.process = null;
  });

  proc.on("error", (err: Error) => {
    state.output.push(`[error] ${err.message}`);
    state.status = "stopped";
    state.process = null;
  });

  return { success: true, message: `MCP 服务已启动 (PID: ${proc.pid})` };
}

export async function stopMcp() {
  if (state.status === "stopped" || !state.process) {
    return { success: false, message: "MCP 服务未在运行" };
  }

  state.process.kill();
  state.process = null;
  state.status = "stopped";
  state.output.push("[info] MCP 服务已停止");

  return { success: true, message: "MCP 服务已停止" };
}

export async function getMcpStats() {
  const nodeCount = (await db.select().from(knowledgeNodes)).length;
  const edgeCount = (await db.select().from(knowledgeEdges)).length;

  return { nodeCount, edgeCount };
}
