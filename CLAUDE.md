# Chordfinder — notes for Claude

Native Windows desktop app for exploring chord progressions. Tauri 2 shell
(Rust) around a static HTML/JS UI with **no npm build step and no npm
dependencies** — same setup as the user's `../kanban` project. The user runs
the release `.exe`.

## Layout

| Path | Role |
| --- | --- |
| `ui/theory.js` | Pure music theory: scale spelling, Roman-numeral token parser, chord building, 7th colouring, `LIBRARY` of progressions per mode, modifier templates, borrowed-chord generation (`BORROWABLE`), cadence naming, `suggest()` entry point |
| `ui/styles.js` | `GENRE_STYLES`: per-genre progression libraries (keyed by mode id) plus defaults (`color`, `bpm`, `length`, optional `modifier`). Theory style = `LIBRARY` in theory.js; `STYLES`, `styleById`, `styleModes` exported from theory.js |
| `ui/graph.js` | Pure: `buildTree()` merges progressions into a prefix tree with lanes; `continuation()` picks "could continue" targets; `layout()` returns pixel geometry (`SIZES.full` / `SIZES.compact`); sticky root: `rootOffset()` + `rootPaths()` (app.js `stickRoot` on canvas scroll) |
| `ui/midi.js` | Pure: `voiceChord`/`voiceSequence` (shared by synth and export), SMF writer, `asciiChord`, `midiFileName` |
| `ui/horn.js` | Pure: sax view — `INSTRUMENTS` (transposition), `SAX_RANGE`, `REGISTERS`, `SCALES` (mode/pentatonics/blues), `chordLayer` (chord tones + chord-scale), `guideLine`, `hornView()`, `formatNote` (letters/Dutch/fixed do), `solfa` (movable do), `degreeLabel` |
| `ui/guitar.js` | Pure: chord voicings (`OPEN_SHAPES` first, else a movable-shape search: `voicing`, `shapeText`, `baseFret`) and the guitar view: neck (`FRETTED` instruments, `fretboardView` with optional chord focus, `scaleRun`), `alternates` (≤ 6 shapes up the neck), `voiceLead`, `movement`, `scalePositions`, `shapeInPosition`; staff/tab notes (`WRITTEN` = +12, `positionTab`, `shapeTab`, `bassArpeggio`, `placeNote`) |
| `ui/strum.js` | Pure: strumming patterns (`STRUMS`, one bar of 8/16 steps: D U x - 1–6), `STYLE_STRUM` (Auto per style), `strumBar` / `strumProgression` (timed events), `strumNotes` (for MIDI) |
| `ui/fingering.js` | Pure: `KEYS` (ids + names), `LAYOUTS` (diagram geometry per layout: schematic / chart / body; `shapeBox` for tests), `fingeringsFor(writtenMidi)` (standard + common alternates) |
| `ui/piano.js` | Pure: piano view — `PIANO_SIZES`, `keyboardView`, `scaleFingering` (thumb-group search), `scaleRun`, `colorChord` (extensions / altered from the chord-scale, avoid notes, chord symbol), `VOICINGS` + `voicingsFor`, `voiceLead`, `chordFingers`, `identifyChord` / `readInKey` (`TEMPLATES`) |
| `ui/reharm.js` | Pure: `REHARMS`, `reharmonize()` (items with `len` in chord slots, `tag`, `why`), `reharmBeats`, `tokenFor` |
| `ui/comp.js` | Pure: piano comping — `COMPS` (one bar of hits on voicing parts), `STYLE_COMP`, `compBar` / `compProgression` (events with `spread: 0`), `compNotes` |
| `ui/pianoquiz.js` | Pure: piano drills (`PIANO_DRILLS` play / quality / inversion / read, `makePianoQuestion`, `playedRight`) |
| `ui/pianoview.js` | DOM for the piano view (`initPiano(ctx)` gets app.js helpers), Web MIDI + computer-key input, play panel helpers (`panelVoicings`, `panelComp`, `miniKeys`) |
| `ui/pitch.js`, `ui/mic.js`, `ui/mic-worklet.js` | Tuner: pure YIN pitch detection + note tracker; mic capture via AudioWorklet (nothing recorded); `startMic({ size })` sets the analysis block (2048; 4096 for bass, since the lowest pitch found is about rate / (size / 2)) |
| `ui/quiz.js` | Pure: practice drills (`DRILLS`, `makeQuestion`, cadence, resolution, scoring) |
| `ui/fretquiz.js` | Pure: guitar-view drills (`FRET_DRILLS` find/name, `FRET_LEVELS`, `makeFretQuestion`, `isFretRight`) and `nearestString` for the string tuner |
| `ui/staff.js` | Pure: staff notation — `CLEFS`, `keySignature` (mode → parent signature), `accidentals` (carried per bar), `layoutStaff()` pixel geometry (notes with `stack: true` join the previous note's chord column; `col` = column x); app.js `staffSvg` / `tabStaffSvg` draw it; `layoutGrand()` = piano grand staff (columns of `{ rh, lh }` shared by both staves; pianoview.js `grandSvg`) |
| `ui/audio.js` | Web Audio synth (uses `voiceChord` from midi.js); `playNote`/`playLine` for single notes, `playAlong` backing loop with count-in |
| `ui/app.js` | DOM: side panel, SVG rendering, focus/hover, play panel, playback, MIDI drag, persisted state |
| `ui/index.html`, `ui/style.css` | Markup and styles; colour tokens in `:root` |
| `src/main.rs` | Window setup, Windows 11 title-bar colours (DWM), `drag_midi` command |
| `tests/*.test.js` | `node --test` suites for theory, graph, MIDI, styles, horn (sax view), staff, fingering, guitar, strum, fretquiz, pitch, quiz and piano (fingering, voicings, reharm, comping, grand staff, recognition, drills) |
| `scripts/make-icon.js` | Renders `icons/icon.ico`, `icon.icns` (macOS, artwork inset to 824/1024), `icon.png`, Linux PNG sizes and `drag.png` with no deps |
| `.github/workflows/build.yml` | CI: tests, then Windows (NSIS + portable zip), macOS universal `.dmg`, Linux AppImage/`.deb`; tag `vX.Y.Z` → draft release |

## Commands

```bash
npm test                 # node --test tests/*.test.js  (Node 25 needs the glob, not a dir)
cargo build --release    # target/release/chordfinder.exe (~1 min incremental)
npm run icon             # regenerate icons
```

## Workflow gotchas

- **The UI is embedded into the exe at compile time.** Any change under `ui/`
  needs `cargo build --release` before the native app shows it.
- **A running `chordfinder.exe` locks the file** → build fails with
  "Access is denied (os error 5)". Check `Get-Process chordfinder` first and
  close it if running (`Stop-Process -Name chordfinder`) — no need to ask.
- From PowerShell, run cargo as `cmd /c "cargo build --release 2>&1"`;
  otherwise stderr progress makes `$?` report failure even on success.
- **Browser preview**: `.claude/launch.json` has `ui-static` (python
  http.server on port 5174 serving `ui/`). It caches ES modules — add a query
  string and `location.reload()` to pick up JS changes. `window.__TAURI__` is
  absent there, so the MIDI button falls back to an HTML5 `DownloadURL` drag.
- Testing the real window: PowerShell + `System.Drawing` `CopyFromScreen`
  (call `SetProcessDPIAware` first; use `DwmGetWindowAttribute(9)` for the
  visible frame) to screenshot; `SetCursorPos`/`mouse_event` for drags.
- The user pushes to GitHub themselves; don't commit or push for them unless asked.
- Release tags must match `version` in tauri.conf.json (CI checks). Bundling
  only runs via the Tauri CLI in CI; local `cargo build` ignores `bundle`.
- Keep the app `identifier` (`com.local.chordfinder`): WebView2 stores
  localStorage under it, so changing it wipes users' saved state.
- macOS/Linux code paths exist (`#[cfg(windows)]` gates) but MIDI drag-out is
  Windows-only (`start_drag`); they've only been built in CI, never run locally.

## Conventions and decisions

- **Roman numerals are relative to the major scale** in every mode
  (`♭VI`, `♭VII` …). Tokens: case = triad, `°`/`+`/`ø`, ext
  `7|maj7|6|sus2|sus4|add9`, secondary `X/Y`. `parseToken` regex in theory.js.
- **Library entries** `p(mood, name, chords, end)`; the first per mode is the
  main line (lane 0). `end: 'resolve'` returns to root, `'open'` ends there.
  Every template must add at least one new node or `buildTree` drops it —
  so a shorter progression must come *before* a longer one that extends it
  (`tests/styles.test.js` fails with "progression(s) hidden" otherwise).
- **Styles** (dropdown at top of panel): Theory + 15 genres. A style only
  lists the modes it uses; others are dimmed. Switching style applies its
  defaults and jumps to its first library mode if needed. Progressions are
  hand-curated, real genre staples — keep it that way.
- **Video game styles** (`group: 'Video game'` → own `<optgroup>`): Adventure
  and Vampire Hunter are idiom-based; Zelda and Castlevania are transcriptions
  of real tracks (mostly Hooktheory TheoryTabs, converted to major-relative
  numerals, inversions dropped) and name the track in each progression.
  Hooktheory's `rel` numerals are relative to the section's own mode/scale.
  Double Dragon has no Hooktheory tabs; it's analysed from VGMusic fan MIDIs
  (bass-channel roots, qualities from the other voices), cross-checked
  against each other and gametabs.net tabs; one-source entries say so.
- Modes: 9 classic + **Phrygian dominant** (`phrygdom`, major tonic; flamenco/metal).
- Extra chord types: `9` (dom9 / m9 by case), `maj9`, `7sus4`, `5` (power),
  plus root modifier "Power 5". Borrowed marking is judged by the chord's
  actual notes (power chords have no third).
- **Chord length** setting (`state.length`): `phrase` = 2 beats per chord +
  closing root if it resolves; `loop` = 1 bar per chord, last chord padded to
  a multiple of 4 bars, no closing chord. `sequenceFor()` in app.js feeds both
  playback and MIDI so they always match.
- **Borrowed chords** are limited to the curated `BORROWABLE` table (common
  modal-interchange chords per major/minor family). Broadening it produced
  unidiomatic suggestions — keep it curated.
- **Parallel shift** (play panel, resolved branches only): `parallelShifts()`
  in app.js offers up to 3 opposite-family modes (major ↔ minor, by tonic
  case) that the style uses, ordered by `SHIFT_ORDER`. ▾ opens a list of that
  mode's branches (`shiftMenu`); ▶ previews, right-click ▶ chains the
  selected branch first, clicking a row switches mode and keeps the branch
  (branch ids are template indexes, so they survive the switch).
- Chords carry `source`: a parallel mode object (borrowed), `'secondary'`, or
  null; borrowed ones render with dashed borders.
- **Persisted UI state** lives in `localStorage` key `chordfinder:state`.
  When changing a default, bump `STATE_VERSION` in app.js and drop the old
  saved value in `loadSaved()` (done for compact-as-default in v2).
- **Themes** (`state.theme`, dropdown in Settings: dark / midnight / forest /
  twilight, light / pastel / sepia / mint; `state.corners`: round /
  boxy) set `data-theme` / `data-corners` on `<html>`. Every colour in
  style.css is a token in `:root`, overridden per theme — don't add colour
  literals outside `:root` (piano keys and `#printsheet` excepted). Lane
  colours are `PALETTES[theme]` in app.js. Radii are `var(--pill)` or
  `calc(Npx * var(--rk))`; boxy shrinks both. `applyTheme()` calls the Rust
  `set_titlebar` with the theme's `--surface`/`--text`/`--border`; the
  constants in `src/main.rs` are the dark defaults used before the UI loads.
- Copy style: the user prefers concise UI text; chord names use ♭/♯ in the UI
  and ASCII (`Eb`, `F#dim`, `Bm7b5`) in MIDI files.

## Playback: count-in and playhead (every view)

- `state.countIn` (default on), toggled by the metronome button
  (`metroButton()` in app.js, passed to pianoview via ctx) left of the
  sax, guitar and piano views' Play button (renamed from Play along); the
  Chords page has none and plays at once; one document-level click listener on `[data-countin]`.
  audio.js `playAlong({ countIn, startAt })` and `playSequence(…, rhythm,
  { countIn, startAt, onCount })`: `startAt` = the chord the first pass
  starts on (rhythm events are skipped by their `chord` index).
- Playhead = the focused chord (`hornFocus` / `gFocus` / `pFocus`; on the
  Chords page the module `playhead`, reset per branch and when a play ends).
  Play along starts from it. Clicking a chord chip or a progression-staff
  bar (`barHits()` rects with `data-bar`, and the chord name above it)
  sounds the chord there, or, while playing, jumps there at once (no
  count-in). Staff lines etc. have `pointer-events: none` so the bar rects
  get the click; note heads keep their own click.

## Guitar view (overview for beginners, built in phases)

Goal: a concise, general overview of the neck, not a full method. Same
pattern as the sax view: **Chords | Sax | Guitar** switch, shared side
panel, every mode selectable, controls in the header (`#gbar`: instrument
+ Options ▾), scale chips shared with the sax view (`state.hornScale`).

- Instruments in `FRETTED`: Guitar (6-string) and Bass (4-string), standard
  tuning only for now (alternate tunings: later option; the open-shape
  table assumes standard). MIDI numbers are sounding pitch.
- Neck (`neckSvg` in app.js): frets 0–17 (the highest position reaches 17), equal fret widths so labels fit,
  high string on top (tab orientation), inlays 3 5 7 9 12 15. Labels
  (`state.fretLabels`): names / degrees / movable do. Left-handed flip
  (`state.lefty`) mirrors x only. Hover marks every spot of the same pitch;
  click plays it. Play scale: two octaves from the lowest tonic (one on bass
  when two don't fit), Space toggles.
- Progression row (phase 2): progression select + scale chips + chord
  chips (`data-gi`). `gFocus` (null = scale, else chord index; module
  state) shows the chord-scale from `chordLayer`: chord tones filled,
  other scale notes small, the current shape ringed. Degree labels count
  from the chord root; movable do stays on the key. Chord card (guitar
  only, fixed size): big `chordBox(v, 2.3)`, ◀ ▶ through `alternates`
  (overrides in `gAlt`, keyed `index:name`), click strums. Shapes:
  Easiest | Close together (`state.gVoice`; `voiceLead` = DP over the
  alternates, first chord fixed at its easiest, falls back to easiest if
  that moves less). Play along strums the shapes (`playAlong({ strums })`,
  `playStrum` in audio.js); bass plays piano chords + root line. Space
  toggles play-along.
- Positions (phase 3, `state.gPos`, 0 = whole neck): `scalePositions`
  walks the scale from each scale note on the low string — two notes per
  string for pentatonics (the standard five boxes; tested against A minor
  pent), three per string for seven-note scales (3NPS, 7 positions; chosen
  over CAGED because it is regular for every mode). Blues = minor pent
  boxes + ♭5 a fret above each 4th. Position 1 starts on the tonic. Notes
  outside the position's per-string fret range are dimmed (also for a
  focused chord's chord-scale); Play scale walks the position's exact
  spots. Chord shapes come from `shapeInPosition` (easiest inside the
  frets ±1, else nearest) and join the ◀ ▶ list.
- Staff + tab (phase 4, `guitarStaves` / `tabStaffSvg` in app.js): written
  pitch (sounding + 12), treble clef (bass clef on bass) with a small 8
  below, tab lines under the staff (high string on top), fret numbers on a
  background patch. Focus box: the scale in the chosen position (position
  1 on the whole neck), or a focused chord's shape stacked then note by
  note (bass: chord-tone arpeggio). Progression box: one bar per chord
  (guitar shapes; bass roots), current chord highlighted. Hovering a
  staff/tab note marks its spot on the neck; Play scale lights the neck
  and the scale staff only.
- Strumming (phase 5, guitar only, `state.strum`: 'auto' = the style's
  pattern from `STYLE_STRUM`, else a pattern id): row under the play row
  with the picker, an arrow strip over the count (`strumStrip`, the hit
  step lights during play-along via `onHit`), the pattern's tip and a
  `⠿ MIDI` drag (`strumMidi`: one pass, GM steel guitar 25, chord
  markers, `notesToMidi` in midi.js). Play-along passes `rhythm` events
  to `playAlong` (downs low→high, ups on the top 4 strings high→low,
  chucks short and quiet, swing = off-beats at 2/3, `short` patterns
  clipped). onHit timers are scheduled after onStep so a chord change
  re-render doesn't wipe the first hit's highlight. Bass is unchanged.
  Custom pattern (`strum: 'custom'`, `state.customStrum` = { steps,
  swing, short }; `customStrum`/`cleanSteps`/`cycleStep`/`resizeSteps`
  in strum.js): first pick seeds it from the pattern showing; the strip's
  steps cycle ↓ ↑ × · on click (right-click back), a text field takes
  typed steps (incl. 1–6 picks), 8ths/16ths, Swing, Mute toggles. Edits
  restart a running play-along.
- Phase 1 (done): neck, scales, labels, instruments, left-handed, play
  scale. Phase 2 (done): progression on the neck. Phase 3 (done):
  positions. Phase 4 (done): staff + tab. Phase 5 (done): strumming.
  Phase 6 (done, native mic untested): practice + string tuner. Later
  options: alternate tunings; Play/MIDI using the guitar voicings when the
  play panel's Guitar toggle is on.
- Practice (phase 6, `state.gPractice`, Explore | Practice in `#gbar`):
  `renderFretQuiz` replaces the view. Drills: find (click the spot on the
  asked string; `.ftarget` hit circles, frets 0–12, 13–17 shaded) and name
  (a marked spot, answer with buttons or 1–9/0). Levels per drill in
  `state.gLevels`: two low strings / all strings (naturals) / with ♯/♭.
  Scores in `chordfinder:quiz` under `g<drill>:<instrument>:<level>`
  (quiz.js `record`/`ready`). Space = next. "🎤 Tune strings" opens the mic
  with its own handler (`gHeard`, `gTunerHtml` swapped in place each
  frame); `update()` stops the mic when view, fretted instrument or
  practice mode changes (`micReset`). Tested with an oscillator stream:
  111 Hz → A string +16¢; bass 41.5 Hz → E string +12¢.

- **Guitar diagrams** (play panel, `state.panel === 'guitar'`, Names | Guitar | Piano toggle in
  its header): one small chord box per chord (`chordBox` in app.js), chord
  name shrinks above it. Voicings: root in the bass on the E/A/D string,
  only chord tones (5th may drop from 4+ note chords), ≤ 4 fingers, barre
  only when > 4 strings are fretted, one muted string only right above the
  bass. The search allows no open strings — it found odd shapes (B as
  x21402) — so open chords come from `OPEN_SHAPES`. With Guitar on and Strum not Off
  (`state.pStrum`, the panel's own on/off; `panelStrum()` /
  `panelRhythm()`), Play, shift previews, chord clicks (one strum) and
  MIDI (`chordsMidi`) all strum the shapes with the guitar view's pattern
  (`currentStrum()`, GM steel guitar; 2-beat phrase chords get half a
  bar; `playSequence(..., rhythm)` in audio.js). Off = piano chords.
  With Guitar on, a `Strum: … ▾` button in the panel header opens an
  upward popover (`strumPopover`, `strumOpen`): Off + picker + strip + custom
  editor, the same `state.strum` as the guitar view (`strumOptions`,
  `wireStrumInputs`, `customStrumControls(id)` are shared). The header is
  one line: name and cadence shorten with an ellipsis.
  Under the chips a foldable strip shows the playhead / playing chord:
  Guitar → a neck (`neckSvg`, fixed 140px height, id `cneck`); Names /
  Piano → an 88-key keyboard (`chordKeys` in pianoview.js, max 120px;
  Names = the `voiceSequence` notes Play sounds, Piano = the panel
  voicing). Folded per mode in `state.folded['cinst:<panel>']`; Piano
  starts folded (`cinstFolded()`). `renderCinst(i)` in app.js.
  Each chord chip and graph node also drags out as a one-bar clip
  (`chordMidi`; `wireMidiDrag(el, build, { click: false })` keeps click =
  play; nodes use `pick` on `#canvas`, since SVG elements can't be HTML5
  `draggable` in the browser fallback).

## Piano view (beginners and advanced players)

From this view on the app also targets advanced players (jazz harmony,
voicings, reharmonisation). Same pattern as the other views: **Chords | Sax
| Guitar | Piano**, controls in `#pbar` (Explore | Practice, keyboard size,
⌨ Keys, 🎹 MIDI, Options ▾), scale chips shared (`state.hornScale`). The
keyboard sits at the bottom of the view, full width (sticky `.keybox`; the
view is a flex column) — the user asked for that.

- Scale fingering (`scaleFingering`): two thumbs per octave, groups of 2–4
  notes; thumbs on white keys, preferring the tonic and the 4th (RH) / 5th
  (LH) degree and the white key right after a black key in the direction the
  thumb passes under. Reproduces the traditional tables for all 12 major and
  harmonic minor scales (tests); RH 4th-finger rule checked against the
  cs.miami.edu fingering chart. Pentatonics/blues may need a thumb on black.
- Colour (`state.pExt`: as written / 7ths / 9ths / 11·13): extensions come
  from the chord-scale (`chordLayer`); a tension a half step above a chord
  tone is an avoid note (except ♭9 / ♭13 on dominants). Altered dominants
  (`state.pAltered`): 7♭9 at 9ths, 7alt (3 ♭7 ♯9 ♭13, no 5th) at 11·13. New
  chord types live in piano.js only — adding them to theory.js `QUALITIES`
  breaks the guitar test that every quality has a guitar shape.
- Voicings (`state.pVoicing`): each style implies a minimum colour
  (`effectiveExt`, e.g. rootless → 9ths). `voiceLead` = DP over candidates
  (motion of the upper notes + top voice + register pull); ◀ ▶ overrides in
  module `pAlt`. Bass root E2–D♯3 (rootless: an octave lower, hand 'B').
- Reharm (`state.pReharm`, toggles) only changes the piano view: items carry
  `len` (½, ¼ of a slot); inserted chords are built with `buildChord` tokens
  (`V7/vi`, `iiø7/vi`, `bII7`, `#i°7`), dotted chips.
- Comping (`state.comp`, 'auto' = `STYLE_COMP`): shared with the play
  panel's Piano toggle (`state.panel` = names | guitar | piano; old saved
  `guitar` boolean migrates in `loadSaved`). audio.js events take
  `spread` (0 = struck together).
- Input: Web MIDI (`navigator.requestMIDIAccess`, untested with a real
  device / in WebView2) and computer keys (A W S E D … = C C♯ D …, Z / X
  octave); held notes are named with `identifyChord` + `readInKey`.
- Practice (`state.pPractice`): drills in pianoquiz.js, scores in
  `chordfinder:quiz` under `p<drill>:<level>`; Play-the-chord accepts any
  inversion/octave (5th optional on 7ths; root optional on Extended).
- Testing without the browser pane: headless Edge with
  `--remote-debugging-port` driven over the DevTools protocol (Node's
  built-in WebSocket) against `py -m http.server` on `ui/`.

## Sax view (educational, built in phases)

Audience: a sax student in the Netherlands; the user is designing it phase by
phase, so build one phase at a time and check back.

- **Chords | Sax** switch in the top bar (`state.view`); the side panel is
  shared. In the sax view every mode is selectable (`suggest()` falls back to
  the theory library for modes a style lacks).
- Sax view controls live in the header (`#saxbar`, sax view only):
  Explore/Practice, instrument, Written/Concert and an **Options ▾**
  dropdown (note names, movable do, minor keys, show, names under notes,
  fingering strip; `optsOpen` keeps it open across re-renders, outside
  click closes it). The title shrinks first (its long line is cut off,
  full text as tooltip) so the header stays one line. The scale type is
  picked with the joined scale chips at the start of the progression row
  (`data-scale`): a click selects that scale and shows it; the chosen one
  stays marked (`.sel`) while a chord is focused. 🖨 Practice sheet sits in
  the play row. Goal: no control rows above the content — save vertical
  space. Segmented controls anywhere go through `segClick`.
- **Panel folding / size**: the Scale, Progression and Fingering boxes
  fold by clicking their title (`panelHead`, `state.folded[id]`); the scale
  staff and fingering panel have S M L sizes (`sizeSeg`, `state.scaleSize`
  / `fingerSize` → `SCALE_SIZES`: zoom on the staff SVG; CSS `zoom` on
  `.fmain` via `--fz`, box width grows with it so it stays fixed per step).
  Both re-render only the focus, so playback keeps going.
- **Layout stability**: boxes must not resize as content changes (hovering
  notes updates the fingering panel; a resize moved the grid under the
  mouse). The fingering panel has a fixed size; staves use `layoutStaff`'s
  `span` (fixed ledger room, -3..12) and the focus staff a `minWidth` of a
  full octave with 7 accidentals. Check with a script that hovers every
  cell / switches scales, chords and keys and records element rects.
- The root picker is always **concert** pitch. The sax view shows written
  pitch by default (`state.pitch`), title gives the other pitch. Written key
  = `spellKey` of the shifted pitch class (fewest accidentals).
- Range: written B♭3–F♯6 for every sax, no altissimo. Registers by written
  pitch: octave key from D5, palm keys from D6.
- Grid: one row per octave (high on top), 12 columns by pitch class.
- Names: Letters / Dutch (Cis, Bes, Es, As) / Fixed do (Si = B); movable do is
  a separate on/off line, Do-based or La-based for minor scales.
- **Chord-scale rule** (`chordLayer`): the key's notes — for a borrowed
  chord, the notes of the parallel mode it comes from (`chord.source`) —
  with each chord tone replacing the note on the same letter; named by
  matching `MODES`; `changes` is measured against the key. Chosen over a
  jazz chord-type table so borrowed chords show what changes. (Keeping the
  key's notes for borrowed chords gave Fm7 in C an awkward B♮; switched.)
  Secondary dominants keep the key's notes.
- Guide tones = 3rd + 7th; triads use 3rd + root, sus/power the sus note/5th.
  `guideLine` moves to the nearest guide tone, written C4–E5, starts on the
  3rd near A♭4 (ties go up).
- Chord symbols transpose via the written key (degree-wise), so concert B
  major's V on alto is E♭, not D♯. Dutch names keep letter chord symbols.
- Play along (`playAlong` in audio.js): 4-click count-in, loops
  `[tonic, ...branch]` at `state.bars` bars per chord (padded to 4-chord
  phrases), optional guide line on top; Space toggles it in the sax view.
  `hornFocus` (null = scale, else chord index) is module state, not saved.
- **Staff** (phase 3): whole-note heads only, no rhythm. Two staves: focus
  (scale octave, or chord arpeggio from the root nearest the staff middle)
  and the progression as a lead sheet (guide-tone line, else roots; current
  bar highlighted). Key signatures: church modes use the parent major,
  harmonic/melodic minor the natural minor, Phrygian dominant its
  harmonic-minor parent, pentatonics/blues the tonic's major/minor.
  Treble clef in written pitch; concert tenor/bari use bass clef. Clef and
  accidentals are Unicode glyphs (Segoe UI Symbol), no bundled font — the
  clef's size/offset in `staffSvg` were tuned by eye. Lead-sheet syllables
  are relative to the key; the focus staff's follow the grid.
- Phase 1 (done): instrument, written/concert, scales, names, range grid,
  play scale. Phase 2 (done): progression bar, chord tones/guide tones,
  chord-scale, guide-tone line, play-along. Phase 3 (done): staff, Show
  staff/grid/both, names under notes. Phase 4 (done): fingering panel +
  strip. Phase 5a (done, native mic untested): tuner, play-it-back
  exercise, play-along feedback. Phase 5b (done): Practice mode. Phase 5c
  (done, native print untested): practice sheet + melody MIDI. Dropped for
  now: horn lines, altissimo.
- **Practice sheet** (`printSheet` in app.js): fills `#printsheet` (built
  from `buildStaves`, the same staff content as the view, always with the
  guide-tone line) and calls `window.print()`; on macOS (WKWebView ignores
  it) it invokes the Rust `print_page` command. Layout CSS is outside the
  print query so it can be previewed by un-hiding `#printsheet`; only
  visibility is in `@media print`. Light colours via CSS variables scoped
  to `#printsheet`.
- **Melody MIDI** (`melodyToMidi` in midi.js, GM sax programs `GM_SAX`):
  scale (format 0, eighths as Play scale) and guide-tone line (format 1,
  line + chords track, play-along bar lengths, chord markers). Sounding
  (concert) pitch. Drag-out reuses `wireMidiDrag(btn, build)` / `drag_midi`.
- **Practice mode** (`state.practice`, Explore | Practice in the sax view;
  `.horn.practicing` hides the explore parts). Drills in `ui/quiz.js`
  (pure, injectable rng): `degree` (cadence then a note; answers are
  syllable + degree; resolves stepwise to Do after answering), `tone`
  (`playOver`: chord then a note on top), `read` (a key note on the staff
  in written pitch; answer by name or by playing it with the tuner on).
  Levels in `state.levels`; scores per drill:level in localStorage
  `chordfinder:quiz` (streak, best, last-20 accuracy; 90% over 20 suggests
  the next level). Keys: 1–9/0 answer, R replay, Space next/replay.
- **Microphone** (`ui/pitch.js` pure YIN + `noteTracker`; `ui/mic.js` +
  `ui/mic-worklet.js`): opened only on "🎤 Listen"/"🎯 Play it back";
  nothing recorded or stored. Samples come from an AudioWorklet (not rAF —
  rAF/timers are throttled when the window is hidden, which broke the
  exercise). Echo cancellation on, noise suppression/AGC off; headphones
  advised for play-along. macOS needs `Info.plist`
  (NSMicrophoneUsageDescription) + `Entitlements.plist` (audio-input),
  wired via `bundle.macOS.entitlements`; untested (CI-only).
- Testing the mic in the browser preview: replace
  `navigator.mediaDevices.getUserMedia` with a function returning an
  OscillatorNode → MediaStreamDestination stream, then click the button
  with a real (computer-tool) click so the AudioContext may start.
- Before driving the native window with clicks, screenshot first: the user
  may have something else (e.g. a game) in the foreground — don't send input then.
- **Fingerings** (`ui/fingering.js`) are by written MIDI, shared by all
  saxes; second octave is generated (first octave + octave key). Data was
  cross-checked against the Woodwind Fingering Guide (wfg.woodwind.org/sax,
  basic charts) — notably side B♭ = A fingering (L1 L2) + side key, low C♯
  includes the low C key. Tests enforce the octave-key and palm-key rules;
  keep data changes verified against a published chart.
- Fingering panel shows the hovered note (`fingerMidi`, displayed MIDI,
  reset when key/instrument/pitch changes), else the tonic near written G4;
  follows Play scale, and play-along when the guide-tone line is on. The
  strip draws mini diagrams under the focus staff (`state.strip`). Scale
  staff, panel and lead sheet flow as one wrapping row (`.hstaves` is
  `display: contents`).
- Diagram layout (`state.fingerLayout`, Options ▾): Schematic | Chart
  (compact chart: octave wedge, pinky table, side bars) | Body (keys around
  two body rails). Pearls are circles; levers, side and pinky keys are bars
  or pads. A test keeps every key inside 100×240 with no overlaps.

## MIDI drag-out (settled design)

- Button `⠿ MIDI` bottom right of the play panel. On drag start, JS builds the
  SMF (same chords/voicings/tempo as Play, 2 beats per chord, markers with
  chord names) and invokes `drag_midi`.
- Rust writes it to `%TEMP%\Chordfinder\<name>.mid` with
  `FILE_ATTRIBUTE_TEMPORARY` (kept in cache, not flushed), starts a native OLE
  drag via the `drag` crate (sync command = main thread, required), deletes
  the file 60 s later (`MIDI_TTL`), and clears the folder on startup.
- The user cares about **not writing to people's drives**. A virtual-file
  (`FileGroupDescriptorW`/`FileContents`) drag was built and verified with
  Explorer, but the user's DAW rejected it, so it was removed. Don't
  reintroduce it without a reason; DAWs need a real path.
- Older builds wrote to `Music\Chordfinder`; that is no longer used.

## Ideas not done yet

- Option to pick the MIDI folder (e.g. a RAM disk) for truly zero disk writes.
