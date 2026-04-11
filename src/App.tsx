import {
  EchoSurface,
  isSurfacePreset,
  type SurfacePreset,
} from "./components/EchoSurface";
import { HowToPlay } from "./components/HowToPlay";

const noteItems = [
  {
    label: "Interaction Thesis",
    text: "A gesture is not a command here. It is a struck pattern that the surface remembers, rotates, and answers back later as a living echo.",
  },
  {
    label: "Invariant",
    text: "Every touch leaves a ghost. Taps seed ripples, traces braid paths, and holds thicken the response until memory starts performing with you.",
  },
  {
    label: "Future Directions",
    text: "Pressure, tilt, multi-user interference, and spatial audio could push this toward a room-scale instrument where topology itself becomes composition.",
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
            screen starts to feel less like software and more like responsive
            material.
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
