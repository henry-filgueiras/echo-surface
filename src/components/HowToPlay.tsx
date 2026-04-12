const withBase = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const guideSteps = [
  {
    title: "1. Summon a voice",
    image: withBase("guide/seed.png"),
    alt: "Screenshot of Echo Surface showing luminous role-colored phrases suspended over a ritual-like score.",
    text: "The surface infers role from gesture. Long smooth drags feel like pads, long holds become bass, clustered taps read as percussion, zigzags turn into leads, and circles wake echo voices.",
  },
  {
    title: "2. Let the rite unfold",
    image: withBase("guide/trace.png"),
    alt: "Screenshot of Echo Surface with several inferred voices weaving across the same harmonic field.",
    text: "Harmony still moves underneath everything on a shared bar clock, but now each voice has its own density, color, glyph, and motion inside the same enchanted frame.",
  },
  {
    title: "3. Read the living score",
    image: withBase("guide/hold.png"),
    alt: "Screenshot of Echo Surface with playback retracing contours and transient glowing glyphs marking note events.",
    text: "Playback retraces each stored path and throws off transient glyph flashes at note events, so the surface feels like a magical score writing and performing itself in real time.",
  },
];

export function HowToPlay() {
  return (
    <section className="guide-board">
      <div className="guide-board__header">
        <p className="eyebrow">Field Guide / Infographic</p>
        <h2>How to play the instrument</h2>
        <p className="guide-board__lede">
          The surface now behaves like a small ceremonial ensemble. Gestures
          infer orchestration roles, harmony supplies context, and the screen
          responds like an illuminated score rather than a control panel.
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
