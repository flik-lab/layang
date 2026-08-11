"use client";

import type { ReactNode } from "react";

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "list"; ordered: boolean; items: Array<{ text: string; checked?: boolean }> }
  | { type: "image"; alt: string; src: string; title?: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "blockquote"; text: string }
  | { type: "hr" };

type MarkdownSection = {
  title: string | null;
  blocks: MarkdownBlock[];
};

const collapsibleSections = new Set(["Code Examples", "Technical Reference"]);

/** Renders Layang's generated Markdown using the same reader-facing structure as the published site. */
export function MarkdownPreview({ markdown }: { markdown: string }) {
  const sections = groupMarkdownSections(parseMarkdownBlocks(markdown));
  return (
    <div className="api-doc-preview">
      {sections.map((section) => {
        const content = section.blocks.map((block, blockIndex) =>
          renderMarkdownBlock(block, `${section.title ?? "preamble"}-${blockIndex}`),
        );
        if (!section.title) return <div key="preamble">{content}</div>;
        if (collapsibleSections.has(section.title)) {
          return (
            <details
              id={headingId(section.title)}
              key={`section-${section.title}`}
              className="api-doc-preview__section"
            >
              <summary className="api-doc-preview__section-summary">{section.title}</summary>
              <div className="api-doc-preview__section-content">{content}</div>
            </details>
          );
        }
        return (
          <section
            id={headingId(section.title)}
            key={`section-${section.title}`}
            className="api-doc-preview__plain-section"
          >
            <h2 className="api-doc-preview__heading api-doc-preview__heading--2">{section.title}</h2>
            {content}
          </section>
        );
      })}
    </div>
  );
}

function renderMarkdownBlock(block: MarkdownBlock, key: string): ReactNode {
  if (block.type === "hr") return <hr key={key} className="api-doc-preview__hr" />;
  if (block.type === "heading") {
    const level = Math.min(6, Math.max(1, block.level));
    const Heading = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return (
      <Heading key={key} className={`api-doc-preview__heading api-doc-preview__heading--${level}`}>
        {renderInlineMarkdown(block.text)}
      </Heading>
    );
  }
  if (block.type === "code") {
    return (
      <pre key={key} className={`code-viewer code-viewer--${block.lang || "text"}`}>
        <code>{block.text}</code>
      </pre>
    );
  }
  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List key={key} className="api-doc-preview__list">
        {block.items.map((item) => {
          const itemKey = `${key}-item-${item.checked !== undefined ? `${item.checked ? "checked" : "unchecked"}-` : ""}${item.text}`;
          return (
            <li key={itemKey}>
              {item.checked !== undefined ? (
                <input type="checkbox" checked={item.checked} readOnly aria-label={item.text} />
              ) : null}
              {item.checked !== undefined ? " " : null}
              {renderInlineMarkdown(item.text)}
            </li>
          );
        })}
      </List>
    );
  }
  if (block.type === "image") {
    return (
      <img
        key={key}
        className="api-doc-preview__image"
        src={block.src}
        alt={block.alt}
        title={block.title}
        loading="lazy"
      />
    );
  }
  if (block.type === "table") {
    return (
      <div key={key} className="api-doc-preview__table-wrap">
        <table className="api-doc-preview__table">
          <thead>
            <tr>
              {block.headers.map((header) => (
                <th key={header}>{renderInlineMarkdown(header)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => {
              const rowKey = row.join("|");
              return (
                <tr key={rowKey}>
                  {block.headers.map((header, columnIndex) => (
                    <td key={header}>{renderInlineMarkdown(row[columnIndex] ?? "")}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "blockquote") {
    return (
      <aside key={key} className="api-doc-preview__callout">
        {renderInlineMarkdown(block.text)}
      </aside>
    );
  }
  return (
    <p key={key} className="api-doc-preview__paragraph">
      {renderInlineMarkdown(block.text)}
    </p>
  );
}

function groupMarkdownSections(blocks: MarkdownBlock[]): MarkdownSection[] {
  const sections: MarkdownSection[] = [{ title: null, blocks: [] }];
  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) {
      sections.push({ title: block.text, blocks: [] });
      continue;
    }
    sections.at(-1)?.blocks.push(block);
  }
  return sections.filter((section) => section.title || section.blocks.length);
}

/** Parses the Markdown subset generated by the unified documentation pipeline. */
function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = stripGeneratedMetadata(markdown).replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: Array<{ text: string; checked?: boolean }> = [];
  let listOrdered = false;
  let quote: string[] = [];
  let code: string[] | null = null;
  let codeLang = "";

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: "list", ordered: listOrdered, items: list });
    list = [];
    listOrdered = false;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push({ type: "blockquote", text: quote.join(" ").trim() });
    quote = [];
  };
  const flushTextBlocks = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^```([\w-]+)?\s*$/);
    if (fence) {
      if (code) {
        blocks.push({ type: "code", lang: codeLang, text: code.join("\n") });
        code = null;
        codeLang = "";
      } else {
        flushTextBlocks();
        code = [];
        codeLang = fence[1] ?? "";
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushTextBlocks();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushTextBlocks();
      blocks.push({ type: "hr" });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushTextBlocks();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    if (isTableHeader(lines, index)) {
      flushTextBlocks();
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    const bullet = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushQuote();
      const ordered = /\d+\./.test(bullet[1]);
      if (list.length && ordered !== listOrdered) flushList();
      listOrdered = ordered;
      const task = bullet[2].match(/^\[([ xX])\]\s+(.+)$/);
      list.push(task ? { text: task[2], checked: task[1].toLowerCase() === "x" } : { text: bullet[2] });
      continue;
    }
    const image = line.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+["']([^"']*)["'])?\)$/);
    if (image) {
      flushTextBlocks();
      blocks.push({ type: "image", alt: image[1], src: safeMarkdownHref(image[2]), title: image[3] });
      continue;
    }
    const blockquote = line.match(/^>\s?(.*)$/);
    if (blockquote) {
      flushParagraph();
      flushList();
      quote.push(blockquote[1]);
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }
  if (code) blocks.push({ type: "code", lang: codeLang, text: code.join("\n") });
  flushTextBlocks();
  return blocks;
}

function stripGeneratedMetadata(markdown: string): string {
  let value = String(markdown ?? "")
    .replace(/^\uFEFF/, "")
    .trimStart();
  value = value.replace(/^<!--[\s\S]*?-->\s*/, "");
  value = value.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
  return value;
}

function isTableHeader(lines: string[], index: number): boolean {
  return isTableRow(lines[index]) && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "");
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}

function headingId(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/** Renders safe inline code, emphasis, and links without injecting HTML. */
function renderInlineMarkdown(text = ""): ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  const tokenCount = new Map<string, number>();
  return tokens.map((token) => {
    const count = tokenCount.get(token) ?? 0;
    tokenCount.set(token, count + 1);
    const tokenKey = `${token}-${count}`;
    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code key={`inline-code-${tokenKey}`} className="inline-code">
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={`inline-strong-${tokenKey}`}>{token.slice(2, -2)}</strong>;
    }
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeMarkdownHref(link[2]);
      return (
        <a
          key={`inline-link-${tokenKey}`}
          href={href}
          className="api-doc-preview__link"
          target={/^https?:/i.test(href) ? "_blank" : undefined}
          rel={/^https?:/i.test(href) ? "noreferrer" : undefined}
        >
          {link[1]}
        </a>
      );
    }
    return token;
  });
}

function safeMarkdownHref(value: string): string {
  const href = value.trim();
  return /^(https?:|mailto:|layang:|#|\.\.?\/)/i.test(href) ? href : "#";
}
