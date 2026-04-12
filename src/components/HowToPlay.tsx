const withBase = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const guideSteps = [
  {
    title: "1. Draw a contour",
    image: withBase("guide/seed.png"),
    alt: "Screenshot of Echo Surface showing a single luminous contour phrase crossing the surface.",
    text: "Move left to right and think in shape, not exact notes. Upward arcs will climb, downward arcs will fall, and flatter spans will hold.",
  },
  {
    title: "2. Let harmony move",
    image: withBase("guide/trace.png"),
    alt: "Screenshot of Echo Surface with multiple contour phrases looping under a shared harmonic HUD.",
    text: "A shared bar clock advances the chord progression automatically, so the same line can feel grounded, suspended, or urgent as context changes.",
  },
  {
    title: "3. Watch it retrace",
    image: withBase("guide/hold.png"),
    alt: "Screenshot of Echo Surface with playback retracing a contour and bright note glyphs glowing along the line.",
    text: "Playback travels back across your contour with luminous note glyphs, turning each saved trace into a small melodic loop rather than a raw touch echo.",
  },
];

export function HowToPlay() {
  return (
    <section className="guide-board">
      <div className="guide-board__header">
        <p className="eyebrow">Field Guide / Infographic</p>
        <h2>How to play the instrument</h2>
        <p className="guide-board__lede">
          The surface now behaves like a composition toy: your hand draws a
          melodic contour, the harmony keeps moving, and every stored line comes
          back as a phrase with clearer musical intent.
        </p>
      </div>

      <div className="guide-board__grid">
        {guideSteps.map((step) => (
          <article className="guide-card" key={step.title}>
            <div className="guide-card__image-frame">
              <img alt={step.alt} className="guide-card__image" src={step.image} />
            </div>
            <div className="guide-card__body">
              <p className="guide-card__title">{step.title}</p>
              <p>{step.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
