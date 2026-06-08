"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNode } from "@/server/knowledge";
import {
  getProgress,
  initProgress,
  updateProgress,
} from "@/server/learn";
import { t } from "@/lib/i18n/zh";

type Node = {
  id: string;
  title: string;
  content: string | null;
  category: string | null;
  tags: string[] | null;
};

type Progress = {
  status: "not_started" | "learning" | "mastered" | "needs_review";
  score: number;
  reviewCount: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
} | null;

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

export default function LearnDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [node, setNode] = useState<Node | null>(null);
  const [progress, setProgress] = useState<Progress>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function load() {
      const n = await getNode(id);
      if (n) setNode(n as Node);

      let p = await getProgress(id);
      if (!p) p = await initProgress(id);
      setProgress(p as Progress);
    }
    load();
  }, [id]);

  async function handleUpdateStatus(
    status: "learning" | "mastered" | "needs_review",
    score?: number
  ) {
    setUpdating(true);
    const updated = await updateProgress(id, { status, score });
    setProgress(updated as Progress);
    setUpdating(false);
  }

  if (!node) {
    return <p className="text-muted-foreground">{t("learn.detail.loading")}</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{node.title}</h1>
          {node.category && (
            <p className="text-sm text-muted-foreground mt-1">
              {node.category}
            </p>
          )}
        </div>
        {progress && (
          <Badge
            variant="outline"
            className={statusColors[progress.status]}
          >
            {getStatusLabel(progress.status)}
          </Badge>
        )}
      </div>

      {node.content && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {node.content}
          </ReactMarkdown>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("learn.detail.actions")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            onClick={() => handleUpdateStatus("learning")}
            disabled={updating}
            variant="outline"
          >
            {t("learn.detail.mark.learning")}
          </Button>
          <Button
            onClick={() => handleUpdateStatus("mastered", 100)}
            disabled={updating}
          >
            {t("learn.detail.mark.mastered")}
          </Button>
          <Button
            onClick={() => handleUpdateStatus("needs_review")}
            disabled={updating}
            variant="outline"
          >
            {t("learn.detail.mark.review")}
          </Button>
        </CardContent>
      </Card>

      {progress && progress.nextReviewAt && (
        <p className="text-sm text-muted-foreground">
          {t("learn.detail.next.review")}
          {new Date(progress.nextReviewAt).toLocaleDateString("zh-CN")}
        </p>
      )}

      <Button variant="ghost" onClick={() => router.push("/learn")}>
        {t("learn.detail.back")}
      </Button>
    </div>
  );
}
