"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAllProgress,
  getDueReviews,
  getRecommendedNext,
} from "@/server/learn";
import { listNodes } from "@/server/knowledge";
import { t } from "@/lib/i18n/zh";

type Progress = {
  id: string;
  nodeId: string;
  status: "not_started" | "learning" | "mastered" | "needs_review";
  score: number;
  reviewCount: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
};

type Node = {
  id: string;
  title: string;
  category: string | null;
};

function getStatusLabel(status: string): string {
  switch (status) {
    case "not_started":
      return t("learn.status.not_started");
    case "learning":
      return t("learn.status.learning");
    case "mastered":
      return t("learn.status.mastered");
    case "needs_review":
      return t("learn.status.needs_review");
    default:
      return status;
  }
}

const statusColors: Record<string, string> = {
  not_started: "bg-gray-200 text-gray-700",
  learning: "bg-blue-100 text-blue-700",
  mastered: "bg-green-100 text-green-700",
  needs_review: "bg-yellow-100 text-yellow-700",
};

export default function LearnPage() {
  const [progress, setProgress] = useState<(Progress & { node?: Node })[]>([]);
  const [dueReviews, setDueReviews] = useState<
    { progress: Progress; node: Node }[]
  >([]);
  const [recommended, setRecommended] = useState<string[]>([]);
  const [nodeMap, setNodeMap] = useState<Map<string, Node>>(new Map());

  useEffect(() => {
    async function load() {
      const [prog, due, rec, nodes] = await Promise.all([
        getAllProgress(),
        getDueReviews(),
        getRecommendedNext(),
        listNodes(),
      ]);

      const map = new Map<string, Node>();
      for (const n of nodes as Node[]) map.set(n.id, n);
      setNodeMap(map);

      const progWithNode = (prog as Progress[]).map((p) => ({
        ...p,
        node: map.get(p.nodeId),
      }));
      setProgress(progWithNode);
      setDueReviews(dueReviews as { progress: Progress; node: Node }[]);
      setRecommended(rec as string[]);
    }
    load();
  }, []);

  const masteredCount = progress.filter((p) => p.status === "mastered").length;
  const learningCount = progress.filter((p) => p.status === "learning").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("learn.title")}</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t("learn.mastered")}</CardDescription>
            <CardTitle className="text-3xl">{masteredCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("learn.learning")}</CardDescription>
            <CardTitle className="text-3xl">{learningCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("learn.due.review")}</CardDescription>
            <CardTitle className="text-3xl">{dueReviews.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {recommended.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("learn.recommended")}</CardTitle>
            <CardDescription>
              {t("learn.recommended.desc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recommended.map((id) => {
                const node = nodeMap.get(id);
                return (
                  <Link
                    key={id}
                    href={`/learn/${id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted"
                  >
                    <span>{node?.title ?? id}</span>
                    <span className="text-xs text-muted-foreground">
                      {node?.category}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {progress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("learn.progress")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {progress.map((p) => (
                <Link
                  key={p.id}
                  href={`/learn/${p.nodeId}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted"
                >
                  <span>{p.node?.title ?? p.nodeId}</span>
                  <Badge
                    variant="outline"
                    className={statusColors[p.status]}
                  >
                    {getStatusLabel(p.status)}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {progress.length === 0 && (
        <p className="text-muted-foreground">
          {t("learn.no.records")}
        </p>
      )}
    </div>
  );
}
