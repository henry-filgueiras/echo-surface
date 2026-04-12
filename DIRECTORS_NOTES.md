# EchoSurface Director's Notes

As of April 12, 2026.

This file is a compact handoff artifact for future sessions. The goal is to preserve intent, not just features.

## Core Thesis

EchoSurface began as an expressive touch surface, but the more interesting identity emerged once we treated it as a composition toy and ritual instrument.

Current north star:

`gesture shape expresses melodic intent, while harmonic state provides context`

And the visual thesis sitting beside it:

`the screen should feel like an instrument, not a control panel`

That means:

- gestures should author music more than knobs do
- harmony should quietly reshape meaning under the same contour
- playback should look alive, luminous, and slightly ceremonial
- UI chrome should stay light enough that the canvas remains the protagonist

## Where We Have Been

### Phase 1: From Touch Surface To Harmonic Toy

We introduced a global harmonic engine with tonic, mode, progression, bar count, bars-per-chord, and BPM. The surface stopped behaving like raw pitch painting and started behaving like musical material being interpreted inside a harmonic frame.

Important change in mindset:

- not "finger Y position equals frequency"
- instead "drawn contour implies relative melodic movement"

That was the first big shift toward musical coherence.

### Phase 2: Contour As Melody

Contours now get interpreted as:

- upward motion = rise
- downward motion = fall
- flatter motion = sustain
- sharper vertical moves = leaps

Those movements are then quantized into the active scale, with stable landings biased toward chord tones. This means a single phrase shape can survive harmonic motion and reharmonize gracefully instead of sounding like a literal replay.

### Phase 3: Retrace And Luminous Playback

Playback moved from abstract triggering into visible retrace. The drawn path is now replayed as a glowing contour, with note glyphs appearing along the line. This made the instrument legible. Users can see not only that something is playing, but how the gesture became phrase.

This was important because the surface needed to feel authored, not generative in a detached way.

### Phase 4: Orchestration Roles Instead Of Instrument Menus

We replaced explicit instrument picking with orchestration roles:

- `pad`
- `bass`
- `lead`
- `percussion`
- `echo`

The surface infers role from gesture character:

- long smooth drag -> pad
- long hold -> bass
- clustered taps -> percussion
- sharp zigzag contour -> lead
- circular motion -> echo / fx

We later added a subtle one-shot role seal so the next contour can be steered, but the main identity still depends on gesture inference.

This was a strong conceptual win. The user is not selecting a patch from a menu. They are casting a kind of musical behavior.

### Phase 5: Dialogue And Ritual Structure

We added call-and-response so a melodic contour can receive an answer phrase one bar later. The response preserves recognizable contour identity but varies harmonic landing, role, octave, and timing offset.

Then we added cadence events every 8 bars when multiple voices are active:

- harmonic resolution
- global ripple bloom
- radial sigil pulse
- brighter glyph intensity

This gave the piece larger-scale phrasing. The instrument began to feel less like a loop toy and more like a ritual ecology with arrival points.

### Phase 6: Fusion Voices

Most recently, overlapping active phrases can now spawn a temporary fusion voice. The overlap is not a simple layer boost. It becomes its own transient phenomenon:

- overlap is detected from playback-head proximity plus partial path overlap
- the fusion voice blends source colors and glyphs
- it takes on a distinct timbral role: `shimmer`, `arp`, or `harmonic-echo`
- it emits transient luminous note events in its own visual language

This is the first real sign that the system can generate ensemble interactions, not just independent voices sharing the same canvas.

### Phase 7: Soft Spatial Readability

One emerging problem was that once several roles were alive together, the surface could become beautiful but slightly difficult to parse. The answer was not to impose lanes as hard constraints. That would have damaged the instrument's sense of freedom.

Instead, we introduced soft spatial preferences:

- `bass` tends lower
- `pad` tends mid-low
- `lead` tends upper
- `percussion` accents near the top
- `echo` behaves more like an overlay field than a strict track

This matters conceptually. The screen is not becoming a piano roll. It is becoming more legible in the same way an ensemble onstage is legible: voices occupy tendencies, not prison cells.

Alongside the vertical tendency, we also added a subtle left-to-right flow field that gently encourages forward temporal motion. The key word is gently. Backward motion, circles, and local reversals are still allowed because they are musically meaningful:

- loops -> trill / shimmer behavior
- reversals -> syncopation / ornament
- circles -> sustained echo

This phase is easy to misunderstand if looked at only as implementation. It is not "constraint for order." It is "bias for readability."

### Phase 8: Silence As A First-Class Event

Another important shift was realizing that the system was still too eager to make everything speak all the time. Even with contour shaping, many phrase subdivisions were implicitly treated as note opportunities.

That is not how living music breathes.

So the phrase model now treats three states as primary:

- `note`
- `sustain`
- `rest`

This is not merely an audio detail. It changes the ontology of the score. Silence is now authored and rendered, not inferred after the fact as absence.

Preferred interpretation became:

- timing gaps between gesture segments can become rests
- long flatter horizontal spans can become either sustain or silence
- lower regions can softly encourage silence through a threshold bias

Playback now shows rests as dim ghost placeholders or fading empty glyph spaces. This was important. If silence is musically real, it should also be visually real. The user should feel that the surface is choosing to breathe, not failing to fire.

### Phase 9: Local Rhythm Gravity

We then added proximity-based phrase locking, but in a very specific way: not as hard quantization, and not as a grid imposed from above.

Instead, nearby active phrases now emit a soft rhythmic attraction field. When a new phrase is drawn near them, the system can:

- gently align onset timing
- bias local note spacing toward nearby rhythmic signatures
- inherit some motif density when it helps the phrase belong
- let response phrases phase-lock to nearby calls

What matters is the constraint style. The contour is still the user's. The field is only there to make adjacent phrases feel socially aware of one another.

This is especially important for cases like:

- a nearby four-on-the-floor pulse softly attracting quarter-note feel
- a nearby syncopated figure lending a timing skeleton without cloning itself
- a response phrase feeling rhythmically related to the call without becoming a copy

The principle is:

`phrases near each other may rhyme in time, but they should not snap into sameness`

## What The Surface Is Now

At the moment, EchoSurface is roughly:

- a harmonic contour composer
- a gesture-inferred chamber ensemble
- a ritual score visualizer
- a lightly generative call-and-response system
- a time-based climax engine with cadence events
- an overlap-sensitive interaction field with fusion blooms
- a soft-lane ensemble score with readable role geography
- a phrase engine where silence and sustain are compositional material
- a local rhythm-gravity field where nearby phrases can phase-lock softly
- a dramaturgical form-engine with verse/chorus/bridge/drop scene arcs
- a hierarchical composition space where scopes create local harmonic worlds

It is not trying to be a DAW, piano roll, or synth workstation.

That is worth defending.

The magic seems strongest when the user feels:

1. "I drew that."
2. "The system understood the shape, not just the coordinates."
3. "The world around it answered musically."

An additional feeling worth protecting now is:

4. "The silences felt chosen."

### Phase 10: Scene Morphing — Macro Musical Form

The surface now composes larger musical form over time through four named scene states:

- `verse` — settled, spacious, sparse voices, root-biased chord landings, 82% cadence weight
- `chorus` — lifted and open, 3rd-biased landings, denser voices, warmer/brighter palette shift, 128% cadence weight
- `bridge` — suspended tension, 5th-biased landings, very sparse voices, muted/cooler palette, 58% cadence weight
- `drop` — maximum density, root-grounded, near-zero rests, full voice weight, richest colour, 188% cadence weight

The default cycle is `verse → chorus → verse → bridge → chorus → drop` on an 8-bar clock.

Each scene modifies five independent dimensions:
1. **Harmonic progression bias** — the preferred chord-tone landing index shifts the note resolution at stable phrase points
2. **Voice activity weighting** — probability of spawning call-and-response voices; bridge is sparse (30%), drop is always on (100%)
3. **Visual color palette** — the harmonic wash hue, saturation, and brightness shift per scene (warm amber in chorus, violet in bridge, gold in drop)
4. **Cadence intensity** — the cadence event fires harder or softer depending on scene
5. **Rest density** — the rest-score threshold is lifted (bridge, verse) or lowered (chorus, drop), biasing phrase density

The `phraseToken` now includes the scene name, so all active loops immediately rebuild their phrase notes when a scene transition fires.

**Bonus: early transition.** If `surfaceEnergy ≥ 0.72`, `activeRoles ≥ 3`, and `recentGestures ≥ 3` within the last two bars, the system can skip ahead before the 8-bar window expires — jumping `verse → chorus` or `chorus → drop` in response to high interaction energy or phrase density. This makes the surface feel compositionally responsive to how intensely it is being played.

A minimal scene label appears bottom-centre with per-scene colour accents and a fade-in animation on each transition. It stays peripheral enough that the canvas remains the protagonist.

Important conceptual point: this is not "song sections" in the DAW sense. It is dramaturgical. The surface is not following a chart; it is accumulating conviction over time and releasing it.

### Phase 11: Scope Hierarchy — Hierarchical Composition Worlds

The surface is no longer a single flat plane. It now supports softly bounded elliptical "scopes": regions that contain their own harmonic context, voice phrases, and sub-scopes.

**Scope creation gesture.** Drawing a large, slow, closed loop (high circularity, loopiness, and travel, with the path ending near its origin, over at least 900ms) spawns a scope ellipse. The system assigns a randomly chosen ritual label (Liminal, Veil, Threshold, Hollow, Reverie, etc.) and a unique hue derived from its position.

**Scope records.** Each scope stores: center (cx, cy), radii (rx, ry), hue, label, parent/child ids, loop ids, and optional harmonic overrides for tonic, mode, BPM, progression, or scene. Overrides are applied on top of the parent's context, not instead of it. Walking the tree root→leaf produces the effective harmonic world for any phrase.

**Camera and semantic zoom.** The canvas applies a camera transform (translate + scale) each frame via smooth lerp. Two-finger pinch or scroll wheel zooms, with the cursor/pinch midpoint held stable in world space. Zooming in past a threshold while a scope is under view enters that scope. Zooming back out exits to the parent. This is not a node editor — it is more like falling into a world and surfacing again.

**Clock emitters.** Each scope renders animated concentric rings that pulse on the beat, synchronized to BPM. They communicate rhythmic identity without adding UI controls.

**Scope breadcrumb.** When inside a focused scope, a minimal breadcrumb appears top-center showing the scope name (tinted to its hue) and a tap-to-exit arrow. It disappears when at the root level.

**Musical implication.** Phrases drawn inside a scope inherit its harmonic overrides. Two scopes on the same canvas can be in different keys, modes, or scenes. The canvas becomes a composition of worlds rather than a composition on a single plane.

Important conceptual note: scopes are not containers in an app-UI sense. They are more like harmonic territories: fields of influence that give a region of the canvas its own musical character. The user is not managing a hierarchy — they are drawing an instrument and discovering that some regions sound different.

## Current Implementation Shape

Most of the intelligence currently lives in:

- `src/components/EchoSurface.tsx`

Supporting presentation and framing live in:

- `src/styles.css`
- `src/App.tsx`
- `src/components/HowToPlay.tsx`
- `README.md`

Important systems already present in `EchoSurface.tsx`:

- harmonic state and bar clock
- contour analysis and phrase-note building
- role inference from gesture summary
- soft swim-lane bias and subtle forward flow shaping
- proximity-based rhythm attraction and soft phrase locking
- phrase-event classification into note / sustain / rest
- anchor-timeline playback timing so gaps can remain musically meaningful
- retrace playback and glyph rendering
- call-and-response generation
- cadence ritual events
- fusion voice spawning and rendering
- scene morphing state machine (verse/chorus/bridge/drop) with early-trigger logic
- scope hierarchy: ScopeRecord tree, CameraState, semantic zoom, scope gesture creation
- clock emitter rendering and scope breadcrumb UI

This is powerful, but also means the main surface file is becoming the entire instrument brain. If the project keeps growing, it may be worth extracting pure musical logic into separate modules without losing the fast, sketch-like iteration style that got us here.

## Design Rules Worth Keeping

- Preserve the "screen as instrument" feeling.
- Prefer gesture interpretation over explicit control surfaces.
- Keep controls subtle and peripheral.
- Favor musical coherence over literal input mapping.
- Favor beauty over realism.
- Favor soft biases over hard rules.
- Let readability emerge from tendencies, not locked tracks.
- Treat silence as authored material, not missing output.
- Let harmony contextualize gesture rather than dominate it.
- Let nearby phrases influence one another through soft timing gravity, not hard snapping.
- When adding a system, ask whether it feels like ritual behavior or app behavior.

## New Heuristics Worth Remembering

These are not sacred formulas, but they are part of the current aesthetic contract.

### Spatial Heuristics

- roles may prefer regions, but gestures should still be free to trespass
- the `echo` voice should feel like a spectral overlay, not a lane-occupant in the usual sense
- forward time should be visually encouraged, but never enforced so strongly that reverse or circular marks feel "wrong"

### Phrase Heuristics

- not every subdivision deserves a note
- flatter motion can mean sustain, but it can also mean withholding
- timing gaps are expressive and should survive interpretation when possible
- nearby phrases may share pulse and density without sharing exact contour
- if the system must choose between density and breath, breath is often the more musical choice

### Visual Heuristics

- a rest should read as present absence
- the user should be able to see that a phrase contains space, not just hear it
- placeholders for silence should stay subtle enough that the score remains luminous rather than diagrammatic

## Tensions To Watch

These tensions are productive, but they can also break the spell if handled badly.

### 1. Clarity vs Mystery

Too little explanation and the user feels lost.
Too much explanation and it becomes software instead of enchantment.

### 2. Gesture Freedom vs Musical Guarantees

If the system over-quantizes, the surface can feel polite and samey.
If it under-quantizes, the musicality collapses.

### 3. More Features vs Less Chrome

The canvas wants to stay sacred. Every new selector risks turning the spell circle into a dashboard.

### 4. Generative Surprise vs User Ownership

Responses, cadences, and fusion events are interesting only if the user still feels authorship.

### 5. Readability vs Over-Scaffolding

The new lanes and flow field help a lot, but they can be pushed too far. If every role becomes visually over-disciplined, the instrument stops feeling like drawing and starts feeling like sorting.

### 6. Density vs Breath

Now that rests are first-class, a new failure mode appears: over-correcting into emptiness or making the system feel hesitant. Silence should feel intentional and phrased, not timid.

## AI Pontification: Where I Think This Could Go

This section is intentionally a little more speculative.

### Ritual Form, Not Just Loop Form

Right now the system has bars, chord changes, answers, and cadences. That is a strong start, but it could eventually support larger ceremonial arcs:

- invocation
- gathering
- agitation
- revelation
- cadence
- release

That could be driven by density, ensemble spread, contour temperature, or elapsed performance time. The point would not be "song sections" in a normal sense. The point would be giving the surface dramaturgy.

### Phrase Memory As Living Material

The instrument could begin remembering families of phrases, not just currently active loops.

Possible behaviors:

- a new contour can awaken an older contour variant
- repeated motifs can become stronger "spells"
- the surface can gradually ornament remembered phrases
- the surface can remember where a phrase tends to leave silence, not just where it speaks
- certain shapes can become recurring leitmotifs for a session

This would make the instrument feel like it has memory, not just playback.

### Harmonic Weather

The harmonic engine is currently explicit and useful, but still fairly stable. A next step could be a more atmospheric harmonic model:

- modal drift over time
- temporary borrowed chords
- suspension bars before full resolution
- tension fields created by ensemble density
- cadence events that actually reshape the next progression

This would keep the thesis intact while making harmony feel more alive than a fixed loop.

### Conductor Gestures

A compelling direction would be to reserve a small family of meta-gestures that do not add phrases but steer the ensemble:

- spiral inward = intensify
- wide horizontal sweep = thin texture
- vertical hold at center = suspend harmony
- ring around active voices = bind them into unison or octave spread

If done well, this would be far better than adding more buttons.

### Voice Personalities

The current roles are good, but they could become more socially aware.

Examples:

- `pad` could absorb and reharmonize nearby phrases
- `bass` could act as a gravitational anchor for fusion events
- `lead` could challenge or invert a prior phrase
- `percussion` could carve temporary rhythmic lattices into the bar
- `echo` could smear motifs across bars or answer late

That would move the ensemble toward behavior, not just timbre.

### Fusion As A Bigger Compositional System

Fusion voices are currently local and temporary. They could evolve into one of the most distinctive ideas in the project.

Possible next steps:

- allow triple-overlap events for rare "apotheosis" moments
- let repeated pairings stabilize into recurring hybrid roles
- make fusion alter harmony, not just ornament it
- let fusion glyphs seed answer phrases
- create a sense that some combinations are more alchemically compatible than others

This is high potential territory.

### Silence Rituals

Now that silence exists as an event, there is a lot of room to make it more ceremonial rather than merely subtractive.

Possible next steps:

- let a phrase accumulate "rest gravity" so repeated quiet gestures hollow out space around them
- let cadence moments briefly widen silence windows before the next arrival
- create visible breath marks or evaporating sigils between separated note clusters
- allow certain low, slow gestures to become near-silent conductorial marks rather than conventional voices

This could become one of the more distinctive parts of the instrument if handled delicately.

### Spatial Composition

The surface currently uses space for contour shape and visual placement, but there is room to push spatial meaning further:

- upper/lower regions could imply register families or harmonic brightness
- center vs edge could affect ritual weight
- quadrants could influence response temperament
- orbiting around an existing phrase could count as a relationship gesture

The risk here is making the space too coded. The opportunity is making the canvas feel more like a true field of forces.

### Performance Capture

Eventually this thing should probably be able to leave behind artifacts:

- export a performance as video
- export phrase data as JSON or MIDI-like abstractions
- snapshot a "ritual state" and resume it later
- save seeds for harmonic settings plus gesture memories

That would make EchoSurface feel less ephemeral when desired, while preserving the liveness of play.

## Good Next Steps If We Want Low Risk

- refine fusion overlap thresholds by ear and eye
- add one or two more progression moods, not a giant menu
- add a barely visible session state snapshot/export
- factor musical helper logic out of `EchoSurface.tsx`
- improve guide material so delayed answer and cadence behavior are easier to understand

## Good Next Steps If We Want High Reward

- conductor gestures
- long-form ritual states / scene evolution
- phrase memory and motif awakening
- persistent hybrid roles from repeated fusion pairings
- harmony that responds to ensemble behavior

## If Another Chat Picks This Up Later

The most important thing to remember is that this project became interesting when it stopped being a generic audiovisual synth pad and started becoming a compositional ritual surface.

If future changes are ambiguous, bias toward:

- embodied musical gesture
- minimal chrome
- visible causality
- harmonic reinterpretation
- ensemble behavior
- theatrical beauty

If a new idea makes it feel more like software than sorcery, it probably needs another pass.
