# Kanban

Types: IDEA, TODO, FIX. Priority: 1 = highest, 5 = lowest. `P2*` = priority inferred by Claude.

## Backlog

- [ ] **P2\*** · IDEA — Guitar view: Advanced option in Options ▾ that adds overlays to the same neck _(2026-11-16)_
  - Keeps the beginner page clean (CLAUDE.md goal: concise overview, not a full method)
  - New persisted flag in `state` (app.js); bump `STATE_VERSION` only if a default changes
  - Container for the guide-tone, arpeggio and voicing entries below
- [ ] **P2\*** · IDEA — Guitar view: guide-tone line on the neck _(2026-11-16)_
  - Reuse `guideLine` from `ui/horn.js` (3rd + 7th, nearest-tone motion); limit to the chosen position (`state.gPos`)
  - Could also feed the progression staff/tab (`guitarStaves`) instead of shapes/roots
- [ ] **P2\*** · IDEA — Guitar view: arpeggios per chord inside a position _(2026-11-16)_
  - Combine `chordLayer` (ui/horn.js) with `scalePositions` (ui/guitar.js); chord tones already shown when `gFocus` is set, but not per position as a run
  - Play could walk the arpeggio like Play scale walks the position
- [ ] **P2\*** · IDEA — Start on: let the user pick which chord a progression starts from (play panel). Loops rotate in Play/MIDI (same chords, different feel); resolving progressions can drop the opening tonic so I only arrives at the end (ii–V–I as ii V I). Graph stays tonic-centred. _(2026-11-16)_
  - Rotate in `sequenceFor()` (ui/app.js), which feeds both Play and MIDI, so they keep matching
  - Library chord lists omit the tonic (`p(..., ['ii', 'V'])` = I ii V); the start choice applies to `[tonic, ...branch]`
  - `length: 'phrase'` adds a closing root when resolving; `'loop'` pads to 4 bars. Decide how each mode treats a rotated start
  - Per-branch, not persisted? Branch ids are template indexes (survive parallel shift), so `start` could key off them
- [ ] **P3\*** · IDEA — Guitar view: triads and inversions on string sets _(2026-11-16)_
  - String sets 1-2-3, 2-3-4, 3-4-5; voice-lead per set with the `voiceLead` DP in ui/guitar.js
  - Needs a voicing generator outside the current rules (root in bass, ≤ 4 fingers)
- [ ] **P3\*** · IDEA — Guitar view: drop-2 / drop-3 and shell voicings for 7th chords _(2026-11-16)_
  - Shells = root–3–7 on low strings; drop-2 on top four strings
  - Could be a third Shapes option next to Easiest | Close together (`state.gVoice`)
- [ ] **P3\*** · IDEA — Play/MIDI using the guitar voicings when the Guitar toggle is on _(2026-11-16)_
  - Already listed as a later option in CLAUDE.md; `sequenceFor()` in app.js feeds both playback and MIDI, voicings come from `voiceChord` (midi.js)
- [ ] **P4\*** · IDEA — Guitar view: alternate tunings and capo _(2026-11-16)_
  - `FRETTED` assumes standard tuning; `OPEN_SHAPES` would need per-tuning tables or be skipped off-standard
  - Capo: shift fret 0 and relabel; tests in tests/guitar.test.js assume standard
- [ ] **P4\*** · IDEA — Guitar practice: mic-checked drills (play the asked guide/chord tone over the backing) _(2026-11-16)_
  - Model on the sax "Play it back" exercise; mic via `startMic` (ui/mic.js), tracker in ui/pitch.js
  - Native mic still untested
- [ ] **P4\*** · IDEA — Guitar practice: interval and shape drills (e.g. find the ♭7 within two frets) _(2026-11-16)_
  - Add to `FRET_DRILLS` / `makeFretQuestion` in ui/fretquiz.js; scores keyed `g<drill>:<instrument>:<level>`

## To Do

## Doing

## Done
