# AGENTS.md

Paganini Ukulele: a static browser game that teaches ukulele/piano/sax by ear via a falling-notes UI and live microphone pitch detection. Vanilla JS ES modules, **no package.json, no build, no tests, no linter**. Published on GitHub Pages at https://krivich.github.io/paganini/ (remote `Krivich/paganini`, branch `master`).

## Run / verify
- Serve over HTTP, never open `index.html` as `file://` — ES modules, `fetch('./songs/...')`, and `getUserMedia` all require an HTTP/secure context. E.g. `python -m http.server 8000` from repo root, then open `http://localhost:8000/`.
- Entrypoint: `index.html` -> `script.js` (`<script type="module">`). No bundling or codegen; files load by relative path.
- Manual check: pick instrument, grant mic, calibrate (play fret 1, then fret 12, until each reaches 3 stable samples), pick a song. Debug values render in `#debugInfo` (`debugDetectedFrequency`, `debugTargetNoteId`, `debugExpectedFrequency`).
- Deploy = push `master`; GitHub Pages serves this directory as-is, no build step.

## Architecture (non-obvious)
- `script.js` is the orchestrator: mic + `AudioContext`, a one-time background-noise measurement (1.5 s average), then per-frame pitch detection. Detection here is a raw FFT peak: the largest byte bin in the lower half of the spectrum, with a crude half-bin octave correction. A frequency is only processed when `maxAmplitude > backgroundVolumeThreshold * 1.5`. (No autocorrelation/HPS in this revision.)
- `Game` (`game.js`) spawns falling note elements into `#gameArea`; the leading note **freezes** the game at the instrument "deck" (`Instrument.getDeckTop()`), and a correct note triggers `shiftActiveNotes`. Matching uses `instrument.getExpectedFrequency(noteId)` and `instrument.calculateFrequencyDelta(noteId)`.
- `instrument-factory.js` maps `ukulele|piano|saxophone` -> classes. The `Instrument` base contract is `draw`, `getNotePosition`, `getExpectedFrequency`, `calculateFrequencyDelta`, `getDeckTop`. Add a new instrument by implementing it, registering it in the factory **and** the `<select>` in `index.html`.
- Calibration is duplicated per instrument: `UkuleleCalibration` (`ukulele-calibration.js`) extends `Calibratable` and is self-contained — states `lowFret1` -> `highFret1` -> `completed`, measures frets 1 and 12, extrapolates frets 0 and 13. `Piano` currently uses `NoCalibration`. `calibration.js` exports a legacy `Calibration` class that **nothing imports**; it still references a non-existent `#startButton`.
- `Calibratable` (`calibratable.js`) is a separate interface (not a base of `Calibration`) with `startCalibration/handleAudioInput/isCalibrationComplete/getCalibrationData/resetCalibration`; `script.js` dispatches through `currentInstrument.calibration`.
- Songs: `songs/songlist.json` maps filenames to instruments; each song is `{ title, instruments, data }` where `data` is a flat array of 1-based note IDs (fret for ukulele, key number for piano). Song filenames are Cyrillic — keep them byte-identical and register new songs in `songlist.json`. `Кузнечик.json` and `Пираты-Карибского-моря.json` are tracked but missing from `songlist.json`, so they never appear in the UI.

## Self-check
- `self-check.js` (started from `script.js`) automates a full playthrough: it drives an `OscillatorNode` to auto-pass calibration and then plays each target note's expected frequency until the song ends (`Finished!`).
- Enable via query params on the served URL: `?selftest=1` (speakers -> mic loopback), `?selftest=virtual` (also injects the tone straight into the analyser — deterministic, works headless/without a mic), `&autostart=1` (skip the click; needs a permissive autoplay policy), `&song=<file>.json` (default: first song for the instrument). State is exposed on `window.__selfCheckRunning/__selfCheckDone/__selfCheckFailed`.
- While `?selftest` is set, `script.js` requests the mic with `echoCancellation/noiseSuppression/autoGainControl` disabled so the routed tone is not cancelled.
- Gotcha: the FFT peak detector's half-bin octave correction can flip a clean tone to half its frequency, which breaks the calibration stability window. Self-check needs a clean, stable tone; in Chrome, feed the fake mic silence (`--use-file-for-fake-audio-capture`) so it does not add its own tone.

## Known gaps / gotchas
- Saxophone is a stub: `saxophone.js` returns a fixed 440 Hz and a rough 1–8 note map. Its `NoCalibration` implements the calibration interface as no-ops, so it loads without throwing.
- Piano is fixed at 44 keys starting at octave 3; there is no calibration-driven keyboard layout in this revision.
- `anzlyzer/` (misspelled) is a standalone pitch-detection debug page (`analyzer-debug.html` + `frequency_analyzer.js`) comparing FFT / HPS / autocorrelation against the live spectrum. Not part of the game or referenced by it.
- `copy.bat` (root and `anzlyzer/`) concatenates all `.js`/`.html`/`.css` into `combined_output.txt` for pasting into an LLM. `combined_output.txt`, `out.txt` (empty), `project.txt`, `qwen_context.txt` are local AI-context scratch, not app code. There is no `.gitignore`, so these appear untracked.
- `ANDROID_PROJECTOR_NOTES.md` (Russian) documents running the deployed game on an Android projector with a USB mic, including `adb` steps.

## Conventions
- ES modules with `export class`; relative imports include the `.js` extension.
- UI strings and console logs are English; code comments are mixed English/Russian.
