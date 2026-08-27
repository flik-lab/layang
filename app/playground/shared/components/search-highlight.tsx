import { Fragment, type ReactNode } from "react";

/** Highlights case-insensitive search matches without changing the source text. */
export function SearchHighlightedText({ text, query }: { text: string; query: string }): ReactNode {
  const needle = query.trim();
  if (!needle) return text;

  const regex = new RegExp(escapeRegExp(needle), "ig");
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(regex)) {
    const matchText = match[0];
    const start = match.index ?? cursor;
    const end = start + matchText.length;

    if (start > cursor) nodes.push(<Fragment key={`text-${cursor}-${start}`}>{text.slice(cursor, start)}</Fragment>);
    nodes.push(
      <mark className="search-highlight" key={`match-${start}-${end}-${matchText}`}>
        {matchText}
      </mark>,
    );
    cursor = end;
  }

  if (cursor === 0) return text;
  if (cursor < text.length) nodes.push(<Fragment key={`text-${cursor}-${text.length}`}>{text.slice(cursor)}</Fragment>);
  return nodes;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
