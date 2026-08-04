import { zh, type Dictionary } from "./dictionaries/zh";
import { en } from "./dictionaries/en";
import type { Language } from "./types";

export function getDictionary(lang: Language): Dictionary {
  return lang === "en" ? en : zh;
}
