// self-check.js — automated in-game self-test.
//
// Plays synthesized tones through the speakers so the game can calibrate itself
// and then complete a song without a human.
//
// Two ways to start it:
//   1. Query param (automation):
//        ?selftest=1        -> speakers only (true speaker -> microphone loopback)
//        ?selftest=virtual  -> speakers + tones injected straight into the analyser
//                              (deterministic; also works headless / without a mic)
//        &autostart=1       -> start without a click (needs permissive autoplay policy)
//        &song=<file.json>  -> pick a specific song (default: first for the instrument)
//   2. startSelfCheck(env, opts) from the UI — e.g. the "Self-test (auto-play)"
//      entry that script.js adds to the song dropdown. Defaults to speakers mode.

const LOW_TONE = 330;   // "low fret" reference (any stable pair an octave apart works)
const HIGH_TONE = 660;  // "high fret" reference
const GAIN = 0.8;

export function maybeStartSelfCheck(env) {
    const params = new URLSearchParams(location.search);
    if (!params.has('selftest')) return;

    const mode = params.get('selftest') || '1';
    const opts = {
        virtual: mode === 'virtual' || mode === 'both',
        song: params.get('song'),
    };

    if (params.has('autostart')) {
        setTimeout(() => startSelfCheck(env, opts), 500);
        return;
    }

    const btn = document.createElement('button');
    btn.textContent = '▶ Self-test';
    Object.assign(btn.style, {
        position: 'fixed', left: '8px', top: '8px', zIndex: 201,
        padding: '8px 12px', font: '14px sans-serif', cursor: 'pointer',
    });
    btn.addEventListener('click', () => { btn.remove(); startSelfCheck(env, opts); });
    document.body.appendChild(btn);
}

export function startSelfCheck(env, opts = {}) {
    const virtual = !!opts.virtual;
    const wantSong = opts.song || null;

    let startedAt = Date.now();
    const lines = [];
    const panel = document.createElement('div');
    panel.id = 'selfCheck';
    Object.assign(panel.style, {
        position: 'fixed', left: '8px', top: '8px', zIndex: 200,
        maxWidth: '48ch', padding: '6px 8px', borderRadius: '6px',
        background: 'rgba(0,0,0,0.78)', color: '#9f9', font: '12px/1.35 monospace',
        whiteSpace: 'pre-wrap', pointerEvents: 'none', opacity: 0.9,
    });
    document.body.appendChild(panel);

    function log(msg) {
        const t = ((Date.now() - startedAt) / 1000).toFixed(1);
        lines.push(`[${t}s] ${msg}`);
        if (lines.length > 200) lines.shift();
        panel.textContent = lines.join('\n');
        console.log('[self-check]', msg);
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function waitFor(pred, timeout, what) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) {
            if (pred()) return true;
            await sleep(50);
        }
        throw new Error(`timeout waiting for ${what}`);
    }

    async function run() {
        const ac = env.getAudioContext();
        if (!ac) throw new Error('no audio context');
        if (ac.state === 'suspended') { try { await ac.resume(); } catch { /* ignore */ } }

        await waitFor(() => env.getInstrument(), 8000, 'instrument');
        const instrument = env.getInstrument();

        // Put the tones exactly on FFT bin centers so the game's peak detector
        // sees a stable bin (off-center tones split across bins and break the
        // calibration stability check).
        const analyser = env.getAnalyser();
        const bin = (analyser && analyser.fftSize) ? ac.sampleRate / analyser.fftSize : 5.86;
        const lowTone = Math.max(1, Math.round(LOW_TONE / bin)) * bin;
        // Fret 1 -> fret 12 is 11 semitones (not a full octave), matching what a
        // real player presses, so the calibrated fret->frequency map stays
        // consistent with the on-neck feedback markers.
        const highTone = Math.max(1, Math.round((lowTone * Math.pow(2, 11 / 12)) / bin)) * bin;

        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = lowTone;
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ac.destination);                 // speakers
        if (virtual) gain.connect(env.getAnalyser()); // direct injection
        osc.start();
        const setFreq = (f) => {
            if (f && isFinite(f)) osc.frequency.setTargetAtTime(f, ac.currentTime, 0.01);
        };

        // Realistic plucks: short bursts separated by silence, like strumming a
        // string, instead of one continuous tone.
        const HOLD = 0.3, GAP = 0.2;
        const pluck = () => {
            const t = ac.currentTime;
            gain.gain.cancelScheduledValues(t);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(GAIN, t + 0.015);
            gain.gain.setValueAtTime(GAIN, t + HOLD - 0.08);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + HOLD);
        };
        let plucking = true;
        (async () => { while (plucking) { pluck(); await sleep((HOLD + GAP) * 1000); } })();

        log(`oscillator on (${virtual ? 'speakers + virtual' : 'speakers'}), bin=${bin.toFixed(2)} Hz, pluck ${HOLD}s+${GAP}s`);

        // --- 1. calibration ---
        const cal = instrument.calibration;
        const det = () => (document.getElementById('debugDetectedFrequency') || {}).textContent;
        async function waitCal(pred, timeout, what) {
            const t0 = Date.now();
            let last = 0;
            while (Date.now() - t0 < timeout) {
                if (pred()) return true;
                if (Date.now() - last > 1000) {
                    last = Date.now();
                    log(`${what}: det=${det()} state=${cal.calibrationState} low=${cal.lowFrequencies.length} high=${cal.highFrequencies.length}`);
                }
                await sleep(100);
            }
            throw new Error(`timeout waiting for ${what}`);
        }
        if (cal && typeof cal.isCalibrationComplete === 'function' && !cal.isCalibrationComplete()) {
            log(`calibration: low tone ${lowTone.toFixed(1)} Hz`);
            setFreq(lowTone);
            await waitCal(() => cal.calibrationState !== 'lowFret1', 25000, 'low calibration');
            log(`calibration: high tone ${highTone.toFixed(1)} Hz`);
            setFreq(highTone);
            await waitCal(() => cal.isCalibrationComplete(), 25000, 'high calibration');
            log('calibration: complete');
        } else {
            log('calibration: not required');
        }

        // --- 2. pick a song ---
        const songSelect = document.getElementById('songSelect');
        if (songSelect && !env.getGame()) {
            const opts = Array.from(songSelect.options).filter((o) => o.value && o.value.charAt(0) !== '_');
            const opt = (wantSong && opts.find((o) => o.value === wantSong)) || opts[0];
            if (!opt) throw new Error('no songs for this instrument');
            log('song: ' + decodeURIComponent(opt.value));
            songSelect.value = opt.value;
            songSelect.dispatchEvent(new Event('change'));
        }

        await waitFor(() => { const g = env.getGame(); return g && g.isPlaying; }, 15000, 'game start');
        log('game: playing');

        // --- 3. play the song to the end ---
        const gameArea = env.getGameArea();
        const t0 = Date.now();
        let lastId = null;
        while (Date.now() - t0 < 240000) {
            const g = env.getGame();
            if (!g || !g.isPlaying) break;
            const target = pickTarget(g, instrument, gameArea);
            if (target && target.freq) {
                setFreq(target.freq);
                if (target.id !== lastId) {
                    log(`note ${target.id} -> ${target.freq.toFixed(1)} Hz`);
                    lastId = target.id;
                }
            }
            await sleep(50);
        }
        try { osc.stop(); } catch { /* ignore */ }
        log('game: finished OK');
        panel.style.color = '#8f8';
    }

    // Pick the active note closest to the instrument deck (i.e. inside the
    // game's match window) and return its expected frequency.
    function pickTarget(game, instrument, gameArea) {
        const notes = game.activeNotes || [];
        const hit = game.hitThreshold || 50;
        let best = null;
        for (const n of notes) {
            const rect = n.element.getBoundingClientRect();
            const dist = rect.bottom - game.deckPosition;
            if (dist > -hit && dist < gameArea.offsetHeight) {
                if (!best || Math.abs(dist) < Math.abs(best.dist)) best = { id: n.id, dist };
            }
        }
        if (!best) return null;
        return { id: best.id, freq: instrument.getExpectedFrequency(parseInt(best.id, 10)) };
    }

    return (async () => {
        startedAt = Date.now();
        window.__selfCheckRunning = true;
        try {
            await run();
            window.__selfCheckDone = true;
            return true;
        } catch (e) {
            window.__selfCheckFailed = true;
            window.__selfCheckError = e.message;
            log('FAIL: ' + e.message);
            panel.style.color = '#f88';
            return false;
        } finally {
            window.__selfCheckRunning = false;
        }
    })();
}
