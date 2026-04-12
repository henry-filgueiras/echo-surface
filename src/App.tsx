import {
  EchoSurface,
  isSurfacePreset,
  type SurfacePreset,
} from "./components/EchoSurface";
import { HowToPlay } from "./components/HowToPlay";

const noteItems = [
  {
    label: "Primary Thesis",
    text: "Gesture shape carries melodic intent, harmonic state provides context, and orchestration emerges from how the gesture is drawn rather than from a picker.",
  },
  {
    label: "Voice Inference",
    text: "Long smooth drags bloom into pads, long holds become bass drones, clustered taps wake percussion, sharp zigzags summon leads, and circles open echo voices.",
  },
  {
    label: "Desired Feeling",
    text: "The surface should read less like software and more like a ritual score: voices flicker into being, glyphs flare at note events, and the whole field feels slightly enchanted.",
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
            A multi-voice ritual instrument for sketching phrases with motion.
            Draw a gesture, let the surface infer its role in the ensemble, and
            watch harmony, color, glyph, and motion turn it into part of a
            living score.
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
