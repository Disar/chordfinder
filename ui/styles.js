// Genre styles. Each one replaces the progression library with chords that
// are idiomatic for the genre, and sets defaults that fit it.
//
// Same token rules as theory.js: Roman numerals relative to the major
// scale, case = triad, "°"/"+"/"ø" marks, extensions 7, maj7, 9, maj9,
// 7sus4, 6, sus2, sus4, add9, 5 (power chord), secondary "X/Y". The first
// progression per mode is the main line. end 'resolve' returns to the root
// (for loop styles: the loop restarts), 'open' finishes elsewhere.
//
// defaults: color 'triad' | 'seventh', bpm, length 'phrase' (2 beats per
// chord, ends back on the root) | 'loop' (1 bar per chord, seamless loop),
// and optionally the root-chord modifier.

const R = 'resolve', O = 'open';
const p = (mood, name, chords, end = R) => ({ mood, name, chords, end });

export const GENRE_STYLES = [
  {
    id: 'pop', name: 'Pop', blurb: 'Singalong four-chord songs and ballads',
    defaults: { color: 'triad', bpm: 100, length: 'loop' },
    library: {
      ionian: [
        p('Anthemic, singalong', 'Four-chord pop (I–V–vi–IV)', ['V', 'vi', 'IV']),
        p('Heartfelt ballad', 'Ballad descent', ['V', 'vi', 'iii', 'IV']),
        p('Nostalgic, sweet', '50s progression', ['vi', 'IV', 'V']),
        p('Wistful, driving', 'I–vi–V–IV', ['vi', 'V', 'IV']),
        p('Hopeful, building', 'I–IV–vi–V', ['IV', 'vi', 'V']),
        p('Hopeful, unfinished', 'Lands on vi', ['IV', 'V', 'vi'], O),
        p('Tender, bittersweet', 'Minor iv turn', ['IV', 'iv']),
        p('Bright, carefree', 'Three-chord pop', ['IV', 'I', 'V']),
        p('Smooth, modern', 'ii–IV–V', ['ii', 'IV', 'V']),
        p('Dramatic lift', 'I–III–vi–IV', ['V/vi', 'vi', 'IV']),
      ],
      aeolian: [
        p('Moody, emotional', 'Minor four-chord loop', ['bVI', 'bIII', 'bVII']),
        p('Uplifting minor', '♭VI–♭VII lift', ['bVI', 'bVII']),
        p('Driving, defiant', 'Minor rock-pop vamp', ['bVII', 'bVI', 'bVII']),
        p('Brooding, cinematic', 'iv–♭VI–♭VII', ['iv', 'bVI', 'bVII']),
        p('Melancholic, reflective', '♭III–♭VII–iv', ['bIII', 'bVII', 'iv']),
      ],
      mixolydian: [
        p('Feel-good, summery', 'I–♭VII–IV', ['bVII', 'IV']),
        p('Laid-back, breezy', 'I–IV–♭VII', ['IV', 'bVII']),
        p('Sunny, easygoing', 'I–v–IV', ['v', 'IV']),
      ],
      dorian: [
        p('Warm, funky', 'i–♭III–IV', ['bIII', 'IV']),
        p('Groovy, soulful', 'i–IV vamp', ['IV']),
        p('Cool, confident', 'i–♭VII–IV', ['bVII', 'IV']),
      ],
    },
  },
  {
    id: 'edm', name: 'EDM', blurb: 'Trance, progressive and big-room loops',
    defaults: { color: 'triad', bpm: 128, length: 'loop' },
    library: {
      aeolian: [
        p('Euphoric, anthemic', 'Trance / progressive house loop', ['bVI', 'bIII', 'bVII']),
        p('Triumphant festival drop', 'Big-room lift', ['bVI', 'bVII']),
        p('Moody, rolling', '♭VI–♭VII–v', ['bVI', 'bVII', 'v']),
        p('Melancholic, deep', '♭VI–iv–♭VII', ['bVI', 'iv', 'bVII']),
        p('Driving, relentless', 'Rising minor vamp', ['bVII', 'bVI', 'bVII']),
        p('Emotional, soaring', 'Melodic-dubstep loop', ['bIII', 'bVII', 'bVI']),
        p('Minimal, hypnotic', 'Two-chord techno vamp', ['iv']),
        p('Building tension', 'Pre-drop climb', ['iv', 'bVI', 'bVII']),
        p('Dark, hypnotic', 'Minor-dominant loop', ['v', 'bVI', 'iv']),
      ],
      ionian: [
        p('Uplifting, big-room', 'Progressive house anthem', ['V', 'vi', 'IV']),
        p('Bright, euphoric', 'I–vi–IV–V', ['vi', 'IV', 'V']),
        p('Sunny tropical house', 'I–IV–vi–V', ['IV', 'vi', 'V']),
        p('Festival singalong', 'I–IV–V', ['IV', 'V']),
      ],
      dorian: [
        p('Deep, groovy', 'Deep-house Dorian vamp', ['IV']),
        p('Funky, warm', 'Nu-disco i–♭VII–IV', ['bVII', 'IV']),
        p('Soulful, rolling', 'i–♭III–IV', ['bIII', 'IV']),
      ],
      phrygian: [
        p('Dark, menacing', 'Techno half-step', ['bII']),
        p('Hard, aggressive', 'Hardstyle riff', ['bII', 'bIII', 'bII']),
        p('Ominous, warehouse', '♭VI–♭II', ['bVI', 'bII']),
      ],
    },
  },
  {
    id: 'kawaii', name: 'Kawaii future bass', blurb: 'Sparkly 7ths and 9ths, J-pop chord moves',
    defaults: { color: 'seventh', bpm: 160, length: 'loop' },
    library: {
      ionian: [
        p('Sparkly, bittersweet', 'Royal Road progression', ['IVmaj7', 'V', 'iii7', 'vi7']),
        p('Nostalgic anime ending', 'Royal Road with ii–V', ['IVmaj7', 'V', 'iii7', 'vi7', 'ii7', 'V']),
        p('Wistful, unfinished', 'IV–V–vi', ['IVmaj7', 'V', 'vi7'], O),
        p('Tender, glittery', 'Minor-iv sparkle', ['IVmaj7', 'iv7']),
        p('Smooth, dreamy', 'Just the Two of Us progression', ['IVmaj7', 'V7/vi', 'vi7', 'v7']),
        p('Cute, hopeful', 'Sus build', ['vi7', 'IVmaj7', 'V7sus4', 'V']),
        p('Sweet, cascading', 'Circle turnaround', ['iii7', 'vi7', 'ii7', 'V']),
        p('Heart-on-sleeve', 'IV–III7–vi', ['IVmaj9', 'V7/vi', 'vi9']),
      ],
      lydian: [
        p('Floating, magical', 'Lydian I–II', ['IIadd9', 'vi7']),
        p('Dreamy, weightless', 'II–iii–II', ['IIadd9', 'iii7', 'IIadd9']),
        p('Wide-eyed, cinematic', 'V–II', ['Vmaj9', 'IIadd9']),
      ],
    },
  },
  {
    id: 'lofi', name: 'Lo-fi / neo-soul', blurb: 'Mellow 7ths and 9ths, jazzy loops',
    defaults: { color: 'seventh', bpm: 80, length: 'loop' },
    library: {
      ionian: [
        p('Cozy, late-night', 'I–vi–ii–V turnaround', ['vi7', 'ii7', 'V7']),
        p('Smooth, jazzy', 'ii–V–I', ['ii7', 'V7']),
        p('Rainy-day nostalgia', 'iii–vi–ii–V', ['iii7', 'vi7', 'ii9', 'V9']),
        p('Warm, reflective', 'IV–iii–vi', ['IVmaj7', 'iii7', 'vi7']),
        p('Bittersweet, hazy', 'Minor-iv sigh', ['IVmaj9', 'iv9']),
        p('Smooth city-pop', 'Just the Two of Us progression', ['IVmaj7', 'V7/vi', 'vi7', 'v7']),
        p('Soulful, mellow', 'Backdoor progression', ['iv7', 'bVII9']),
      ],
      dorian: [
        p('Hazy, head-nodding', 'Dorian i–IV vamp', ['IV9']),
        p('Smoky, late-night', 'i–IV–v', ['IV9', 'v7']),
        p('Floating, introspective', 'i–♭VII loop', ['bVIImaj7']),
        p('Mellow, glowing', 'i–♭III–IV', ['bIIImaj7', 'IV9']),
      ],
      aeolian: [
        p('Melancholy, rainy', 'Minor 7th loop', ['bVI', 'bIII', 'bVII']),
        p('Warm, nostalgic', 'iv9–♭VII9', ['iv9', 'bVII9']),
        p('Dusty, reflective', 'iv–v sway', ['iv', 'v']),
        p('Gloomy, slow', '♭VI–v', ['bVI', 'v']),
        p('Noir, jazzy', 'Minor ii–V', ['ii°', 'V']),
      ],
    },
  },
  {
    id: 'rock', name: 'Rock', blurb: 'Riffs, power chords and arena anthems',
    defaults: { color: 'triad', bpm: 120, length: 'loop' },
    library: {
      ionian: [
        p('Classic, driving', 'Three-chord rock', ['IV', 'V']),
        p('Garage, energetic', 'I–IV–I–V', ['IV', 'I', 'V']),
        p('Swaggering, anthemic', 'I–♭VII–IV', ['bVII', 'IV']),
        p('Raw, bluesy', 'I–V–IV', ['V', 'IV']),
        p('Arena-rock anthem', 'I–V–vi–IV', ['V', 'vi', 'IV']),
        p('Gritty, garage', 'I–♭III–IV', ['bIII', 'IV']),
        p('Heroic, arena', '♭VI–♭VII–I', ['bVI', 'bVII']),
      ],
      mixolydian: [
        p('Swaggering riff rock', 'I–♭VII–IV', ['bVII', 'IV']),
        p('Heavy, riff-driven', 'Power-chord riff', ['bVII5', 'IV5']),
        p('Bluesy groove', 'I–IV–♭VII', ['IV', 'bVII']),
        p('Southern, laid-back', 'I–v–IV', ['v', 'IV']),
      ],
      aeolian: [
        p('Driving, defiant', 'Minor rock vamp', ['bVII', 'bVI', 'bVII']),
        p('Dramatic, desert rock', 'Andalusian descent', ['bVII', 'bVI', 'V']),
        p('Epic, soaring', '♭VI–♭VII–i', ['bVI', 'bVII']),
        p('Heavy, chugging', 'Power-chord climb', ['bVI5', 'bVII5']),
        p('Dark, moody', 'iv–♭VII', ['iv', 'bVII']),
        p('Brooding power ballad', '♭III–♭VII–iv', ['bIII', 'bVII', 'iv']),
      ],
      dorian: [
        p('Funky, swaggering', 'Dorian rock vamp', ['IV']),
        p('Classic-rock jam', 'i–♭VII–IV', ['bVII', 'IV']),
      ],
    },
  },
  {
    id: 'blues', name: 'Blues', blurb: '12-bar and 8-bar forms with dominant 7ths',
    defaults: { color: 'seventh', bpm: 90, length: 'loop' },
    library: {
      mixolydian: [
        p('Gritty, classic', '12-bar blues', ['I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']),
        p('Hypnotic, swampy', 'One-four boogie vamp', ['IV7']),
        p('Lively, shuffling', 'Quick-change 12-bar', ['IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']),
        p('Smoky, sophisticated', 'Jazz-blues turnaround', ['IV7', 'I7', 'V7/ii', 'ii7', 'V7']),
        p('Churchy, gospel-blues', 'IV7–♯iv°7–I', ['IV7', '#iv°7']),
        p('Shuffling turnaround', 'I–V–IV', ['V7', 'IV7']),
        p('Soulful, aching', '8-bar blues', ['V7', 'IV7', 'IV7', 'I7', 'V7', 'I7', 'V7']),
      ],
      dorian: [
        p('Moody, late-night', 'Minor 12-bar blues', ['i7', 'i7', 'i7', 'iv7', 'iv7', 'i7', 'i7', 'bVI7', 'V7', 'i7', 'V7']),
        p('Dark, hypnotic', 'Minor blues vamp', ['iv7']),
        p('Brooding, slow', 'i–iv–v', ['iv7', 'v7']),
      ],
    },
  },
  {
    id: 'jazz', name: 'Jazz', blurb: 'ii–V–Is, turnarounds and substitutions',
    defaults: { color: 'seventh', bpm: 120, length: 'phrase' },
    library: {
      ionian: [
        p('Smooth, sophisticated', 'ii–V–I', ['ii7', 'V7']),
        p('Slinky, chromatic', 'Tritone substitution', ['ii7', 'bII7']),
        p('Wistful surprise', 'Deceptive ii–V', ['ii7', 'V7', 'vi7'], O),
        p('Swinging, classic', 'I–vi–ii–V', ['vi7', 'ii7', 'V7']),
        p('Elegant, cascading', 'iii–vi–ii–V', ['iii7', 'vi7', 'ii7', 'V7']),
        p('Bright, bouncing', 'I–VI7–ii–V', ['V7/ii', 'ii7', 'V7']),
        p('Mellow, soulful', 'Backdoor ii–V', ['iv7', 'bVII7']),
        p('Lush, passing', 'IV–♯iv°7–I', ['IVmaj7', '#iv°7']),
      ],
      dorian: [
        p('Cool, modal', 'Modal i–IV vamp', ['IV7']),
        p('Floating, modal', 'i–ii–♭III', ['ii7', 'bIIImaj7']),
      ],
      harmonic: [
        p('Dark, noir', 'Minor ii–V–i', ['iiø7', 'V7']),
        p('Bittersweet, smoky', '♭VI–ii–V', ['bVImaj7', 'iiø7', 'V7']),
        p('Moody, classic', 'iv–V–i', ['iv7', 'V7']),
        p('Autumnal, cascading', 'Minor circle of fifths', ['iv7', 'bVII7', 'bIIImaj7', 'bVImaj7', 'iiø7', 'V7']),
      ],
      melodic: [
        p('Modern, sophisticated', 'Jazz-minor ii–V', ['ii7', 'V7']),
        p('Bright, mysterious', 'Lydian-dominant IV7', ['IV7']),
      ],
    },
  },
  {
    id: 'cinematic', name: 'Cinematic', blurb: 'Epic film-score progressions and mediants',
    defaults: { color: 'triad', bpm: 90, length: 'loop' },
    library: {
      aeolian: [
        p('Epic, heroic', 'Epic minor loop', ['bVI', 'bIII', 'bVII']),
        p('Triumphant, soaring', 'Aeolian cadence', ['bVI', 'bVII']),
        p('Tragic, grand', '♭VI–iv–V', ['bVI', 'iv', 'V']),
        p('Dramatic tension', 'iv–♭VI–V', ['iv', 'bVI', 'V']),
        p('Mysterious, otherworldly', 'Chromatic mediant (minor ♭vi)', ['bvi']),
        p('Heroic shock', 'Chromatic mediant (major III)', ['III']),
      ],
      lydian: [
        p('Wondrous, magical', 'Lydian I–II', ['II']),
        p('Floating, dreamlike', 'II–iii–II', ['II', 'iii', 'II']),
        p('Awe, discovery', 'V–II', ['V', 'II']),
      ],
      dorian: [
        p('Noble, hopeful', 'i–♭III–IV', ['bIII', 'IV']),
        p('Adventurous, open', 'i–IV–♭VII', ['IV', 'bVII']),
      ],
      harmonic: [
        p('Ominous, dramatic', 'iv–V–i', ['iv', 'V']),
        p('Dark, operatic', '♭VI–V', ['bVI', 'V']),
        p('Suspense, mystery', 'Augmented ♭III', ['bIII+', 'iv', 'V']),
      ],
      phrygian: [
        p('Menacing, epic', 'Phrygian threat', ['bII']),
        p('Ancient, ominous', '♭VI–♭II', ['bVI', 'bII']),
      ],
    },
  },
  {
    id: 'synthwave', name: 'Synthwave', blurb: 'Neon 80s minor loops and night drives',
    defaults: { color: 'triad', bpm: 100, length: 'loop' },
    library: {
      aeolian: [
        p('Neon, nostalgic', 'Retro minor lift', ['bVI', 'bVII']),
        p('Brooding, cyberpunk', '♭VI–♭VII–v', ['bVI', 'bVII', 'v']),
        p('Night-drive, melancholic', 'Minor axis', ['bVI', 'bIII', 'bVII']),
        p('Outrun, driving', 'Rising minor vamp', ['bVII', 'bVI', 'bVII']),
        p('Dreamy, 80s', '♭III–♭VII–♭VI', ['bIII', 'bVII', 'bVI']),
        p('Lush, romantic', '♭VImaj7–♭VII', ['bVImaj7', 'bVII']),
      ],
      dorian: [
        p('Cool, sleek', 'i–IV vamp', ['IV']),
        p('Sunset, warm', 'i–♭VII–IV', ['bVII', 'IV']),
      ],
      ionian: [
        p('Arena 80s', 'I–V–vi–IV', ['V', 'vi', 'IV']),
        p('Bright, retro', 'I–IVmaj7–V', ['IVmaj7', 'V']),
      ],
    },
  },
  {
    id: 'jpop', name: 'J-pop / anime', blurb: 'Royal Road, Komuro and anime chorus moves',
    defaults: { color: 'triad', bpm: 140, length: 'loop' },
    library: {
      ionian: [
        p('Bittersweet, soaring', 'Royal Road progression', ['IVmaj7', 'V', 'iii7', 'vi']),
        p('Climactic chorus', 'Royal Road with ii–V', ['IVmaj7', 'V', 'iii7', 'vi', 'ii7', 'V']),
        p('Smooth city-pop', 'Just the Two of Us progression', ['IVmaj7', 'V7/vi', 'vi7', 'v7']),
        p('Earnest, youthful', 'Komuro progression', ['vi', 'IV', 'V']),
        p('Emotional climax', 'IV–V–vi', ['IV', 'V', 'vi'], O),
        p('Dramatic, heartfelt', 'IV–III7–vi', ['IV', 'V7/vi', 'vi']),
        p('Nostalgic, graduation', 'Canon progression', ['V', 'vi', 'iii', 'IV', 'I', 'IV', 'V']),
      ],
      aeolian: [
        p('Heroic, determined', 'Anime battle lift', ['bVI', 'bVII']),
        p('Hopeful resolve', 'Ends on the relative major', ['bVI', 'bVII', 'bIII'], O),
        p('Tense, dramatic', 'iv–V–i', ['iv', 'V']),
        p('Tragic, intense', '♭VI–V', ['bVI', 'V']),
      ],
    },
  },
  {
    id: 'gospel', name: 'Gospel', blurb: 'Churchy passing chords and amen cadences',
    defaults: { color: 'seventh', bpm: 75, length: 'phrase' },
    library: {
      ionian: [
        p('Churchy, uplifting', 'IV–♯iv°7–I', ['IV', '#iv°7']),
        p('Tender, amen', 'Minor-iv amen cadence', ['IV', 'iv6']),
        p('Shout, joyful', 'I–I7–IV–♯iv°7', ['V7/IV', 'IV', '#iv°7']),
        p('Soulful, rising', 'I–III7–vi–ii–V', ['V7/vi', 'vi7', 'ii7', 'V7']),
        p('Walking, joyful', 'Gospel walk-up', ['iii7', 'V7/ii', 'ii7', 'V7']),
        p('Warm, resolved', 'ii–V–I', ['ii7', 'V7']),
      ],
      mixolydian: [
        p('Praise break, driving', 'I–IV7 vamp', ['IV7']),
        p('Celebratory', 'I–♭VII–IV', ['bVII', 'IV']),
      ],
    },
  },
  {
    id: 'metal', name: 'Metal', blurb: 'Power chords, Phrygian and tritone riffs',
    defaults: { color: 'triad', bpm: 160, length: 'loop', modifier: '5' },
    library: {
      phrygian: [
        p('Crushing, menacing', 'Phrygian half-step chug', ['bII5']),
        p('Aggressive, galloping', '♭II–♭III–♭II', ['bII5', 'bIII5', 'bII5']),
        p('Doom, ominous', '♭VI–♭II', ['bVI5', 'bII5']),
        p('Brooding, heavy', 'iv–♭II', ['iv5', 'bII5']),
      ],
      aeolian: [
        p('Epic, power-metal', '♭VI–♭VII–i', ['bVI5', 'bVII5']),
        p('Heroic, soaring', 'Ends on the relative major', ['bVI5', 'bVII5', 'bIII5'], O),
        p('Driving, headbanging', 'Rising minor riff', ['bVII5', 'bVI5', 'bVII5']),
        p('Dramatic, menacing', 'iv–♭VI–V', ['iv5', 'bVI5', 'V5']),
      ],
      phrygdom: [
        p('Exotic, menacing', 'Phrygian-dominant riff', ['bII5']),
        p('Neoclassical shred', '♭II–♭vii–♭II', ['bII5', 'bVII5', 'bII5']),
        p('Sinister, middle-eastern', 'iv–♭II', ['iv5', 'bII5']),
      ],
      locrian: [
        p('Dissonant, chaotic', 'Locrian half-step', ['bII5']),
        p('Unholy, unresolved', 'Tritone hang', ['bII5', 'bV5'], O),
        p('Evil, tritone', 'Tritone riff', ['bV5']),
      ],
      harmonic: [
        p('Neoclassical, dramatic', '♭VI–V', ['bVI5', 'V5']),
        p('Exotic, intense', 'Neapolitan ♭II–V', ['bII5', 'V5']),
        p('Dark, classical', 'iv–V', ['iv5', 'V5']),
      ],
    },
  },
  {
    id: 'flamenco', name: 'Flamenco', blurb: 'Andalusian cadences and Phrygian fire',
    defaults: { color: 'triad', bpm: 120, length: 'loop' },
    library: {
      phrygdom: [
        p('Passionate, fiery', 'Andalusian cadence', ['iv', 'bIII', 'bII']),
        p('Rhythmic, intense', 'Flamenco half-step', ['bII']),
        p('Driving, rasgueado', '♭II–♭III–♭II', ['bII', 'bIII', 'bII']),
        p('Brooding, soulful', 'iv–♭II', ['iv', 'bII']),
        p('Proud, majestic', '♭VI–♭II', ['bVI', 'bII']),
      ],
      aeolian: [
        p('Passionate, Spanish', 'Andalusian cadence (i–♭VII–♭VI–V)', ['bVII', 'bVI', 'V']),
        p('Dramatic, sorrowful', 'iv–V', ['iv', 'V']),
        p('Fierce, dramatic', '♭VI–V', ['bVI', 'V']),
      ],
      harmonic: [
        p('Smoky, dramatic', 'iv–V–i', ['iv', 'V']),
        p('Exotic, intense', 'Neapolitan ♭II–V', ['bII', 'V']),
        p('Sorrowful, intense', '♭VI–V', ['bVI', 'V']),
      ],
    },
  },
];
