import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen, GraduationCap, ClipboardCheck } from "lucide-react";
import { t } from "@/lib/i18n/zh";

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
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("dashboard.title")}</h1>
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
