"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listNodes } from "@/server/knowledge";
import { t } from "@/lib/i18n/zh";

type Node = {
  id: string;
  title: string;
  category: string | null;
  createdAt: Date;
};

export default function KnowledgePage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    listNodes(search || undefined).then(setNodes);
  }, [search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("knowledge.title")}</h1>
        <div className="flex gap-2">
          <Link
            href="/knowledge/graph"
            className={buttonVariants({ variant: "outline" })}
          >
            {t("knowledge.graph.view")}
          </Link>
          <Link href="/knowledge/new" className={buttonVariants()}>
            {t("knowledge.new")}
          </Link>
        </div>
      </div>

      <Input
        placeholder={t("knowledge.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-md"
      />

      {nodes.length === 0 ? (
        <p className="text-muted-foreground">
          {search ? t("knowledge.no.match") : t("knowledge.empty")}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {nodes.map((node) => (
            <Link key={node.id} href={`/knowledge/${node.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-base">{node.title}</CardTitle>
                  {node.category && (
                    <CardDescription>{node.category}</CardDescription>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
