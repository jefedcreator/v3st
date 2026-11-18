import { FAQ_ITEMS } from "./content";

// Native details/summary, server-rendered so every answer works without
// JavaScript.
export function Faq(): React.JSX.Element {
  return (
    <section id="faq" className="landing-section faq-section">
      <div className="shell faq-inner">
        <h2 className="type-h2">Frequently asked questions.</h2>
        <ul className="faq-list">
          {FAQ_ITEMS.map((item) => (
            <li key={item.question}>
              <details className="faq-item">
                <summary className="faq-question">{item.question}</summary>
                <p className="faq-answer">
                  {item.answer}
                  {item.link ? (
                    <>
                      {" "}
                      See the <a href={item.link.href}>{item.link.text}</a>.
                    </>
                  ) : null}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
