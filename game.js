export class Game {
    constructor(gameArea, ukuleleNeck, feedbackDiv) {
        this.gameArea = gameArea;
        this.ukuleleNeck = ukuleleNeck;
        this.feedbackDiv = feedbackDiv;
        this.songData = []; // Initialize as empty
        this.currentNoteIndex = 0;
        this.notes = [];
        this.fallSpeed = 2;
        this.isPlaying = false;
        this.calibratedFrequencies = {};
        this.nextNoteSpawnTime = 0;
        this.noteSpawnInterval = 1500; // Adjust as needed
        this.isPaused = false;
        this.activeNoteOnDeck = null;
    }

    loadSong(songData) {
        this.songData = songData.data;
        this.feedbackDiv.textContent = `Song loaded: ${this.songTitle || 'Unknown'}`;
        this.currentNoteIndex = 0;
    }

    setCalibratedFrequencies(frequencies) {
        this.calibratedFrequencies = frequencies;
    }

    startGame() {
        if (!this.songData || this.songData.length === 0) {
            this.feedbackDiv.textContent = "Please select a song.";
            return;
        }
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.currentNoteIndex = 0;
        this.notes = [];
        this.gameArea.querySelectorAll('.note').forEach(n => n.remove());
        this.feedbackDiv.textContent = `Playing: ${this.songTitle || 'Selected Song'}`;
        this.nextNoteSpawnTime = performance.now() + this.noteSpawnInterval;
        this.isPaused = false;
        this.activeNoteOnDeck = null;
        this.gameLoop();
    }

    spawnNextNote() {
        if (this.currentNoteIndex < this.songData.length) {
            const fret = this.songData[this.currentNoteIndex];
            const noteElement = this.createNoteElement(fret);
            const fretRelativePosition = this.getFretPositionOnNeck(fret);
            noteElement.style.left = `${this.ukuleleNeck.offsetLeft + fretRelativePosition}px`;
            this.gameArea.appendChild(noteElement);
            this.notes.push(noteElement);
            noteElement.dataset.fret = fret;
            this.currentNoteIndex++;
        }
    }

    getFretPositionOnNeck(fret) {
        const fretElements = this.ukuleleNeck.querySelectorAll('.fret');
        if (fret >= 0 && fret < fretElements.length) {
            return fretElements[fret].offsetLeft;
        } else {
            console.error(`Fret index out of bounds: ${fret}`);
            return 0; // Or some default/error value
        }
    }


    createNoteElement(fret) {
        const noteElement = document.createElement('div');
        noteElement.classList.add('note');
        const expectedFreq = this.calibratedFrequencies[fret];
        const fretSpan = document.createElement('span');
        fretSpan.textContent = fret;
        const freqSpan = document.createElement('span');
        freqSpan.textContent = expectedFreq ? expectedFreq.toFixed(1) + ' Hz' : '?';
        noteElement.appendChild(fretSpan);
        noteElement.appendChild(freqSpan);
        noteElement.dataset.expectedFrequency = expectedFreq;
        return noteElement;
    }

    gameLoop(currentTime) {
        if (!this.isPlaying) return;

        if (!this.isPaused && currentTime >= this.nextNoteSpawnTime && this.currentNoteIndex < this.songData.length) {
            this.spawnNextNote();
            this.nextNoteSpawnTime = currentTime + this.noteSpawnInterval;
        }

        if (!this.isPaused) {
            this.notes.forEach(note => {
                const currentTop = parseFloat(note.style.top || 0);
                note.style.top = `${currentTop + this.fallSpeed}px`;
                this.checkNoteAtDeck(note);
                if (parseFloat(note.style.top) > this.gameArea.clientHeight) {
                    this.destroyNote(note, false); // Missed note
                }
            });
        }

        this.notes = this.notes.filter(note => note.parentNode);

        if (this.notes.length === 0 && this.currentNoteIndex >= this.songData.length) {
            this.feedbackDiv.textContent = 'Finished!';
            this.isPlaying = false;
        }

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    checkNoteAtDeck(note) {
        const neckRect = this.ukuleleNeck.getBoundingClientRect();
        const noteRect = note.getBoundingClientRect();
        if (noteRect.bottom > neckRect.top && noteRect.bottom < neckRect.bottom) {
            if (!note.classList.contains('at-deck')) {
                note.classList.add('at-deck');
                this.activeNoteOnDeck = note;
                this.isPaused = true;
            }
        } else if (note.classList.contains('at-deck')) {
            note.classList.remove('at-deck');
            if (this.activeNoteOnDeck === note) {
                this.activeNoteOnDeck = null;
            }
        }
    }

    destroyNote(noteElement, isCorrect = false) {
        if (!noteElement.parentNode) return; // Avoid errors if already removed

        if (isCorrect) {
            this.feedbackDiv.textContent = 'Correct!';
            this.animateNoteDisappearance(noteElement);
        } else {
            const expectedFrequency = noteElement.dataset.expectedFrequency;
            this.feedbackDiv.textContent = `Miss! Expected Frequency: ${expectedFrequency ? expectedFrequency.toFixed(1) : 'N/A'} Hz`;
            noteElement.remove();
        }
    }

    animateNoteDisappearance(noteElement) {
        noteElement.classList.add('disappearing'); // Apply CSS animation
        noteElement.addEventListener('animationend', () => {
            if (noteElement.parentNode) {
                noteElement.remove();
            }
        });
    }

    matchNote(detectedFrequency) {
        if (this.isPaused && this.activeNoteOnDeck) {
            const targetFret = parseInt(this.activeNoteOnDeck.dataset.fret);
            const expectedFrequency = this.calibratedFrequencies[targetFret];
            const delta = this.calculateFrequencyDelta(targetFret);
            document.getElementById('debugTargetFret').textContent = targetFret;
            document.getElementById('debugExpectedFrequency').textContent = expectedFrequency ? expectedFrequency.toFixed(2) : 'N/A';

            if (expectedFrequency && Math.abs(detectedFrequency - expectedFrequency) < delta) {
                this.destroyNote(this.activeNoteOnDeck, true);
                this.activeNoteOnDeck = null;
                this.isPaused = false;
            }
        }
    }

    calculateFrequencyDelta(fret) {
        const freq1 = this.calibratedFrequencies[fret];
        const freq2 = this.calibratedFrequencies[parseInt(fret) + 1];
        let dynamicDelta = 20; // Default if adjacent frets are not calibrated

        if (freq1 && freq2) {
            dynamicDelta = Math.abs(freq2 - freq1) * 0.4;
        }

        const fixedTolerance = 15; // Adjust this value based on testing
        return Math.max(dynamicDelta, fixedTolerance);
    }
}
