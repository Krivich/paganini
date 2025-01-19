// script.js
import { Game } from './game.js';
import { Calibration } from './calibration.js';

document.addEventListener('DOMContentLoaded', () => {
    const gameArea = document.getElementById('gameArea');
    const ukuleleNeck = document.getElementById('ukuleleNeck');
    const feedbackDiv = document.getElementById('feedback');
    const calibrationDiv = document.getElementById('calibration');
    const calibrationHint = document.getElementById('calibrationHint');
    const calibrationProgressBar = document.getElementById('calibrationProgressBar');
    const debugCalibrationState = document.getElementById('debugCalibrationState');
    const debugDetectedFrequency = document.getElementById('debugDetectedFrequency');
    const songSelect = document.getElementById('songSelect');
    const overlay = document.getElementById('overlay');
    const overlayContent = document.getElementById('overlay-content');
    const numberOfStrings = 4; // Define the number of strings

    function createStrings() {
        ukuleleNeck.innerHTML = ''; // Clear existing content (including previous strings and frets)
        for (let i = 0; i < numberOfStrings; i++) {
            const stringElement = document.createElement('div');
            stringElement.classList.add('ukulele-string');
            stringElement.style.top = `${15 + (i * 20)}%`; // Adjust spacing as needed
            ukuleleNeck.appendChild(stringElement);
        }
        createFrets(); // Re-render frets after strings
    }

    function createFrets() {
        const neckWidth = ukuleleNeck.offsetWidth;
        const scaleLength = 380;
        const fretPositionsRelativeScale = [];
        const fretLinePositions = [];
        const fretSpaceCenters = [];

        for (let fret = 1; fret <= calibrationInstance.highCalibrationFret; fret++) {
            const fretPos = scaleLength - (scaleLength / Math.pow(2, fret / 12));
            fretPositionsRelativeScale.push(fretPos);
        }

        const usableNeckWidth = 0.80 * neckWidth;
        const startOffset = 0.1 * neckWidth;

        fretPositionsRelativeScale.forEach((fretPosRelative, index) => {
            const fretNumber = index + 1;
            const fretElem = document.createElement('div');
            fretElem.classList.add('fret');
            fretElem.dataset.fretIndex = fretNumber; // Add the data attribute


            // Calculate the position relative to the start of the *fretted* area
            const lastFretPosRelative = fretPositionsRelativeScale[fretPositionsRelativeScale.length - 1];
            const normalizedFretPos = fretPosRelative / lastFretPosRelative;
            const fretPositionInUsableArea = normalizedFretPos * usableNeckWidth;

            // Position the fret line, adding the start offset
            const fretPositionOnNeck = startOffset + fretPositionInUsableArea;

            fretElem.style.left = `${fretPositionOnNeck}px`;
            ukuleleNeck.appendChild(fretElem);
            fretLinePositions.push(fretPositionOnNeck);

            // if (gameInstance.calibratedFrequencies[fretNumber]) {
            //     const freqLabel = document.createElement('span');
            //     freqLabel.classList.add('fret-frequency-label');
            //     freqLabel.textContent = gameInstance.calibratedFrequencies[fretNumber].toFixed(0);
            //     fretElem.appendChild(freqLabel);
            // }
        });

        // Calculate Fret Space Centers
        fretSpaceCenters[0] = startOffset / 2; // Center of the space before the first fret

        for (let i = 0; i < fretLinePositions.length; i++) {
            const prevFretLinePos = (i === 0) ? startOffset : fretLinePositions[i - 1];
            fretSpaceCenters[i + 1] = (prevFretLinePos + fretLinePositions[i]) / 2;
        }

        // For frets beyond the last physical fret (e.g., 13) - extrapolate
        if (fretLinePositions.length > 1) {
            const lastFretLinePos = fretLinePositions[fretLinePositions.length - 1];
            const secondLastFretLinePos = fretLinePositions[fretLinePositions.length - 2];
            const lastFretSpacing = lastFretLinePos - secondLastFretLinePos;
            fretSpaceCenters[calibrationInstance.highCalibrationFret + 1] = lastFretLinePos + (lastFretSpacing / 2);
        } else if (fretLinePositions.length === 1) {
            fretSpaceCenters[calibrationInstance.highCalibrationFret + 1] = fretLinePositions[0] + (fretLinePositions[0] - startOffset) / 2;
        }

        gameInstance.setFretSpaceCenters(fretSpaceCenters);
    }





    const gameInstance = new Game(gameArea, ukuleleNeck, feedbackDiv);
    const calibrationInstance = new Calibration(
        calibrationDiv,
        calibrationHint,
        calibrationProgressBar,
        debugCalibrationState,
        createFrets // Pass createFrets so Calibration can trigger fret creation
    );

    const originalCalculateCalibratedFrequencies = calibrationInstance.calculateCalibratedFrequencies.bind(calibrationInstance);
    calibrationInstance.calculateCalibratedFrequencies = function(...args) {
        const result = originalCalculateCalibratedFrequencies(...args);
        if (this.calibrationState === 'completed') {
            createStrings(); // Create strings after successful calibration
        }
        return result;
    };

    const resizeObserver = new ResizeObserver(entries => {
        if (entries[0]) {
            createFrets(); // Keep re-rendering frets on resize
        }
    });
    resizeObserver.observe(ukuleleNeck);

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
            backgroundVolumeThreshold = totalAmplitude / sampleCount;
            console.log('Background Volume Threshold:', backgroundVolumeThreshold);

            analyzeAudioStream();
        } catch (error) {
            console.error('Error accessing microphone:', error);
            feedbackDiv.textContent = 'Microphone access denied or not available.';
            calibrationHint.textContent = 'Microphone access denied. Please check permissions.';
        }
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

        if (calibrationInstance.calibrationState !== 'completed') {
            if (maxAmplitude > backgroundVolumeThreshold * 1.5) {
                calibrationInstance.handleCalibration(detectedFrequency, gameInstance);
            } else {
                calibrationHint.textContent = "Play a clear note louder than background noise.";
            }
        }

        if (gameInstance.isPlaying && calibrationInstance.calibrationState === 'completed') {
            gameInstance.matchNote(detectedFrequency);
        }

        requestAnimationFrame(analyzeAudioStream);
    }

    async function loadSongs() {
        try {
            const response = await fetch('./songs/songlist.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const songFiles = await response.json();

            songFiles.forEach(songFile => {
                const option = document.createElement('option');
                option.value = songFile;
                option.textContent = songFile.replace('.json', '').replace(/_/g, ' ');
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
            const songData = await response.json();
            gameInstance.loadSong(songData);
            return songData; // Return songData for the get ready logic
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

    songSelect.addEventListener('change', async (event) => {
        const selectedSongFile = event.target.value;
        if (selectedSongFile) {
            const songData = await loadSongData(selectedSongFile);
            if (songData) {
                await showOverlay('Get Ready', 5000); // Show overlay for 5 seconds
                gameInstance.startGame(); // Start the game after the overlay
            }
        }
    });

    loadSongs();
    setupAudio();
    createStrings(); // Initial creation of strings
});
