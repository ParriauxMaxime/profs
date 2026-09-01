/**
 * CSV roster import.
 *
 * Teachers paste a class list out of a spreadsheet or export one from the
 * school's system. French Excel writes `;`, a paste writes tabs, an export
 * from an English tool writes `,` — so the delimiter is sniffed rather than
 * configured.
 */

export type Delimiter = "," | ";" | "\t";

const DELIMITERS: Delimiter[] = [";", ",", "\t"];

/**
 * Pick the delimiter that splits the sample into the most columns while
 * staying consistent across lines. A comma inside a remark field would win on
 * raw count alone, so consistency is the tie-breaker.
 */
export function sniffDelimiter(text: string): Delimiter {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .slice(0, 10);
  if (lines.length === 0) return ",";

  let best: { delimiter: Delimiter; columns: number } = { delimiter: ",", columns: 1 };

  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => parseLine(line, delimiter).length);
    const consistent = counts.every((c) => c === counts[0]);
    if (!consistent) continue;
    if (counts[0] > best.columns) {
      best = { delimiter, columns: counts[0] };
    }
  }

  return best.delimiter;
}

function parseLine(line: string, delimiter: Delimiter): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  let wasQuoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      wasQuoted = true;
    } else if (char === delimiter) {
      fields.push(wasQuoted ? current : current.trim());
      current = "";
      wasQuoted = false;
    } else {
      current += char;
    }
  }

  fields.push(wasQuoted ? current : current.trim());
  return fields;
}

export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => parseLine(line, delimiter));
}

export interface RosterMapping {
  lastName: number;
  firstName: number;
  skipFirstRow: boolean;
}

export interface RosterRow {
  firstName: string;
  lastName: string;
}

export function extractRoster(rows: string[][], mapping: RosterMapping): RosterRow[] {
  const body = mapping.skipFirstRow ? rows.slice(1) : rows;

  return body
    .map((row) => ({
      lastName: (row[mapping.lastName] ?? "").trim(),
      firstName: (row[mapping.firstName] ?? "").trim(),
    }))
    .filter((row) => row.lastName !== "" || row.firstName !== "");
}

/** Case- and accent-insensitive identity key for duplicate detection. */
function identity(row: RosterRow): string {
  return `${row.lastName} ${row.firstName}`
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Indices in `incoming` that collide with `existing` or with an earlier row of
 * the same batch. Two students can legitimately share a name, so the caller
 * shows these to the teacher instead of merging them.
 */
export function findDuplicates(incoming: RosterRow[], existing: RosterRow[]): number[] {
  const seen = new Set(existing.map(identity));
  const duplicates: number[] = [];

  incoming.forEach((row, index) => {
    const key = identity(row);
    if (seen.has(key)) {
      duplicates.push(index);
    } else {
      seen.add(key);
    }
  });

  return duplicates;
}
