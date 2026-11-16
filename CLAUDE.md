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
| `ui/fingering.js` | Pure: `KEYS` diagram layout, `fingeringsFor(writtenMidi)` (standard + common alternates) |
| `ui/pitch.js`, `ui/mic.js`, `ui/mic-worklet.js` | Tuner: pure YIN pitch detection + note tracker; mic capture via AudioWorklet (nothing recorded); `startMic({ size })` sets the analysis block (2048; 4096 for bass, since the lowest pitch found is about rate / (size / 2)) |
| `ui/quiz.js` | Pure: practice drills (`DRILLS`, `makeQuestion`, cadence, resolution, scoring) |
| `ui/staff.js` | Pure: staff notation — `CLEFS`, `keySignature` (mode → parent signature), `accidentals` (carried per bar), `layoutStaff()` pixel geometry; app.js `staffSvg` draws it |
| `ui/audio.js` | Web Audio synth (uses `voiceChord` from midi.js); `playNote`/`playLine` for single notes, `playAlong` backing loop with count-in |
| `ui/app.js` | DOM: side panel, SVG rendering, focus/hover, play panel, playback, MIDI drag, persisted state |
| `ui/index.html`, `ui/style.css` | Markup and styles; colour tokens in `:root` |
| `src/main.rs` | Window setup, Windows 11 title-bar colours (DWM), `drag_midi` command |
| `tests/*.test.js` | `node --test` suites for theory, graph, MIDI, styles, horn (sax view), staff, fingering, pitch and quiz |
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
- Title-bar colours in `src/main.rs` mirror `--surface`, `--text`,
  `--border` in style.css — keep them in sync.
- Copy style: the user prefers concise UI text; chord names use ♭/♯ in the UI
  and ASCII (`Eb`, `F#dim`, `Bm7b5`) in MIDI files.

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
