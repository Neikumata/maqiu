"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listQuestions, createQuestion, deleteQuestion } from "@/server/exam";
import { listNodes } from "@/server/knowledge";
import { t, type DictKey } from "@/lib/i18n/zh";

type Question = {
  id: string;
  nodeId: string;
  type: "choice" | "fill" | "short_answer";
  content: string;
  options: string[] | null;
  answer: string;
  explanation: string | null;
  difficulty: number;
};

type Node = {
  id: string;
  title: string;
};

const typeLabels: Record<string, DictKey> = {
  choice: "exam.questions.choice",
  fill: "exam.questions.fill",
  short_answer: "exam.questions.short_answer",
};

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [nodes, setNodes] = useState<Map<string, Node>>(new Map());
  const [showForm, setShowForm] = useState(false);

  const [nodeId, setNodeId] = useState("");
  const [type, setType] = useState<Question["type"]>("choice");
  const [content, setContent] = useState("");
  const [options, setOptions] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [difficulty, setDifficulty] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [qs, ns] = await Promise.all([listQuestions(), listNodes()]);
    setQuestions(qs as Question[]);
    const map = new Map<string, Node>();
    for (const n of ns as Node[]) map.set(n.id, n);
    setNodes(map);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createQuestion({
      nodeId,
      type,
      content,
      options: type === "choice" ? options.split("\n").filter(Boolean) : [],
      answer,
      explanation,
      difficulty,
    });
    setShowForm(false);
    setContent("");
    setOptions("");
    setAnswer("");
    setExplanation("");
    loadData();
  }

  async function handleDelete(id: string) {
    await deleteQuestion(id);
    loadData();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("exam.questions.title")}</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? t("exam.questions.cancel") : t("exam.questions.new")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("exam.questions.new.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("exam.questions.node")} *
                  </label>
                  <select
                    value={nodeId}
                    onChange={(e) => setNodeId(e.target.value)}
                    required
                    className="w-full h-8 rounded-lg border border-input bg-background px-2 text-sm"
                  >
                    <option value="">{t("exam.questions.node.select")}</option>
                    {Array.from(nodes.entries()).map(([id, node]) => (
                      <option key={id} value={id}>
                        {node.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("exam.questions.type")}
                  </label>
                  <select
                    value={type}
                    onChange={(e) =>
                      setType(e.target.value as Question["type"])
                    }
                    className="w-full h-8 rounded-lg border border-input bg-background px-2 text-sm"
                  >
                    <option value="choice">{t("exam.questions.choice")}</option>
                    <option value="fill">{t("exam.questions.fill")}</option>
                    <option value="short_answer">{t("exam.questions.short_answer")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("exam.questions.content")} *
                </label>
                <Input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t("exam.questions.content.placeholder")}
                  required
                />
              </div>
              {type === "choice" && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("exam.questions.options")}
                  </label>
                  <textarea
                    value={options}
                    onChange={(e) => setOptions(e.target.value)}
                    rows={4}
                    placeholder={t("exam.questions.options.placeholder")}
                    className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("exam.questions.answer")} *
                </label>
                <Input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={type === "choice" ? t("exam.questions.answer.choice.placeholder") : t("exam.questions.answer.placeholder")}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("exam.questions.explanation")}
                </label>
                <Input
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder={t("exam.questions.explanation.placeholder")}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("exam.questions.difficulty")}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={difficulty}
                  onChange={(e) => setDifficulty(Number(e.target.value))}
                />
              </div>
              <Button type="submit">{t("exam.questions.create")}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {questions.length === 0 ? (
        <p className="text-muted-foreground">
          {t("exam.questions.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <Card key={q.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{q.content}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(q.id)}
                  >
                    {t("exam.questions.delete")}
                  </Button>
                </div>
                <CardDescription>
                  {t(typeLabels[q.type])} · {t("exam.questions.difficulty")} {q.difficulty} · {t("exam.questions.related")}
                  {nodes.get(q.nodeId)?.title ?? q.nodeId}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
