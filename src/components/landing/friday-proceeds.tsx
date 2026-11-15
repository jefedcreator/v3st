import { ArrowUpRight, CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/primitives";
export function FridayProceeds() {
  return (
    <section
      id="friday"
      className="section shell friday-section"
      aria-labelledby="friday-title"
    >
      <div className="friday-calendar">
        <CalendarBlank aria-hidden="true" />
        <strong>Friday</strong>
        <span>08:00–23:00</span>
        <small>Africa/Lagos processing window</small>
      </div>
      <div className="story-copy">
        <h2 id="friday-title" className="section-title">
          Proceeds, with
          <br />
          the context intact.
        </h2>
        <p className="section-copy">
          Eligible income needs a source receipt, confirmation and any required
          conversion before it can be paid out or reinvested.
        </p>
        <p className="friday-schedule">
          Friday processing: 08:00–23:00 Africa/Lagos
        </p>
        <p className="story-disclosure">
          The example gross minimum is ₦2,000, checked before fees. Below it,
          proceeds roll over without a payout fee. This is a processing window,
          not a promise of arrival or income every Friday. Strategy income can
          be zero.
        </p>
        <Button asChild variant="outline">
          <a href="#demo">
            Compare payout and reinvestment <ArrowUpRight aria-hidden="true" />
          </a>
        </Button>
      </div>
    </section>
  );
}
