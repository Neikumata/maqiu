"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createNode } from "@/server/knowledge";
import { t } from "@/lib/i18n/zh";

export default function NewKnowledgePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const id = await createNode({
      title: title.trim(),
      content,
      category: category.trim(),
      tags: tags
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    });
    router.push(`/knowledge/${id}`);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">{t("knowledge.new.title")}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t("knowledge.new.title.label")} *</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("knowledge.new.title.placeholder")}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t("knowledge.new.category")}</label>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={t("knowledge.new.category.placeholder")}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t("knowledge.new.tags")}</label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t("knowledge.new.tags.placeholder")}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t("knowledge.new.content")}</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("knowledge.new.content.placeholder")}
            rows={12}
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("knowledge.new.saving") : t("knowledge.new.create")}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("knowledge.new.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
