import { Game } from './game.js';
import { InstrumentFactory } from './instrument-factory.js';

document.addEventListener('DOMContentLoaded', async () => {
    const instrumentArea = document.getElementById('instrumentArea');
    const gameArea = document.getElementById('gameArea');
    const feedbackDiv = document.getElementById('feedback');
    const calibrationDiv = document.getElementById('calibration');
    const calibrationHint = document.getElementById('calibrationHint');
    const calibrationProgressBar = document.getElementById('calibrationProgressBar');
    const debugCalibrationState = document.getElementById('debugCalibrationState');
    const debugDetectedFrequency = document.getElementById('debugDetectedFrequency');
    const debugTargetNoteId = document.getElementById('debugTargetNoteId');
    const debugExpectedFrequency = document.getElementById('debugExpectedFrequency');
    const songSelect = document.getElementById('songSelect');
    const instrumentSelect = document.getElementById('instrumentSelect');
    const overlay = document.getElementById('overlay');
    const overlayContent = document.getElementById('overlay-content');

    let currentGame = null;
    let currentInstrument = null;

    let audioContext;
    let analyser;
    let backgroundVolumeThreshold = 0;

    async function setupAudio() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 8192;
            source.connect(analyser);
            console.log('Audio setup complete');

            // Initial background noise measurement
            backgroundVolumeThreshold = await measureBackgroundNoise(analyser);
            console.log('Background Volume Threshold:', backgroundVolumeThreshold);

            analyzeAudioStream();
        } catch (error) {
            console.error('Error accessing microphone:', error);
            feedbackDiv.textContent = 'Microphone access denied or not available.';
            calibrationHint.textContent = 'Microphone access denied. Please check permissions.';
        }
    }

    async function measureBackgroundNoise(analyser) {
        let totalAmplitude = 0;
        const measurementDuration = 1500;
        const startTime = Date.now();
        let sampleCount = 0;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        while (Date.now() - startTime < measurementDuration) {
            analyser.getByteFrequencyData(dataArray);
            let currentAmplitude = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            totalAmplitude += currentAmplitude;
            sampleCount++;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return totalAmplitude / sampleCount;
    }

    function analyzeAudioStream() {
        if (!analyser) return;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        let maxAmplitude = 0;
        let dominantFrequencyIndex = -1;

        for (let i = 0; i < bufferLength / 2; i++) {
            if (dataArray[i] > maxAmplitude) {
                maxAmplitude = dataArray[i];
                dominantFrequencyIndex = i;
            }
        }

        let detectedFrequency = 0;
        if (dominantFrequencyIndex !== -1) {
            const sampleRate = audioContext.sampleRate;
            let potentialFundamentalIndex = Math.round(dominantFrequencyIndex / 2);

            if (potentialFundamentalIndex > 0 && dataArray[potentialFundamentalIndex] > maxAmplitude * 0.6) {
                detectedFrequency = potentialFundamentalIndex * sampleRate / analyser.fftSize;
            } else {
                detectedFrequency = dominantFrequencyIndex * sampleRate / analyser.fftSize;
            }
        }

        debugDetectedFrequency.textContent = detectedFrequency.toFixed(0);

        if (currentInstrument && currentInstrument.calibration) {
            if (maxAmplitude > backgroundVolumeThreshold * 1.5) {
                currentInstrument.calibration.handleAudioInput(detectedFrequency);
            } else if (currentInstrument.calibration.isCalibrationComplete() !== true) {
                calibrationHint.textContent = "Play a clear note louder than background noise.";
            }
        }

        if (currentGame && currentGame.isPlaying) {
            currentGame.matchNote(detectedFrequency);
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
});