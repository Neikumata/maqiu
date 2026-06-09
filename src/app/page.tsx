"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen, GraduationCap, ClipboardCheck } from "lucide-react";
import { t } from "@/lib/i18n/zh";
import { getMcpStats } from "@/server/mcp-manage";
import { listQuestions } from "@/server/exam";
import { getAllProgress } from "@/server/learn";

const modules = [
  {
    title: t("nav.knowledge"),
    description: t("knowledge.card.desc"),
    href: "/knowledge",
    icon: BookOpen,
  },
  {
    title: t("nav.learn"),
    description: t("learn.card.desc"),
    href: "/learn",
    icon: GraduationCap,
  },
  {
    title: t("nav.exam"),
    description: t("exam.card.desc"),
    href: "/exam",
    icon: ClipboardCheck,
  },
];

export default function Home() {
  const [stats, setStats] = useState({
    nodeCount: 0,
    edgeCount: 0,
    questionCount: 0,
    progressCount: 0,
  });

  const loadStats = useCallback(async () => {
    const [mcpStats, qs, prog] = await Promise.all([
      getMcpStats(),
      listQuestions(),
      getAllProgress(),
    ]);
    setStats({
      nodeCount: (mcpStats as { nodeCount: number }).nodeCount,
      edgeCount: (mcpStats as { edgeCount: number }).edgeCount,
      questionCount: (qs as unknown[]).length,
      progressCount: (prog as unknown[]).length,
    });
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const statCards = [
    { label: t("dashboard.nodes"), value: stats.nodeCount },
    { label: t("dashboard.edges"), value: stats.edgeCount },
    { label: t("dashboard.questions"), value: stats.questionCount },
    { label: t("dashboard.progress"), value: stats.progressCount },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("dashboard.title")}</h1>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {modules.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <m.icon className="size-5" />
                  <CardTitle>{m.title}</CardTitle>
                </div>
                <CardDescription>{m.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
