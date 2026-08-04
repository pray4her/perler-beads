"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLanguage } from "@/i18n/context";
import type { Language } from "@/i18n/types";

function alternatePath(pathname: string, target: Language): string | null {
  if (pathname.startsWith("/pwa-debug")) return null;
  if (target === "en") {
    if (pathname === "/") return "/en/";
    if (pathname.startsWith("/zh/")) return pathname.replace(/^\/zh\//, "/en/");
    return null;
  }
  if (pathname === "/en/") return "/";
  if (pathname.startsWith("/en/")) return pathname.replace(/^\/en\//, "/zh/");
  return null;
}

interface LanguageSwitcherProps {
  className?: string;
}

/** 中英互切链接；保留 query（如专心模式的 project 参数）。无对应路径时不渲染。 */
export default function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  // useSearchParams 在静态导出预渲染时需要 Suspense 边界
  return (
    <Suspense fallback={null}>
      <LanguageSwitcherInner className={className} />
    </Suspense>
  );
}

function LanguageSwitcherInner({ className }: LanguageSwitcherProps) {
  const { lang, t } = useLanguage();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const target: Language = lang === "zh" ? "en" : "zh";
  const targetPath = alternatePath(pathname, target);

  if (!targetPath) return null;

  const search = searchParams.toString();
  const href = search ? `${targetPath}?${search}` : targetPath;

  return (
    <Link
      href={href}
      hrefLang={target === "en" ? "en" : "zh-CN"}
      aria-label={t.common.languageSwitcherLabel}
      className={
        className ??
        "inline-flex items-center rounded-full border border-foreground/15 px-2.5 py-1 text-xs font-medium text-foreground/70 transition-colors hover:text-foreground hover:border-foreground/40"
      }
    >
      {target === "en" ? t.common.switchToEnglish : t.common.switchToChinese}
    </Link>
  );
}
