"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getNode,
  updateNode,
  deleteNode,
  getNodeEdges,
  createEdge,
  deleteEdge,
} from "@/server/knowledge";
import { t } from "@/lib/i18n/zh";

type Edge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: "prerequisite" | "related" | "builds_upon";
};

type Node = {
  id: string;
  title: string;
  content: string | null;
  category: string | null;
  tags: string[] | null;
  createdAt: Date;
  updatedAt: Date;
};

const edgeTypeLabels: Record<string, string> = {
  prerequisite: t("knowledge.detail.prerequisite"),
  related: t("knowledge.detail.related"),
  builds_upon: t("knowledge.detail.advanced"),
};

export default function KnowledgeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [node, setNode] = useState<Node | null>(null);
  const [edges, setEdges] = useState<{ outgoing: Edge[]; incoming: Edge[] }>({
    outgoing: [],
    incoming: [],
  });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [newEdgeTarget, setNewEdgeTarget] = useState("");
  const [newEdgeType, setNewEdgeType] = useState<Edge["type"]>("related");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    const [n, e] = await Promise.all([getNode(id), getNodeEdges(id)]);
    if (n) {
      setNode(n as Node);
      setTitle(n.title);
      setContent(n.content ?? "");
      setCategory(n.category ?? "");
      setTags((n.tags ?? []).join(", "));
    }
    setEdges(e as { outgoing: Edge[]; incoming: Edge[] });
  }

  async function handleSave() {
    setSaving(true);
    await updateNode(id, {
      title,
      content,
      category,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    setEditing(false);
    setSaving(false);
    loadData();
  }

  async function handleDelete() {
    await deleteNode(id);
    router.push("/knowledge");
  }

  async function handleAddEdge(e: React.FormEvent) {
    e.preventDefault();
    if (!newEdgeTarget.trim()) return;
    await createEdge({
      sourceId: id,
      targetId: newEdgeTarget.trim(),
      type: newEdgeType,
    });
    setNewEdgeTarget("");
    loadData();
  }

  async function handleDeleteEdge(edgeId: string) {
    await deleteEdge(edgeId);
    loadData();
  }

  if (!node) {
    return <p className="text-muted-foreground">{t("knowledge.detail.loading")}</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {editing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t("knowledge.detail.title.label")}</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("knowledge.detail.category.label")}</label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("knowledge.detail.tags.label")}</label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t("knowledge.detail.tags.placeholder")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("knowledge.detail.content.label")}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("knowledge.detail.saving") : t("knowledge.detail.save")}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t("knowledge.detail.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{node.title}</h1>
              <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
                {node.category && <span>{node.category}</span>}
                <span>
                  {t("knowledge.detail.updated.at")}{" "}
                  {new Date(node.updatedAt).toLocaleDateString("zh-CN")}
                </span>
              </div>
              {node.tags && node.tags.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {node.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-secondary rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                {t("knowledge.detail.edit")}
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                {t("knowledge.detail.delete")}
              </Button>
            </div>
          </div>

          {node.content && (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {node.content}
              </ReactMarkdown>
            </div>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("knowledge.detail.relations")}</CardTitle>
          <CardDescription>
            {t("knowledge.detail.relations.desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {edges.incoming.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">{t("knowledge.detail.prerequisite")}</p>
              <div className="space-y-1">
                {edges.incoming.map((edge) => (
                  <div
                    key={edge.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <a
                      href={`/knowledge/${edge.sourceId}`}
                      className="text-primary hover:underline"
                    >
                      {edge.sourceId}
                    </a>
                    <span className="text-muted-foreground">
                      {edgeTypeLabels[edge.type]}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteEdge(edge.id)}
                    >
                      {t("knowledge.detail.delete")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {edges.outgoing.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">{t("knowledge.detail.next")}</p>
              <div className="space-y-1">
                {edges.outgoing.map((edge) => (
                  <div
                    key={edge.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <a
                      href={`/knowledge/${edge.targetId}`}
                      className="text-primary hover:underline"
                    >
                      {edge.targetId}
                    </a>
                    <span className="text-muted-foreground">
                      {edgeTypeLabels[edge.type]}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteEdge(edge.id)}
                    >
                      {t("knowledge.detail.delete")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleAddEdge} className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-muted-foreground mb-1">
                {t("knowledge.detail.target.id")}
              </label>
              <Input
                value={newEdgeTarget}
                onChange={(e) => setNewEdgeTarget(e.target.value)}
                placeholder={t("knowledge.detail.paste.id")}
              />
            </div>
            <select
              value={newEdgeType}
              onChange={(e) =>
                setNewEdgeType(e.target.value as Edge["type"])
              }
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
            >
              <option value="related">{t("knowledge.detail.related")}</option>
              <option value="prerequisite">{t("knowledge.detail.prerequisite")}</option>
              <option value="builds_upon">{t("knowledge.detail.advanced")}</option>
            </select>
            <Button type="submit" size="sm">
              {t("knowledge.detail.add.relation")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
