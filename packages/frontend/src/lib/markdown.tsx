import { Fragment, type ReactNode } from "react";

/**
 * Tiny, dependency-free Markdown renderer. Supports the subset the agent
 * actually emits: headings, bold/italic, inline code, fenced code blocks,
 * unordered/ordered lists, blockquotes, links and bare URLs. Never renders
 * raw HTML, so it is safe to feed model output directly.
 */
export function Markdown({ text }: { text: string }) {
  return <div className="space-y-3 text-sm leading-relaxed">{renderBlocks(text)}</div>;
}

function renderBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre
          key={key++}
          className="font-data overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 text-xs leading-relaxed"
        >
          <code>{body.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      const cls =
        level <= 2
          ? "mt-1 text-[0.95rem] font-semibold"
          : "mt-1 text-sm font-semibold text-muted-foreground";
      blocks.push(
        <p key={key++} className={cls}>
          {content}
        </p>
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={key++} className="border-l-2 pl-3 text-muted-foreground italic">
          {renderInline(body.join(" "))}
        </blockquote>
      );
      continue;
    }

    // Lists (unordered or ordered)
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        items.push(
          <li key={items.length} className="pl-1">
            {renderInline(m[3])}
          </li>
        );
        i++;
      }
      blocks.push(
        ordered ? (
          <ol key={key++} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={key++} className="list-disc space-y-1 pl-5">
            {items}
          </ul>
        )
      );
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,6}\s|>\s?|```|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={key++} className="whitespace-pre-wrap">
        {renderInline(para.join("\n"))}
      </p>
    );
  }

  return blocks;
}

const INLINE_RE =
  /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+)/g;

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  INLINE_RE.lastIndex = 0;

  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>);
    const token = match[0];

    if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          key={key++}
          className="font-data rounded bg-muted px-1 py-0.5 text-[0.85em] text-foreground/90"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[")) {
      const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      parts.push(
        <a
          key={key++}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          {m[1]}
        </a>
      );
    } else if (token.startsWith("http")) {
      parts.push(
        <a
          key={key++}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 break-all"
        >
          {token}
        </a>
      );
    } else {
      // single * or _ emphasis
      parts.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return parts;
}
