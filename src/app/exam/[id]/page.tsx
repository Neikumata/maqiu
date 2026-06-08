"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getExam, submitAnswer, finishExam } from "@/server/exam";
import { t } from "@/lib/i18n/zh";

type ExamData = {
  exam: {
    id: string;
    title: string;
    totalScore: number | null;
    maxScore: number | null;
  };
  answers: {
    answer: {
      id: string;
      userAnswer: string;
      correct: boolean;
    };
    question: {
      id: string;
      nodeId: string;
      type: "choice" | "fill" | "short_answer";
      content: string;
      options: string[] | null;
      explanation: string | null;
    };
  }[];
};

export default function ExamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.id as string;

  const [examData, setExamData] = useState<ExamData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<{
    totalScore: number;
    wrongCount: number;
  } | null>(null);

  useEffect(() => {
    loadExam();
  }, [examId]);

  async function loadExam() {
    const data = (await getExam(examId)) as ExamData | null;
    if (!data) return;
    setExamData(data);

    if (data.exam.totalScore !== null) {
      setFinished(true);
    }

    const ans: Record<string, string> = {};
    const sub: Record<string, boolean> = {};
    for (const a of data.answers) {
      if (a.answer.userAnswer) {
        ans[a.question.id] = a.answer.userAnswer;
        sub[a.question.id] = true;
      }
    }
    setAnswers(ans);
    setSubmitted(sub);
  }

  async function handleSubmitAnswer(questionId: string) {
    const userAnswer = answers[questionId];
    if (!userAnswer?.trim()) return;
    const isCorrect = await submitAnswer(examId, questionId, userAnswer);
    setSubmitted((prev) => ({ ...prev, [questionId]: true }));
    setExamData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        answers: prev.answers.map((a) =>
          a.question.id === questionId
            ? { ...a, answer: { ...a.answer, correct: isCorrect } }
            : a
        ),
      };
    });
  }

  async function handleFinish() {
    const res = await finishExam(examId);
    setResult(res);
    setFinished(true);
  }

  if (!examData) {
    return <p className="text-muted-foreground">{t("knowledge.detail.loading")}</p>;
  }

  const allAnswered = examData.answers.every(
    (a) => submitted[a.question.id]
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{examData.exam.title}</h1>
        {!finished && (
          <Button
            onClick={handleFinish}
            disabled={!allAnswered}
          >
            {t("exam.detail.submit.exam")}
          </Button>
        )}
      </div>

      {finished && result && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("exam.detail.result", {
                score: result.totalScore,
                max: examData.exam.maxScore ?? 0,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("exam.detail.correct", {
                count: examData.answers.length - result.wrongCount,
                wrong: result.wrongCount,
              })}
              {result.wrongCount > 0 && t("exam.detail.review.hint")}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {examData.answers.map((a, index) => {
          const q = a.question;
          const isSubmitted = submitted[q.id];

          return (
            <Card key={q.id}>
              <CardHeader>
                <CardTitle className="text-sm">
                  {index + 1}. {q.content}
                </CardTitle>
                {q.type === "choice" && q.options && (
                  <div className="space-y-1 mt-2">
                    {q.options.map((opt, i) => (
                      <p key={i} className="text-sm text-muted-foreground">
                        {String.fromCharCode(65 + i)}. {opt}
                      </p>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={answers[q.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.id]: e.target.value,
                      }))
                    }
                    placeholder={
                      q.type === "choice"
                        ? t("exam.detail.choice.placeholder")
                        : q.type === "fill"
                        ? t("exam.detail.fill.placeholder")
                        : t("exam.detail.short_answer.placeholder")
                    }
                    disabled={isSubmitted || finished}
                  />
                  {!isSubmitted && !finished && (
                    <Button
                      size="sm"
                      onClick={() => handleSubmitAnswer(q.id)}
                      disabled={!answers[q.id]?.trim()}
                    >
                      {t("exam.detail.submit")}
                    </Button>
                  )}
                </div>
                {isSubmitted && (
                  <p
                    className={`text-sm ${a.answer.correct ? "text-green-600" : "text-red-600"}`}
                  >
                    {a.answer.correct ? t("exam.detail.correct.answer") : t("exam.detail.wrong.answer")}
                    {q.explanation && ` — ${q.explanation}`}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button variant="ghost" onClick={() => router.push("/exam")}>
        {t("exam.detail.back")}
      </Button>
    </div>
  );
}
