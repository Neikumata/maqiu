"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getMcpStatus,
  startMcp,
  stopMcp,
  getMcpStats,
} from "@/server/mcp-manage";
import { listQuestions } from "@/server/exam";
import { getAllProgress } from "@/server/learn";
import { t } from "@/lib/i18n/zh";

type McpStatus = {
  status: "stopped" | "running";
  output: string[];
  pid: number | null;
};

type McpStats = {
  nodeCount: number;
  edgeCount: number;
  hasData: boolean;
};

export default function McpPage() {
  const [status, setStatus] = useState<McpStatus>({
    status: "stopped",
    output: [],
    pid: null,
  });
  const [stats, setStats] = useState<McpStats>({
    nodeCount: 0,
    edgeCount: 0,
    hasData: false,
  });
  const [questionCount, setQuestionCount] = useState(0);
  const [progressCount, setProgressCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    const [s, mcpStats, qs, prog] = await Promise.all([
      getMcpStatus(),
      getMcpStats(),
      listQuestions(),
      getAllProgress(),
    ]);
    setStatus(s as McpStatus);
    setStats(mcpStats as McpStats);
    setQuestionCount((qs as unknown[]).length);
    setProgressCount((prog as unknown[]).length);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleStart() {
    setLoading(true);
    await startMcp();
    setTimeout(() => {
      loadData();
      setLoading(false);
    }, 1000);
  }

  async function handleStop() {
    setLoading(true);
    await stopMcp();
    setTimeout(() => {
      loadData();
      setLoading(false);
    }, 500);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t("mcp.title")}</h1>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>{t("mcp.nodes")}</CardDescription>
            <CardTitle className="text-2xl">{stats.nodeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("mcp.edges")}</CardDescription>
            <CardTitle className="text-2xl">{stats.edgeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("mcp.questions")}</CardDescription>
            <CardTitle className="text-2xl">{questionCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("mcp.progress")}</CardDescription>
            <CardTitle className="text-2xl">{progressCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t("mcp.server")}</CardTitle>
              <CardDescription>
                {status.status === "running"
                  ? t("mcp.pid", { pid: status.pid ?? 0 })
                  : t("mcp.stopped")}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${status.status === "running" ? "bg-green-500" : "bg-gray-300"}`}
              />
              <span className="text-sm">
                {status.status === "running" ? t("mcp.running") : t("mcp.stopped")}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={handleStart}
              disabled={status.status === "running" || loading}
            >
              {t("mcp.start")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleStop}
              disabled={status.status === "stopped" || loading}
            >
              {t("mcp.stop")}
            </Button>
            <Button variant="outline" onClick={loadData}>
              {t("mcp.refresh")}
            </Button>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">{t("mcp.log")}</p>
            <div className="bg-muted rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
              {status.output.length === 0 ? (
                <p className="text-muted-foreground">{t("mcp.no.log")}</p>
              ) : (
                status.output.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("mcp.config.title")}</CardTitle>
          <CardDescription>
            {t("mcp.config.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">
{`// .claude/settings.json
{
  "mcpServers": {
    "maqiu": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "<project-root-abs-path>"
    }
  }
}`}
          </pre>
          <div className="mt-4 space-y-1 text-sm text-muted-foreground">
            <p>{t("mcp.config.hint1")}</p>
            <p>{t("mcp.config.hint2")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
