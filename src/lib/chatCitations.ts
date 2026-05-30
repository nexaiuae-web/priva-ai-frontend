export interface ChatSourceRef {
  filename?: string;
  citation?: string;
  page_label?: string | null;
}

export interface ParsedAssistantMessage {
  answer: string;
  sources: string[];
}

const INLINE_CITATION_RE = /\[(?:Source|قطعة)\s*\d+\]/gi;
const SOURCES_SECTION_RE = /\n##\s*(?:Sources|المصادر)\s*[\s\S]*$/i;
const METADATA_PIPE_RE =
  /\|\s*(?:file:\s*[^\n|]+|page\/section:\s*[^\n|]+|section\s+\d+[^|\n]*|chunk\s+\d+[^|\n]*)\s*/gi;
const PAGE_SECTION_INLINE_RE =
  /(?:page\/section:\s*[^\n]+|section\s+\d+(?:,\s*chunk\s+\d+)?|chunk\s+\d+)/gi;

function normalizeFilename(name: string): string {
  return name.replace(/^["'`]+|["'`]+$/g, "").trim();
}

function extractFilenameFromLine(line: string): string | null {
  const fileMatch = line.match(/file:\s*([^\s|]+)/i);
  if (fileMatch?.[1]) return normalizeFilename(fileMatch[1]);

  const bare = line.match(
    /([^\s|]+\.(?:pdf|jpe?g|png|webp|gif|bmp|tiff?|docx?|txt|md))/i,
  );
  return bare?.[1] ? normalizeFilename(bare[1]) : null;
}

function uniqueFilenames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function parseSourcesSection(section: string): string[] {
  const filenames: string[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.replace(/^[-*•]\s*/, "").trim();
    if (!trimmed) continue;
    const name = extractFilenameFromLine(trimmed);
    if (name) filenames.push(name);
  }
  return filenames;
}

export function stripCitationNoise(text: string): string {
  let cleaned = text.replace(SOURCES_SECTION_RE, "");
  cleaned = cleaned.replace(INLINE_CITATION_RE, "");
  cleaned = cleaned.replace(METADATA_PIPE_RE, " ");
  cleaned = cleaned.replace(PAGE_SECTION_INLINE_RE, "");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

export function parseAssistantMessage(
  raw: string,
  streamSources: ChatSourceRef[] = [],
  streamFilenames: string[] = [],
): ParsedAssistantMessage {
  const text = String(raw || "");
  const sectionMatch = text.match(SOURCES_SECTION_RE);
  const sectionFilenames = sectionMatch
    ? parseSourcesSection(sectionMatch[0])
    : [];

  const fromStream = streamSources
    .map((s) => (s.filename ? normalizeFilename(s.filename) : null))
    .filter((name): name is string => Boolean(name));

  const fromFilenameList = streamFilenames
    .map((name) => normalizeFilename(name))
    .filter(Boolean);

  const answer = stripCitationNoise(
    sectionMatch ? text.replace(SOURCES_SECTION_RE, "") : text,
  );

  return {
    answer: answer.trim(),
    sources: uniqueFilenames([
      ...sectionFilenames,
      ...fromStream,
      ...fromFilenameList,
    ]),
  };
}
