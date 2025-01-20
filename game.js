export class Game {
    constructor(gameArea, feedbackDiv, instrument) {
        this.gameArea = gameArea;
        this.feedbackDiv = feedbackDiv;
        this.instrument = instrument;
        this.songData = [];
        this.currentNoteIndex = 0;
        this.activeNotes = []; // Now handles multiple simultaneous notes
        this.fallSpeed = 2;
        this.isPlaying = false;
        this.nextNoteSpawnTime = 0;
        this.noteSpawnInterval = 1500;
        this.isPaused = false;
    }

    loadSong(songData) {
        this.songData = songData.data;
        this.feedbackDiv.textContent = `Song loaded: ${songData.title || 'Unknown'}`;
        this.currentNoteIndex = 0;
    }

    startGame() {
        if (!this.songData || this.songData.length === 0) {
            this.feedbackDiv.textContent = "Please select a song.";
            return;
        }
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.currentNoteIndex = 0;
        this.activeNotes = [];
        this.gameArea.innerHTML = '';
        this.feedbackDiv.textContent = `Playing: ${this.songData.title || 'Selected Song'}`;
        this.nextNoteSpawnTime = performance.now() + this.noteSpawnInterval;
        this.isPaused = false;
        this.gameLoop();
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
                noteElement.style.top = `${position.top}px`;
                this.gameArea.appendChild(noteElement);
                this.activeNotes.push({ id: noteId, element: noteElement });
            });
            this.currentNoteIndex++;
        }
    }

    createNoteElement(noteId) {
        const noteElement = document.createElement('div');
        noteElement.classList.add('note');
        noteElement.textContent = noteId; // Display the note ID for now
        noteElement.dataset.noteId = noteId;
        return noteElement;
    }

    gameLoop(currentTime) {
        if (!this.isPlaying) return;

        if (!this.isPaused && currentTime >= this.nextNoteSpawnTime && this.currentNoteIndex < this.songData.length) {
            this.spawnNextNotes();
            this.nextNoteSpawnTime = currentTime + this.noteSpawnInterval;
        }

        this.activeNotes.forEach(noteObj => {
            const noteElement = noteObj.element;
            const currentTop = parseFloat(noteElement.style.top || 0);
            noteElement.style.top = `${currentTop + this.fallSpeed}px`;
            this.checkNoteAtBottom(noteObj);
            if (parseFloat(noteElement.style.top) > this.gameArea.clientHeight) {
                this.destroyNote(noteObj, false); // Missed note
            }
        });

        this.activeNotes = this.activeNotes.filter(noteObj => noteObj.element.parentNode);

        if (this.activeNotes.length === 0 && this.currentNoteIndex >= this.songData.length) {
            this.feedbackDiv.textContent = 'Finished!';
            this.isPlaying = false;
        }

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    checkNoteAtBottom(noteObj) {
        const noteElement = noteObj.element;
        const gameAreaRect = this.gameArea.getBoundingClientRect();
        const noteRect = noteElement.getBoundingClientRect();
        const detectionThreshold = 20; // Adjust as needed

        if (noteRect.bottom > gameAreaRect.bottom - detectionThreshold) {
            if (!noteElement.classList.contains('at-bottom')) {
                noteElement.classList.add('at-bottom');
                this.isPaused = true;
            }
        } else if (noteElement.classList.contains('at-bottom')) {
            noteElement.classList.remove('at-bottom');
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
        if (!this.isPaused) return;

        this.activeNotes.forEach(noteObj => {
            if (noteObj.element.classList.contains('at-bottom')) {
                const noteId = parseInt(noteObj.element.dataset.noteId);
                const expectedFrequency = this.instrument.getExpectedFrequency(noteId);
                const delta = this.instrument.calculateFrequencyDelta(noteId);

                document.getElementById('debugTargetNoteId').textContent = noteId;
                document.getElementById('debugExpectedFrequency').textContent = expectedFrequency ? expectedFrequency.toFixed(2) : 'N/A';

                if (expectedFrequency && Math.abs(detectedFrequency - expectedFrequency) < delta) {
                    this.destroyNote(noteObj, true);
                    this.activeNotes = this.activeNotes.filter(n => n !== noteObj);
                    this.isPaused = false;
                }
            }
        });
    }
}
