import {
  EchoSurface,
  isSurfacePreset,
  type SurfacePreset,
} from "./components/EchoSurface";
import { HowToPlay } from "./components/HowToPlay";

const noteItems = [
  {
    label: "Interaction Thesis",
    text: "A gesture is not a command here. It is a struck pattern that lingers, dims, returns, and interferes with whatever your hands do next.",
  },
  {
    label: "Invariant",
    text: "Every touch leaves a ghost, and every ghost can still be touched. The surface keeps a short haunted memory instead of resetting to neutral.",
  },
  {
    label: "Future Directions",
    text: "Pressure, multi-hand polyphony, tilt, and spatial audio could turn this into a room instrument where topology, rhythm, and memory become the score.",
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
            screen starts to feel less like software and more like a living
            surface haunted by its recent past.
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
