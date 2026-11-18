export type Inline = { text: string; bold: boolean };

export type DocumentBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "list"; items: Inline[][] };

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > last) out.push({ text: text.slice(last, match.index), bold: false });
    out.push({ text: match[1]!, bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

// Parses the subset the customer documents use: `#` headings, paragraphs,
// `-` lists and **bold** spans. No new dependency.
export function parseDocument(markdown: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({ kind: "heading", text: line.slice(2).trim() });
      i += 1;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: Inline[][] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) {
        items.push(parseInline(lines[i]!.slice(2)));
        i += 1;
      }
      blocks.push({ kind: "list", items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !lines[i]!.startsWith("# ") &&
      !lines[i]!.startsWith("- ")
    ) {
      paragraph.push(lines[i]!);
      i += 1;
    }
    blocks.push({ kind: "paragraph", inline: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}
