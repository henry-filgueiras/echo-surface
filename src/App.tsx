import {
  EchoSurface,
  isSurfacePreset,
  type SurfacePreset,
} from "./components/EchoSurface";
import { HowToPlay } from "./components/HowToPlay";

const noteItems = [
  {
    label: "Primary Thesis",
    text: "Gesture shape now carries melodic intent, while a shared harmonic state gives every phrase changing context as the bars move underneath it.",
  },
  {
    label: "Musical Logic",
    text: "You draw contour rather than pitch directly: climbs rise, drops fall, flat spans sustain, and sharper turns become leaps inside the active key and chord.",
  },
  {
    label: "Why It Matters",
    text: "The same line can reharmonize beautifully over time, which makes the surface feel less like a one-shot sound toy and more like a tiny composition engine.",
  },
];

function App() {
  const params = new URLSearchParams(window.location.search);
  const captureMode = params.get("mode") === "capture";
  const presetParam = params.get("preset");
  const preset: SurfacePreset | undefined = isSurfacePreset(presetParam)
    ? presetParam
    : undefined;

  if (captureMode) {
    return (
      <main className="app-shell app-shell--capture">
        <EchoSurface captureMode preset={preset} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="director-note">
        <div className="director-note__heading">
          <p className="eyebrow">Museum Prototype / Playable Surface</p>
          <h1>Echo Surface</h1>
          <p className="director-note__lede">
            A contour instrument for sketching melody with motion. Draw a shape,
            let the bar clock cycle through harmony, and the surface retraces
            your line as a phrase that keeps finding new meaning in each chord.
          </p>
        </div>

        <div className="director-note__grid">
          {noteItems.map((item) => (
            <article className="note-card" key={item.label}>
              <p className="note-card__label">{item.label}</p>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <EchoSurface />
      <HowToPlay />
    </main>
  );
}

export default App;
