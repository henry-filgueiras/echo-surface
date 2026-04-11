import {
  EchoSurface,
  isSurfacePreset,
  type SurfacePreset,
} from "./components/EchoSurface";
import { HowToPlay } from "./components/HowToPlay";

const noteItems = [
  {
    label: "Interaction Thesis",
    text: "A gesture is not a command here. It is a phrase the surface can remember, recognize, and begin softly improvising back to you.",
  },
  {
    label: "Invariant",
    text: "Every touch leaves a ghost, repeated phrases can harden into rails, and idle time lets the surface dream in the player's own language.",
  },
  {
    label: "Future Directions",
    text: "Pressure, multi-hand polyphony, adaptive harmony, and spatial audio could push this toward a room instrument that gradually develops style.",
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
            A small instrument for tracing, tapping, and holding until the
            screen starts to feel less like software and more like a living,
            collaborative surface with memory, mood, and a gentle urge to
            answer back.
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
