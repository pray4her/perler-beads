"use client";

import { useEffect } from "react";
import { htmlLangTag, type Language } from "@/i18n/types";

/**
 * 根布局的 <html lang> 固定为 zh-CN（静态导出限制），
 * [lang] 段页面挂载后在客户端校正为当前语言。
 */
export default function HtmlLangSync({ lang }: { lang: Language }) {
  useEffect(() => {
    document.documentElement.lang = htmlLangTag(lang);
  }, [lang]);
  return null;
}
