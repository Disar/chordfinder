# Chordfinder

> [!NOTE]
> This is a vibe-coded app I made for my own use. I'm sharing it in case anyone else finds it useful, but there's no guarantee it will be maintained.

**A small, fast desktop app that maps out chord progressions from music theory — and drops them straight into your DAW as MIDI.**

Pick a key and a mode, and Chordfinder draws a map of progressions that start on your root chord: the classic progression for that mode runs along the top, and variations branch off wherever they take a different turn. Every branch is labelled with its mood, and you can hear any chord or progression with a click.

![Chordfinder showing Cinematic-style progressions in C Aeolian](docs/screenshot.png)

## Features

- **Styles.** Pick a style from the dropdown and the whole map is rebuilt from that genre's own progressions and mood labels: **Theory**, **Pop**, **EDM**, **Kawaii future bass**, **Lo-fi / neo-soul**, **Rock**, **Blues**, **Jazz**, **Cinematic**, **Synthwave**, **J-pop / anime**, **Gospel**, **Metal** and **Flamenco**. Each style also sets a fitting tempo, chord colour and chord length — 12-bar blues in dominant 7ths, Royal Road and *Just the Two of Us* moves in future bass, power-chord Phrygian riffs in metal, the Andalusian cadence in flamenco.
- **Any key, any mode.** Choose the root on a piano keyboard and a mode: Ionian (major), Dorian, Phrygian, Lydian, Mixolydian, Aeolian (natural minor), Locrian, harmonic minor, melodic minor or Phrygian dominant. Notes are spelled correctly for the key (E♭ Dorian, not D♯ Dorian).
- **Progressions grounded in theory.** Each mode comes with well-known progressions — authentic and plagal cadences, ii–V–I, the Andalusian cadence, the circle of fifths, Pachelbel's canon, Dorian and Mixolydian vamps, the Phrygian half-step pull and more.
- **A branching map.** Progressions that share opening chords share nodes, so variations branch off exactly where they diverge. Arrows show the order of the chords.
- **Mood labels.** Every branch is labelled with its mood and name, e.g. *"Bittersweet, tender — borrowed iv from Aeolian"*, and every ending is named from the actual chords (*Authentic cadence · V → I*, *Deceptive cadence*, *Picardy third* …).
- **Endings that make sense.** Progressions that resolve show an arrow (or a small **R** node) back to the root. Ones that end elsewhere on purpose get a final barline — plus a dotted *could continue* line to where they would naturally go next.
- **Alter the root chord.** Triad, 7th, dominant 7th, sus2, sus4, 6, add9, diminished, augmented or power chord. Some unlock extra branches: a dominant-7th root adds blues and gospel moves, a suspended root adds its resolution, an augmented root adds the line cliché.
- **Borrowed chords.** Optionally branch every progression with chords borrowed from parallel modes (modal interchange): iv and ♭VI in major, Dorian's IV and harmonic minor's V in minor, the Neapolitan ♭II, and more. Borrowed chords are drawn with dashed borders and named after their source mode.
- **Triads or 7th chords.** Seventh chords take their 7th from the scale the chord actually comes from, so ♭VII in major becomes ♭VII7.
- **Listen.** Click a chord to hear it, right-click to play its whole progression, or press Space. The play panel shows each chord's notes as it sounds, with adjustable tempo.
- **Drag MIDI into your DAW.** Drag the **⠿ MIDI** button into Ableton, FL Studio, Reaper, Bitwig or any DAW that accepts MIDI files. You get the progression exactly as it plays: same voicings, your tempo, chord names as markers.
- **Phrases or loops.** Play and export a progression as a phrase (2 beats per chord, ending back on the root) or as a loop (1 bar per chord, padded to exactly 4 or 8 bars) that repeats seamlessly in your DAW.
- **Easy on your drive.** The dragged MIDI file is a short-lived temporary file that Windows keeps in memory and that is deleted a minute after the drop.
- **Native and light.** A ~3 MB executable that starts instantly and uses about 45 MB of RAM, with a title bar that matches the dark theme on Windows 11.

## Download

Get the latest version from the [Releases](../../releases) page:

| Platform | File |
| --- | --- |
| Windows 10/11 | `…_x64-setup.exe` (installer) or `…_x64-portable.zip` (just unzip and run) |
| macOS (Intel and Apple Silicon) | `….dmg` |
| Linux | `….AppImage` or `….deb` |

The builds aren't code-signed, so your system may warn on first launch:

- **Windows**: SmartScreen says "Windows protected your PC" → **More info** → **Run anyway**.
- **macOS**: right-click the app → **Open** → **Open**. If macOS says the app is damaged, run `xattr -dr com.apple.quarantine /Applications/Chordfinder.app` in Terminal.

## Using it

| Do this | To |
| --- | --- |
| **Style** dropdown | Switch genre: the whole map, tempo and chord colour change |
| Click a key on the piano | Change the root note |
| Click a mode | Change the mode |
| **Chords** section | Alter the root chord, switch triads / 7th chords, turn borrowed chords on |
| Click a chord | Hear that chord |
| Right-click a chord or a label | Play the whole progression |
| Space | Play / stop the selected progression |
| Hover a branch | Highlight its full path from the root |
| Drag **⠿ MIDI** | Drop the selected progression into your DAW |
| Ctrl + mouse wheel | Zoom the map |
| **Settings** section | Return-to-root style (arrow or R node), chord length (2 beats or 1-bar loop), detailed or compact view |

In the map, a solid arrow leads to the next chord, an **R** node or dashed arrow means *resolves to the root*, a `‖` bar means *ends here*, a dotted line means *could continue*, and a dashed border marks a borrowed chord.

## Building from source

Chordfinder is built with [Tauri 2](https://tauri.app): a Rust shell around a plain HTML/JS interface with no front-end build step and no npm dependencies.

**Requirements**

- Windows 10 or 11 with the Microsoft Edge WebView2 runtime (included with Windows 11)
- [Rust](https://rustup.rs) 1.77 or newer
- [Node.js](https://nodejs.org) 22 or newer — only for running the tests

**Build and run**

```bash
cargo build --release
```

The app is written to `target/release/chordfinder.exe`. For a debug build that opens straight away, use `cargo run`.

**Run the tests**

```bash
npm test
```

The tests check note spelling, chord building, every key × mode × option combination, the layout, the borrowed-chord rules, and the MIDI files byte by byte.

**Releases**

[`.github/workflows/build.yml`](.github/workflows/build.yml) builds Windows, macOS and Linux versions on GitHub Actions. Push a tag that matches `version` in `tauri.conf.json` (for example `v0.2.0`) to get a draft release with all files attached, or use **Run workflow** on the Actions tab for a test build.

## How it works

| File | What it does |
| --- | --- |
| `ui/theory.js` | The music theory: scales and spelling, chords from Roman numerals, the progression library, borrowed chords and cadence names |
| `ui/styles.js` | The genre styles: each one's progressions per mode and its defaults |
| `ui/graph.js` | Merges progressions into a branching tree and lays it out |
| `ui/midi.js` | Chord voicing (shared with the synth) and the MIDI file writer |
| `ui/audio.js` | A tiny Web Audio synth for previews |
| `ui/app.js`, `ui/index.html`, `ui/style.css` | The interface |
| `src/main.rs` | The native window, title-bar colours and the MIDI drag-out |

All the theory, layout and MIDI code is plain JavaScript without DOM access, so it runs and is tested in Node as-is.

Chords are written as Roman numerals relative to the major scale (`♭VI`, `♭VII`, `iv`, `V/V` …), the usual convention for modal and pop harmony. To add a progression, add a line to `LIBRARY` in `ui/theory.js` (or to a style in `ui/styles.js`) with its mood, name, chords and whether it resolves:

```js
p('Bittersweet, tender', 'Borrowed minor iv', ['IV', 'iv']),
```

## Platform support

Chordfinder is developed and tested on Windows. The interface itself is cross-platform, but dragging MIDI out of the app and the themed title bar are currently Windows-only.

## License

[MIT](LICENSE) © 2026 Sidar Talei
