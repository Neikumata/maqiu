"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listExams, createExam, listQuestions } from "@/server/exam";
import { listNodes } from "@/server/knowledge";
import { t } from "@/lib/i18n/zh";

type Exam = {
  id: string;
  title: string;
  totalScore: number | null;
  maxScore: number | null;
  createdAt: Date;
};

export default function ExamPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [allQuestions, setAllQuestions] = useState<
    { id: string; content: string; type: string }[]
  >([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [es, qs] = await Promise.all([listExams(), listQuestions()]);
    setExams(es as Exam[]);
    setAllQuestions(
      (qs as { id: string; content: string; type: string }[]).map((q) => ({
        id: q.id,
        content: q.content,
        type: q.type,
      }))
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!examTitle.trim() || selectedQuestions.length === 0) return;
    await createExam({
      title: examTitle.trim(),
      questionIds: selectedQuestions,
    });
    setShowCreate(false);
    setExamTitle("");
    setSelectedQuestions([]);
    loadData();
  }

  function toggleQuestion(id: string) {
    setSelectedQuestions((prev) =>
      prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("exam.title")}</h1>
        <div className="flex gap-2">
          <Link href="/exam/questions">
            <Button variant="outline">{t("exam.question.bank")}</Button>
          </Link>
          <Button onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? t("exam.questions.cancel") : t("exam.create")}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("exam.create.title")}</CardTitle>
            <CardDescription>{t("exam.create.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("exam.create.label")} *
                </label>
                <Input
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  placeholder={t("exam.create.placeholder")}
                  required
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-2">
                  {t("exam.create.select", { count: selectedQuestions.length })}
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {allQuestions.map((q) => (
                    <label
                      key={q.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedQuestions.includes(q.id)}
                        onChange={() => toggleQuestion(q.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{q.content}</span>
                    </label>
                  ))}
                  {allQuestions.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("exam.create.empty.bank")}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="submit"
                disabled={!examTitle.trim() || selectedQuestions.length === 0}
              >
                {t("exam.create.submit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {exams.length === 0 ? (
        <p className="text-muted-foreground">{t("exam.no.records")}</p>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <Link key={exam.id} href={`/exam/${exam.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-base">{exam.title}</CardTitle>
                  <CardDescription>
                    {new Date(exam.createdAt).toLocaleDateString("zh-CN")}
                    {exam.totalScore !== null &&
                      ` · ${t("exam.score")}${exam.totalScore}/${exam.maxScore ?? 0}`}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
