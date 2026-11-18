import * as React from "react";

import type { DocumentBlock, Inline } from "./markdown-lite";

function renderInline(inline: Inline[]): React.ReactNode {
  return inline.map((part, index) =>
    part.bold ? <strong key={index}>{part.text}</strong> : <React.Fragment key={index}>{part.text}</React.Fragment>,
  );
}

// Renders the parsed legal document as h1/p/ul/strong.
export function DocumentBody(props: { blocks: DocumentBlock[] }): React.JSX.Element {
  return (
    <>
      {props.blocks.map((block, index) => {
        if (block.kind === "heading") return <h1 key={index}>{block.text}</h1>;
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
