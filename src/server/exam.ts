"use server";

import { db } from "@/lib/db";
import {
  questions,
  examResults,
  examAnswers,
  knowledgeNodes,
  learningProgress,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

// ============ 题库管理 ============

export async function createQuestion(data: {
  nodeId: string;
  type: "choice" | "fill" | "short_answer";
  content: string;
  options?: string[];
  answer: string;
  explanation?: string;
  difficulty?: number;
}) {
  const id = randomUUID();
  await db.insert(questions).values({
    id,
    nodeId: data.nodeId,
    type: data.type,
    content: data.content,
    options: data.options ?? [],
    answer: data.answer,
    explanation: data.explanation ?? "",
    difficulty: data.difficulty ?? 1,
    createdAt: new Date(),
  });
  return id;
}

export async function updateQuestion(
  id: string,
  data: {
    content?: string;
    options?: string[];
    answer?: string;
    explanation?: string;
    difficulty?: number;
  }
) {
  await db.update(questions).set(data).where(eq(questions.id, id));
}

export async function deleteQuestion(id: string) {
  await db.delete(questions).where(eq(questions.id, id));
}

export async function getQuestion(id: string) {
  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.id, id));
  return rows[0] ?? null;
}

export async function listQuestions(nodeId?: string) {
  if (nodeId) {
    return db.select().from(questions).where(eq(questions.nodeId, nodeId));
  }
  return db.select().from(questions);
}

// ============ 考试 ============

export async function createExam(data: {
  title: string;
  questionIds: string[];
}) {
  const examId = randomUUID();
  const maxScore = data.questionIds.length * 10;

  await db.insert(examResults).values({
    id: examId,
    title: data.title,
    totalScore: 0,
    maxScore,
    createdAt: new Date(),
  });

  // 预创建每道题的空答案记录
  for (const qId of data.questionIds) {
    await db.insert(examAnswers).values({
      id: randomUUID(),
      examId,
      questionId: qId,
      userAnswer: "",
      correct: false,
    });
  }

  return examId;
}

export async function getExam(examId: string) {
  const exams = await db
    .select()
    .from(examResults)
    .where(eq(examResults.id, examId));
  const exam = exams[0];
  if (!exam) return null;

  const answers = await db
    .select({
      answer: examAnswers,
      question: questions,
    })
    .from(examAnswers)
    .innerJoin(questions, eq(examAnswers.questionId, questions.id))
    .where(eq(examAnswers.examId, examId));

  return { exam, answers };
}

export async function submitAnswer(
  examId: string,
  questionId: string,
  userAnswer: string
) {
  // 获取正确答案
  const q = await getQuestion(questionId);
  if (!q) throw new Error("题目不存在");

  const isCorrect =
    userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();

  await db
    .update(examAnswers)
    .set({ userAnswer, correct: isCorrect })
    .where(
      and(
        eq(examAnswers.examId, examId),
        eq(examAnswers.questionId, questionId)
      )
    );

  return isCorrect;
}

export async function finishExam(examId: string) {
  const { answers } = (await getExam(examId))!;
  const totalScore = answers.filter((a) => a.answer.correct).length * 10;

  await db
    .update(examResults)
    .set({ totalScore })
    .where(eq(examResults.id, examId));

  // 错题反哺：标记对应知识节点为 needs_review
  const wrongNodeIds = new Set<string>();
  for (const a of answers) {
    if (!a.answer.correct) {
      wrongNodeIds.add(a.question.nodeId);
    }
  }

  for (const nodeId of wrongNodeIds) {
    const existing = await db
      .select()
      .from(learningProgress)
      .where(eq(learningProgress.nodeId, nodeId));

    if (existing.length > 0) {
      await db
        .update(learningProgress)
        .set({ status: "needs_review" })
        .where(eq(learningProgress.nodeId, nodeId));
    } else {
      await db.insert(learningProgress).values({
        id: randomUUID(),
        nodeId,
        status: "needs_review",
        createdAt: new Date(),
      });
    }
  }

  return { totalScore, wrongCount: answers.filter((a) => !a.answer.correct).length };
}

export async function listExams() {
  return db.select().from(examResults);
}
