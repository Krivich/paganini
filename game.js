// game.js
export class Game {
    constructor(gameArea, feedbackDiv, instrument) {
        this.gameArea = gameArea;
        this.feedbackDiv = feedbackDiv;
        this.instrument = instrument;
        this.songData = [];
        this.currentNoteIndex = 0;
        this.activeNotes = [];
        this.fallSpeed = 2;
        this.isPlaying = false;
        this.nextNoteSpawnTime = 0;
        this.noteSpawnInterval = 1500;
        this.isPaused = false;
        this.deckPosition = 100;
        this.hitThreshold = 50;
    }

    loadSong(songData) {
        this.songData = songData.data;
        this.feedbackDiv.textContent = `Song loaded: ${songData.title || 'Unknown'}`;
        this.currentNoteIndex = 0;
    }

    startGame() {
        if (!this.songData || this.songData.length === 0) return;
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.currentNoteIndex = 0;
        this.activeNotes = [];
        // this.gameArea.innerHTML = '';
        this.feedbackDiv.textContent = `Playing: ${this.songData.title || 'Selected Song'}`;
        this.nextNoteSpawnTime = performance.now() + this.noteSpawnInterval;
        this.isPaused = false;
        this.setDeckPosition(); // Ensure deck position is set
        this.gameLoop();
    }

    setDeckPosition() {
        if (this.instrument) {
            this.deckPosition = this.instrument.getDeckTop();
        } else {
            console.warn('Instrument not set, cannot determine deck position.');
        }
        console.log('Deck position:', this.deckPosition);
    }

    spawnNextNotes() {
        if (this.currentNoteIndex < this.songData.length) {
            const notesToSpawn = Array.isArray(this.songData[this.currentNoteIndex])
                ? this.songData[this.currentNoteIndex]
                : [this.songData[this.currentNoteIndex]];

            notesToSpawn.forEach(noteId => {
                const noteElement = this.createNoteElement(noteId);
                const position = this.instrument.getNotePosition(noteId, this.gameArea);
                noteElement.style.left = `${position.left}px`;
                noteElement.style.top = '0px';
                this.gameArea.appendChild(noteElement);
                this.activeNotes.push({ id: noteId, element: noteElement });
            });
            this.currentNoteIndex++;
        }
    }

    createNoteElement(noteId) {
        const noteElement = document.createElement('div');
        noteElement.classList.add('note');
        noteElement.textContent = noteId;
        noteElement.dataset.noteId = noteId;
        return noteElement;
    }

    gameLoop(currentTime) {
        if (!this.isPlaying) return;

        if (!this.isPaused && currentTime >= this.nextNoteSpawnTime && this.currentNoteIndex < this.songData.length) {
            this.spawnNextNotes();
            this.nextNoteSpawnTime = currentTime + this.noteSpawnInterval;
        }

        if (!this.isPaused) { // Only move notes if not paused
            this.activeNotes.forEach(noteObj => {
                const noteElement = noteObj.element;
                const currentTop = parseFloat(noteElement.style.top || 0);
                noteElement.style.top = `${currentTop + this.fallSpeed}px`;
                this.checkNoteCollision(noteObj);
            });
        }

        this.activeNotes = this.activeNotes.filter(noteObj => noteObj.element.parentNode);

        if (this.activeNotes.length === 0 && this.currentNoteIndex >= this.songData.length) {
            this.feedbackDiv.textContent = 'Finished!';
            this.isPlaying = false;
        }

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    checkNoteCollision(noteObj) {
        const noteElement = noteObj.element;
        const noteRect = noteElement.getBoundingClientRect();
        const deckTop = this.deckPosition;

        if (noteRect.bottom > deckTop && !noteElement.classList.contains('at-deck')) {
            noteElement.classList.add('at-deck');
            if (!this.isPaused) {
                console.log('Leading note reached deck. Freezing.');
                this.isPaused = true; // Freeze when the leading note hits the deck
            }
        }

        if (noteRect.bottom > window.innerHeight) {
            this.destroyNote(noteObj, false);
        }
    }

    destroyNote(noteObj, isCorrect = false) {
        if (!noteObj.element.parentNode) return;

        if (isCorrect) {
            this.feedbackDiv.textContent = 'Correct!';
            this.animateNoteDisappearance(noteObj.element);
        } else {
            this.feedbackDiv.textContent = `Missed note: ${noteObj.id}`;
            noteObj.element.remove();
        }
    }

    animateNoteDisappearance(noteElement) {
        noteElement.classList.add('disappearing');
        noteElement.addEventListener('animationend', () => {
            if (noteElement.parentNode) {
                noteElement.remove();
            }
        });
    }

    matchNote(detectedFrequency) {

        const deckTop = this.deckPosition;

        this.activeNotes.forEach(noteObj => {
            const noteElement = noteObj.element;
            const noteRect = noteElement.getBoundingClientRect();

            if (noteRect.bottom > deckTop - this.hitThreshold) {
                const noteId = parseInt(noteElement.dataset.noteId);
                const expectedFrequency = this.instrument.getExpectedFrequency(noteId);
                const delta = this.instrument.calculateFrequencyDelta(noteId);

                document.getElementById('debugTargetNoteId').textContent = noteId;
                document.getElementById('debugExpectedFrequency').textContent = expectedFrequency ? expectedFrequency.toFixed(2) : 'N/A';

                console.log(`Match Attempt - Note ID: ${noteId}, Detected: ${detectedFrequency.toFixed(2)}, Expected: ${expectedFrequency ? expectedFrequency.toFixed(2) : 'N/A'}, Delta: ${delta}`);

                if (expectedFrequency && Math.abs(detectedFrequency - expectedFrequency) < delta) {
                    console.log('Match Found! Destroying note.');
                    this.destroyNote(noteObj, true);
                    this.activeNotes = this.activeNotes.filter(n => n !== noteObj);
                    this.isPaused = false;
                } else {
                    console.log('No Match.');
                }
            }
        });
    }

}
