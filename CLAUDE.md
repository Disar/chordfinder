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
| `ui/graph.js` | Pure: `buildTree()` merges progressions into a prefix tree with lanes; `continuation()` picks "could continue" targets; `layout()` returns pixel geometry (`SIZES.full` / `SIZES.compact`) |
| `ui/midi.js` | Pure: `voiceChord`/`voiceSequence` (shared by synth and export), SMF writer, `asciiChord`, `midiFileName` |
| `ui/audio.js` | Web Audio synth (uses `voiceChord` from midi.js) |
| `ui/app.js` | DOM: side panel, SVG rendering, focus/hover, play panel, playback, MIDI drag, persisted state |
| `ui/index.html`, `ui/style.css` | Markup and styles; colour tokens in `:root` |
| `src/main.rs` | Window setup, Windows 11 title-bar colours (DWM), `drag_midi` command |
| `tests/*.test.js` | `node --test` suites for theory, graph and MIDI |
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
  **ask the user before closing it** (they keep it open while testing).
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
- Chords carry `source`: a parallel mode object (borrowed), `'secondary'`, or
  null; borrowed ones render with dashed borders.
- **Persisted UI state** lives in `localStorage` key `chordfinder:state`.
  When changing a default, bump `STATE_VERSION` in app.js and drop the old
  saved value in `loadSaved()` (done for compact-as-default in v2).
- Title-bar colours in `src/main.rs` mirror `--surface`, `--text`,
  `--border` in style.css — keep them in sync.
- Copy style: the user prefers concise UI text; chord names use ♭/♯ in the UI
  and ASCII (`Eb`, `F#dim`, `Bm7b5`) in MIDI files.

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
