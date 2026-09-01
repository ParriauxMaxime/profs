/** Accent- and case-insensitive substring search, for list filters. */
function fold(value: string): string {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function fuzzyMatchAny(values: (string | undefined)[], query: string): boolean {
  if (query.trim() === "") return true;
  const needle = fold(query);
  return values.some((value) => value !== undefined && fold(value).includes(needle));
}
