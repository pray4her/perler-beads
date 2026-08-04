export const languages = ["zh", "en"] as const;

export type Language = (typeof languages)[number];

export const defaultLanguage: Language = "zh";

export function isLanguage(value: string): value is Language {
  return (languages as readonly string[]).includes(value);
}

/** <html lang> 使用的 BCP-47 标签 */
export function htmlLangTag(lang: Language): string {
  return lang === "zh" ? "zh-CN" : "en";
}
