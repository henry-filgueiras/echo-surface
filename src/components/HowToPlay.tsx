const withBase = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const guideSteps = [
  {
    title: "1. Seed the surface",
    image: withBase("guide/seed.png"),
    alt: "Screenshot of Echo Surface showing mirrored ripple blooms after a light tap.",
    text: "Tap anywhere to strike a mirrored bloom. The surface answers immediately, then stores that touch as a future echo.",
  },
  {
    title: "2. Trace a phrase",
    image: withBase("guide/trace.png"),
    alt: "Screenshot of Echo Surface with looping traces crossing the surface like braided ribbons.",
    text: "Drag slowly to write a path into memory. Ghosts replay the motion later, so new gestures can duet with old ones.",
  },
  {
    title: "3. Hold to charge it",
    image: withBase("guide/hold.png"),
    alt: "Screenshot of Echo Surface with a charged central hold and stronger symmetry rings.",
    text: "A still hold thickens symmetry and resonance. The longer you dwell, the more the surface behaves like it has weight and memory.",
  },
];

export function HowToPlay() {
  return (
    <section className="guide-board">
      <div className="guide-board__header">
        <p className="eyebrow">Field Guide / Infographic</p>
        <h2>How to play the instrument</h2>
        <p className="guide-board__lede">
          Three gestures are enough to teach the system. The surface remembers
          what you do and slowly turns that memory into a partner.
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
