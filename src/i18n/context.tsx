"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getDictionary } from "./getDictionary";
import { zh, type Dictionary } from "./dictionaries/zh";
import { defaultLanguage, type Language } from "./types";

interface LanguageContextValue {
  lang: Language;
  t: Dictionary;
}

// 默认值即中文，未包 Provider 的组件树也能正常渲染
const LanguageContext = createContext<LanguageContextValue>({
  lang: defaultLanguage,
  t: zh,
});

interface LanguageProviderProps {
  lang: Language;
  children: ReactNode;
}

/**
 * 字典在客户端按 lang 直接加载（字典含函数型文案，无法作为 RSC prop 序列化传递；
 * 字典为纯文本与函数，体积可控）。
 */
export function LanguageProvider({ lang, children }: LanguageProviderProps) {
  const value = useMemo(() => ({ lang, t: getDictionary(lang) }), [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

export function useT(): Dictionary {
  return useContext(LanguageContext).t;
}
