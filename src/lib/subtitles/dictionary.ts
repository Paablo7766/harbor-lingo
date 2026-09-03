import dictionaryData from "@/data/dictionary-en-es.json";

type Dictionary = Record<string, string>;

const dictionary = dictionaryData as Dictionary;

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, "")
    .trim();
}

export function lookupWord(word: string): string | null {
  const normalized = normalizeWord(word);
  if (!normalized) return null;
  return dictionary[normalized] ?? null;
}
