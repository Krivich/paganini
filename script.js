import { Game } from './game.js';
import { InstrumentFactory } from './instrument-factory.js?v=2';
import { maybeStartSelfCheck, startSelfCheck } from './self-check.js?v=1';
import { detectYin } from './pitch-detector.js?v=3';
import { SpectrumStrip } from './spectrum.js';
import { magnitudeSpectrum, subtractBackground } from './spectral-subtract.js?v=1';

document.addEventListener('DOMContentLoaded', async () => {
    const instrumentArea = document.getElementById('instrumentArea');
    const gameArea = document.getElementById('gameArea');
    const feedbackDiv = document.getElementById('feedback');
    const calibrationDiv = document.getElementById('calibration');
    const calibrationHint = document.getElementById('calibrationHint');
    const calibrationProgressBar = document.getElementById('calibrationProgressBar');
    const debugCalibrationState = document.getElementById('debugCalibrationState');
    const debugDetectedFrequency = document.getElementById('debugDetectedFrequency');
    const debugLevel = document.getElementById('debugLevel');
    const debugTargetNoteId = document.getElementById('debugTargetNoteId');
    const debugExpectedFrequency = document.getElementById('debugExpectedFrequency');
    const songSelect = document.getElementById('songSelect');
    const instrumentSelect = document.getElementById('instrumentSelect');
    const overlay = document.getElementById('overlay');
    const overlayContent = document.getElementById('overlay-content');
    const controlsDiv = document.getElementById('controls');
    const debugInfo = document.getElementById('debugInfo');
    const debugToggle = document.getElementById('debugToggle');
    const spectrumCanvas = document.getElementById('spectrum');
    const playHint = document.getElementById('playHint');

    // --- Detailed detection log (request: super-detailed per-frame logging) ---
    // Enable with ?detlog=1. The log is NOT drawn over the UI (it covered the
    // dropdown): lines are batched and POSTed to the dev server (`/__log`),
    // which appends them to a file the developer can read remotely, and are
    // also mirrored to the browser console. `?detlogui=1` additionally shows
    // the old on-screen panel.
    const query = new URLSearchParams(location.search);
    const DET_LOG = query.has('detlog');
    let detLogEl = null;
    if (DET_LOG && query.has('detlogui')) {
        detLogEl = document.createElement('pre');
        detLogEl.id = 'detLog';
        document.body.appendChild(detLogEl);
    }
    let detLogLines = [];
    let detLogBuf = [];
    let detLogFlushed = false;
    let detLogLast = 0;
    if (DET_LOG) {
        detLogBuf.push(`session ${new Date().toISOString()} ua=${navigator.userAgent}`);
        setInterval(flushDetLog, 1000);
    }
    function flushDetLog() {
        if (!detLogBuf.length) return;
        const body = detLogBuf.join('\n') + '\n';
        detLogBuf = [];
        const reset = detLogFlushed ? '' : '&reset=1';
        detLogFlushed = true;
        try {
            fetch(`/__log?name=detlog${reset}`, { method: 'POST', body, keepalive: true }).catch(() => {});
        } catch { /* ignore */ }
    }
    function pushDetLog(line) {
        console.log('[det]', line);
        detLogLines.unshift(line);
        if (detLogLines.length > 40) detLogLines = detLogLines.slice(0, 40);
        if (detLogEl) detLogEl.textContent = detLogLines.join('\n');
        detLogBuf.push(line);
        if (detLogBuf.length >= 20) flushDetLog();
    }
    // Strongest local maxima of the current spectrum, for the log.
    function topPeaks(db, sampleRate, fftSize, count) {
        const binHz = sampleRate / fftSize;
        const found = [];
        for (let k = 2; k < db.length - 1; k++) {
            if (db[k] > db[k - 1] && db[k] >= db[k + 1] && db[k] > -90) {
                found.push([(k * binHz).toFixed(0), db[k]]);
            }
        }
        found.sort((a, b) => b[1] - a[1]);
        return found.slice(0, count).map(([f, v]) => `${f}Hz(${v.toFixed(0)})`).join(' ');
    }

    // Keep #instrumentArea lifted above the fixed #controls overlay.
    function syncControlsHeight() {
        document.documentElement.style.setProperty('--controls-h', `${controlsDiv.offsetHeight}px`);
    }
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncControlsHeight).observe(controlsDiv);
    }
    syncControlsHeight();
    if (debugToggle && debugInfo) {
        debugToggle.addEventListener('click', () => {
            debugInfo.classList.toggle('visible');
            syncControlsHeight();
        });
    }

    // --- TV / D-pad (remote) navigation ---
    // Left/Right moves focus between controls. Up/Down highlights a value in the
    // focused <select>; Enter/Space confirms it. Confirming a song starts the
    // game, so merely browsing the list no longer fires every song at once.
    const dpadFocusables = [instrumentSelect, songSelect, debugToggle].filter(Boolean);
    function moveFocus(step) {
        const i = dpadFocusables.indexOf(document.activeElement);
        const next = i < 0 ? 0 : (i + step + dpadFocusables.length) % dpadFocusables.length;
        dpadFocusables[next].focus();
    }
    document.addEventListener('keydown', (event) => {
        const el = document.activeElement;
        const key = event.key;
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            event.preventDefault();
            moveFocus(key === 'ArrowRight' ? 1 : -1);
            return;
        }
        if (el && el.tagName === 'SELECT' && (key === 'ArrowDown' || key === 'ArrowUp')) {
            event.preventDefault();
            const count = el.options.length;
            if (count) {
                const dir = key === 'ArrowDown' ? 1 : -1;
                el.selectedIndex = (el.selectedIndex + dir + count) % count;
            }
            return;
        }
        if (el && el.tagName === 'SELECT' && (key === 'Enter' || key === ' ')) {
            event.preventDefault();
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }
        if (el && el.tagName === 'BUTTON' && (key === 'Enter' || key === ' ')) {
            event.preventDefault();
            el.click();
        }
    });

    let currentGame = null;
    let currentInstrument = null;

    let audioContext;
    let analyser;
    let spectrum = null;
    let backgroundRms = 0;
    let backgroundSpectrum = null; // per-bin linear amplitude of the stationary background
    let backgroundMag = null;      // mean magnitude spectrum for spectral subtraction
    let timeData = null;
    let freqData = null;
    let currentInstrumentName = '';

    // Spectral subtraction of the stationary background (fan/hum) before YIN.
    // The projector's fan has a strong steady line (e.g. 436 Hz) that YIN locks
    // onto instead of a quiet note; subtracting its measured spectrum fixes it.
    const SUBTRACT_N = 4096;
    const SUBTRACT_ALPHA = 2;
    const SPECTRAL_SUBTRACT = !query.has('nosub');

    // Pitch detector: YIN (FFT-accelerated autocorrelation), see pitch-detector.js.
    const MIN_CONFIDENCE = 0.35;
    // The fallback branch (no dip below the strict YIN threshold) is far less
    // reliable, so it must clear a higher bar or the fan/leaf-blower sneaks in.
    const MIN_CONFIDENCE_FALLBACK = 0.7;
    // Level gate: a frame must be louder than the measured background. Weak USB
    // mics sit close to the background, so the ratio is small and a low absolute
    // floor only rejects true silence; the spectral gate below does the real work.
    const MIN_LEVEL_RATIO = 1.2;
    const MIN_ABSOLUTE_RMS = 0.0015;
    // A frame is accepted only if the detected pitch's harmonics rise above the
    // measured background profile by this relative margin. This rejects a steady
    // fan/hum even when it sits exactly on the note's frequency, because the
    // played note adds energy on top of the background.
    const MIN_NOISE_EXCESS = 2.5;
    const NOISE_HARMONICS = 6;
    const DETECTOR_SETTINGS = {
        ukulele: { minFreq: 110, maxFreq: 1400, highpassHz: 160, windowSize: 4096 },
        piano: { minFreq: 60, maxFreq: 2100, highpassHz: 40, windowSize: 4096 },
        saxophone: { minFreq: 80, maxFreq: 1800, highpassHz: 60, windowSize: 2048 },
    };
    const DEFAULT_SETTINGS = { minFreq: 60, maxFreq: 2100, highpassHz: 40, windowSize: 4096 };

    // "Song" entry that actually runs the automated self-test.
    const SELF_TEST_VALUE = '__selftest__';
    const selfCheckEnv = {
        getAudioContext: () => audioContext,
        getAnalyser: () => analyser,
        getInstrument: () => currentInstrument,
        getGame: () => currentGame,
        getGameArea: () => gameArea,
    };

    async function setupAudio() {
        try {
            // Raw (unprocessed) audio is required only for the self-test's
            // speaker -> microphone loopback (echo cancellation would remove the
            // routed tone). For normal play, auto-gain lifts weak USB-mic levels.
            const isSelfTest = new URLSearchParams(window.location.search).has('selftest');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: !isSelfTest,
                },
            });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 8192;
            source.connect(analyser);
            if (spectrumCanvas) {
                spectrum = new SpectrumStrip(spectrumCanvas);
            }
            console.log('Audio setup complete');

            // Initial background noise measurement
            backgroundRms = await measureBackgroundNoise(analyser);
            console.log('Background RMS:', backgroundRms, '(spectral profile bins:', backgroundSpectrum ? backgroundSpectrum.length : 0, ')');

            analyzeAudioStream();
        } catch (error) {
            console.error('Error accessing microphone:', error);
            feedbackDiv.textContent = 'Microphone access denied or not available.';
            calibrationHint.textContent = 'Microphone access denied. Please check permissions.';
        }
    }

    async function measureBackgroundNoise(analyser) {
        const buffer = new Float32Array(analyser.fftSize);
        const spectrumBuffer = new Float32Array(analyser.frequencyBinCount);
        const spectrumAccumulator = new Float32Array(analyser.frequencyBinCount);
        const bgMagAccumulator = SPECTRAL_SUBTRACT ? new Float64Array(SUBTRACT_N / 2 + 1) : null;
        const measurementDuration = 1500;
        const startTime = Date.now();
        let totalRms = 0;
        let sampleCount = 0;
        while (Date.now() - startTime < measurementDuration) {
            analyser.getFloatTimeDomainData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
            totalRms += Math.sqrt(sum / buffer.length);

            // `getFloatFrequencyData` is in dB; accumulate linear amplitude so
            // the profile can be compared with per-frame magnitudes directly.
            analyser.getFloatFrequencyData(spectrumBuffer);
            for (let i = 0; i < spectrumBuffer.length; i++) {
                spectrumAccumulator[i] += Math.pow(10, spectrumBuffer[i] / 20);
            }
            if (bgMagAccumulator) {
                const mag = magnitudeSpectrum(buffer, SUBTRACT_N);
                for (let i = 0; i < mag.length; i++) bgMagAccumulator[i] += mag[i];
            }
            sampleCount++;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (sampleCount > 0) {
            for (let i = 0; i < spectrumAccumulator.length; i++) {
                spectrumAccumulator[i] /= sampleCount;
            }
            backgroundSpectrum = spectrumAccumulator;
            if (bgMagAccumulator) {
                for (let i = 0; i < bgMagAccumulator.length; i++) bgMagAccumulator[i] /= sampleCount;
                backgroundMag = bgMagAccumulator;
            }
        }
        return sampleCount ? totalRms / sampleCount : 0;
    }

    // How much the current frame's energy at the note's harmonics exceeds the
    // stationary background profile. ~0 means "this is just the background".
    function noteExcessOverBackground(frequency) {
        if (!backgroundSpectrum || frequency <= 0) return Infinity;
        const binHz = audioContext.sampleRate / analyser.fftSize;
        const binCount = backgroundSpectrum.length;
        let excess = 0;
        let base = 0;
        for (let h = 1; h <= NOISE_HARMONICS; h++) {
            const center = Math.round((frequency * h) / binHz);
            if (center <= 0 || center >= binCount) break;
            let frameMag = 0;
            let baseMag = 0;
            for (let b = center - 1; b <= center + 1; b++) {
                if (b < 0 || b >= binCount) continue;
                frameMag = Math.max(frameMag, Math.pow(10, freqData[b] / 20));
                baseMag = Math.max(baseMag, backgroundSpectrum[b]);
            }
            excess += Math.max(0, frameMag - baseMag);
            base += baseMag;
        }
        return excess / (base + 1e-9);
    }

    function analyzeAudioStream() {
        if (!analyser) return;

        if (!timeData || timeData.length !== analyser.fftSize) {
            timeData = new Float32Array(analyser.fftSize);
        }
        if (!freqData || freqData.length !== analyser.frequencyBinCount) {
            freqData = new Float32Array(analyser.frequencyBinCount);
        }
        analyser.getFloatTimeDomainData(timeData);
        // Fresh spectrum every frame: used by the noise gate *and* the strip.
        analyser.getFloatFrequencyData(freqData);

        let sumSquares = 0;
        for (let i = 0; i < timeData.length; i++) {
            sumSquares += timeData[i] * timeData[i];
        }
        const rms = Math.sqrt(sumSquares / timeData.length);

        const settings = DETECTOR_SETTINGS[currentInstrumentName] || DEFAULT_SETTINGS;
        // Strip the stationary fan/hum before YIN so it stops locking onto it.
        const detectionInput = (SPECTRAL_SUBTRACT && backgroundMag)
            ? subtractBackground(timeData, SUBTRACT_N, backgroundMag, SUBTRACT_ALPHA)
            : timeData;
        const { frequency: detectedFrequency, confidence, mode } = detectYin(detectionInput, audioContext.sampleRate, settings);

        debugDetectedFrequency.textContent = detectedFrequency.toFixed(0);

        const excess = detectedFrequency > 0 ? noteExcessOverBackground(detectedFrequency) : 0;
        const levelGate = Math.max(backgroundRms * MIN_LEVEL_RATIO, MIN_ABSOLUTE_RMS);
        const levelOk = rms > levelGate;
        const pitchOk = detectedFrequency > 0 &&
            confidence >= (mode === 'fallback' ? MIN_CONFIDENCE_FALLBACK : MIN_CONFIDENCE) &&
            excess >= MIN_NOISE_EXCESS;
        const accepted = levelOk && pitchOk;

        if (debugLevel) {
            debugLevel.textContent = `rms ${rms.toFixed(4)}/gate ${levelGate.toFixed(4)} (bg ${backgroundRms.toFixed(4)})  conf ${confidence.toFixed(2)}  excess ${excess.toFixed(2)}  ${levelOk ? 'L' : 'l'}${pitchOk ? 'P' : 'p'}`;
        }

        if (DET_LOG) {
            const now = performance.now();
            if (now - detLogLast > 120) {
                detLogLast = now;
                const peaks = topPeaks(freqData, audioContext.sampleRate, analyser.fftSize, 3);
                const line = `f=${detectedFrequency.toFixed(0).padStart(4)} ${(mode || 'none').padEnd(9)} c=${confidence.toFixed(2)} E=${excess.toFixed(2)} rms=${rms.toFixed(4)} ${levelOk ? 'L' : 'l'}${pitchOk ? 'P' : 'p'}${accepted ? 'A' : '.'} bg:${backgroundRms.toFixed(4)} | ${peaks}`;
                pushDetLog(line);
            }
        }

        if (currentInstrument && currentInstrument.calibration) {
            if (accepted) {
                currentInstrument.calibration.handleAudioInput(detectedFrequency);
            }
        }

        if (currentGame && currentGame.isPlaying) {
            currentGame.matchNote(detectedFrequency);
        }

        // On-neck feedback: green = where to press (target), red = where the
        // note was actually heard. A "clear" note is a confident pitch even if
        // the noise gate later rejects it, so the player sees their finger error.
        if (currentInstrument) {
            const targetNoteId = (currentGame && currentGame.isPlaying) ? currentGame.getTargetNoteId() : null;
            currentInstrument.showTarget?.(targetNoteId);
            const heard = (detectedFrequency > 0 && confidence >= 0.7) ? detectedFrequency : 0;
            currentInstrument.showHeard?.(heard);
        }

        // The generic instruction only makes sense while a song is running;
        // otherwise it contradicts the "Finished!"/idle feedback.
        if (playHint) {
            playHint.style.display = (currentGame && currentGame.isPlaying) ? '' : 'none';
        }

        if (spectrum) {
            spectrum.draw({
                freqDb: freqData,
                sampleRate: audioContext.sampleRate,
                fftSize: analyser.fftSize,
                settings,
                acceptedFrequency: accepted ? detectedFrequency : null,
                targetFrequency: currentGame && currentGame.isPlaying ? currentGame.getTargetFrequency() : null,
                backgroundSpectrum,
            });
        }

        requestAnimationFrame(analyzeAudioStream);
    }

    async function loadSongs(instrumentName) {
        try {
            const response = await fetch('./songs/songlist.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const allSongs = await response.json();
            const instrumentSongs = allSongs.filter(song => song.instruments.includes(instrumentName));

            songSelect.innerHTML = '<option value="">-- Select a Song --</option>';
            instrumentSongs.forEach(song => {
                const option = document.createElement('option');
                option.value = song.file;
                option.textContent = song.file.replace('.json', '').replace(/_/g, ' ');
                songSelect.appendChild(option);
            });

            const selfTest = document.createElement('option');
            selfTest.value = SELF_TEST_VALUE;
            selfTest.textContent = 'Self-test (auto-play)';
            songSelect.appendChild(selfTest);
        } catch (error) {
            console.error('Could not load song list:', error);
        }
    }

    async function loadSongData(songFile) {
        try {
            const response = await fetch(`./songs/${songFile}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Could not load song data:', error);
            return null;
        }
    }

    function showOverlay(message, duration) {
        overlayContent.textContent = message;
        overlay.classList.remove('hidden');
        return new Promise(resolve => setTimeout(() => {
            overlay.classList.add('hidden');
            resolve();
        }, duration));
    }

    async function initializeInstrument(instrumentName) {
        instrumentArea.innerHTML = ''; // Clear previous instrument
        currentInstrument = InstrumentFactory.createInstrument(instrumentName, instrumentArea);
        currentInstrumentName = currentInstrument ? currentInstrument.name : instrumentName;
        if (currentInstrument) {
            // Set deck position immediately after drawing the instrument
            if (currentGame) {
                currentGame.instrument = currentInstrument;
                currentGame.setDeckPosition();
            }
        }
        if (currentInstrument && currentInstrument.calibration) {
            currentInstrument.calibration.resetCalibration();
            currentInstrument.calibration.startCalibration(() => {
                console.log('Calibration complete callback');
            });
        } else {
            calibrationDiv.style.display = 'none';
        }
        await loadSongs(instrumentName);
    }

    instrumentSelect.addEventListener('change', async (event) => {
        const selectedInstrument = event.target.value;
        await initializeInstrument(selectedInstrument);
        songSelect.value = '';
        currentGame = null; // Reset current game when instrument changes
    });

    songSelect.addEventListener('change', async (event) => {
        const selectedSongFile = event.target.value;
        if (selectedSongFile === SELF_TEST_VALUE) {
            startSelfCheck(selfCheckEnv, { virtual: false });
            return;
        }
        if (selectedSongFile && currentInstrument) {
            const songData = await loadSongData(selectedSongFile);
            if (songData) {
                currentGame = new Game(gameArea, feedbackDiv, currentInstrument);
                currentGame.loadSong(songData);
                // Ensure deck position is set after game and instrument are ready
                currentGame.setDeckPosition();
                await showOverlay('Get Ready', 3000);
                currentGame.startGame();
            }
        }
    });

    await setupAudio();
    await initializeInstrument(instrumentSelect.value); // Initialize default instrument

    instrumentSelect.focus(); // give the TV remote something to start on

    maybeStartSelfCheck(selfCheckEnv);
});