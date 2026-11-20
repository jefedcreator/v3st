import * as React from "react";

import type { DocumentBlock, Inline } from "./markdown-lite";

function renderInline(inline: Inline[]): React.ReactNode {
  return inline.map((part, index) =>
    part.bold ? <strong key={index}>{part.text}</strong> : <React.Fragment key={index}>{part.text}</React.Fragment>,
  );
}

function Heading({ level, children }: { level: 1 | 2 | 3; children: React.ReactNode }) {
  if (level === 1) return <h1>{children}</h1>;
  if (level === 2) return <h2>{children}</h2>;
  return <h3>{children}</h3>;
}

// Renders the parsed legal document at the requested heading level.
export function DocumentBody(props: {
  blocks: DocumentBlock[];
  headingLevel?: 1 | 2 | 3;
}): React.JSX.Element {
  const headingLevel = props.headingLevel ?? 1;
  return (
    <>
      {props.blocks.map((block, index) => {
        if (block.kind === "heading")
          return (
            <Heading key={index} level={headingLevel}>
              {block.text}
            </Heading>
          );
        if (block.kind === "list") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{renderInline(block.inline)}</p>;
      })}
    </>
  );
}
