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
        this.isPaused = false;
        this.deckPosition = 0;
        this.hitThreshold = 50;
        this.spawnDistanceThreshold = gameArea.offsetHeight / 4; // Distance threshold to spawn new notes
        this.isShifting = false; // Flag to indicate if notes are currently shifting
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
        this.isPaused = false;
        this.setDeckPosition();
        this.spawnNextNotes(); // Spawn initial notes to start the fall
        this.gameLoop();
    }

    setDeckPosition() {
        if (this.instrument) {
            this.deckPosition = this.instrument.getDeckTop();
            console.log('Deck position updated by instrument:', this.deckPosition);
        } else {
            console.warn('Instrument not set, cannot determine deck position.');
            this.deckPosition = this.gameArea.offsetHeight - 50;
        }
        console.log('Final Deck position:', this.deckPosition);
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

    gameLoop() {
        if (!this.isPlaying) return;

        if (!this.isPaused && !this.isShifting) { // Don't move or spawn if paused or shifting

            // Distance-based spawning logic
            if (this.activeNotes.length > 0 && this.currentNoteIndex < this.songData.length) {
                const highestNote = this.activeNotes.reduce((prev, current) => {
                    const prevTop = parseFloat(prev.element.style.top || 0);
                    const currentTop = parseFloat(current.element.style.top || 0);
                    return (prevTop < currentTop) ? prev : current; // Find note with smallest top value (highest)
                });
                const highestNoteTop = parseFloat(highestNote.element.style.top || 0);

                if (highestNoteTop > this.spawnDistanceThreshold) {
                    this.spawnNextNotes();
                }
            } else if (this.activeNotes.length === 0 && this.currentNoteIndex < this.songData.length) {
                // If no active notes and more notes to spawn, spawn immediately to start
                this.spawnNextNotes();
            }


            this.activeNotes.forEach(noteObj => {
                const noteElement = noteObj.element;
                const currentTop = parseFloat(noteElement.style.top || 0);
                noteElement.style.top = `${currentTop + this.fallSpeed}px`;
                this.checkNoteCollision(noteObj);
            });
        }

        this.activeNotes = this.activeNotes.filter(noteObj => noteObj.element.parentNode);


        if (this.activeNotes.length === 0 && this.currentNoteIndex >= this.songData.length && this.isPlaying) {
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
                this.isPaused = true;
            }
        }

        if (noteRect.bottom > this.gameArea.offsetHeight) {
            this.destroyNote(noteObj, false);
        }
    }

    destroyNote(noteObj, isCorrect = false) {
        if (!noteObj.element.parentNode) return;

        if (isCorrect) {
            const noteElement = noteObj.element;
            const noteRect = noteElement.getBoundingClientRect();
            const deckTop = this.deckPosition;
            const distanceToDeck = deckTop - noteRect.bottom;

            this.feedbackDiv.textContent = 'Correct!';
            this.animateNoteDisappearance(noteObj.element);

            if (distanceToDeck > 0 && distanceToDeck <= this.hitThreshold) {
                this.shiftActiveNotes(distanceToDeck);
            }

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

    shiftActiveNotes(shiftDistance) {
        if (this.isShifting) return; // Prevent overlapping shifts
        this.isShifting = true;

        let shiftStartTime = null;
        const duration = 150; // Animation duration in ms (adjust as needed)
        const startTops = this.activeNotes.map(note => ({
            note: note,
            startTop: parseFloat(note.element.style.top || 0)
        }));
        const originalFallSpeed = this.fallSpeed;
        this.fallSpeed = originalFallSpeed * 2; // Speed up falling during shift

        const animateShift = (currentTime) => {
            if (!shiftStartTime) shiftStartTime = currentTime;
            const elapsed = currentTime - shiftStartTime;
            const progress = Math.min(elapsed / duration, 1); // Progress from 0 to 1

            startTops.forEach(({ note, startTop }) => {
                note.element.style.top = `${startTop + shiftDistance * progress}px`;
            });

            if (progress < 1) {
                requestAnimationFrame(animateShift);
            } else {
                this.isShifting = false; // Reset shift flag
                this.fallSpeed = originalFallSpeed; // Restore original fall speed
            }
        };

        requestAnimationFrame(animateShift);
    }


    matchNote(detectedFrequency) {
        const deckTop = this.deckPosition;

        let leadingNoteObj = null;
        let minDistanceToDeck = Infinity;

        this.activeNotes.forEach(noteObj => {
            const noteElement = noteObj.element;
            const noteRect = noteElement.getBoundingClientRect();
            const distanceToDeck = noteRect.bottom - deckTop;

            document.getElementById('debugTargetNoteId').textContent = '';
            document.getElementById('debugExpectedFrequency').textContent = 'N/A';

            if (distanceToDeck > -this.hitThreshold && distanceToDeck < this.gameArea.offsetHeight) {
                const noteId = parseInt(noteElement.dataset.noteId);
                const expectedFrequency = this.instrument.getExpectedFrequency(noteId);
                const delta = this.instrument.calculateFrequencyDelta(noteId);

                document.getElementById('debugTargetNoteId').textContent = noteId;
                document.getElementById('debugExpectedFrequency').textContent = expectedFrequency ? expectedFrequency.toFixed(2) : 'N/A';
                document.getElementById('debugDetectedFrequency').textContent = detectedFrequency ? detectedFrequency.toFixed(2) : 'N/A';

                console.log(`Match Attempt ID: ${noteId}, Det: ${detectedFrequency.toFixed(2)}, Exp: ${expectedFrequency ? expectedFrequency.toFixed(2) : 'N/A'}, Delta: ${delta}, DistToDeck: ${distanceToDeck.toFixed(2)}`);

                if (expectedFrequency && Math.abs(detectedFrequency - expectedFrequency) < delta) {
                    console.log('Match Found for note ID:', noteId);
                    this.destroyNote(noteObj, true);
                    this.activeNotes = this.activeNotes.filter(n => n !== noteObj);
                    this.isPaused = false;
                    return;
                } else {
                    console.log('No Match.');
                }
            }

            if (noteRect.bottom > deckTop && distanceToDeck < minDistanceToDeck) {
                minDistanceToDeck = distanceToDeck;
                leadingNoteObj = noteObj;
            }
        });

        if (leadingNoteObj && minDistanceToDeck >= 0 && !this.isPaused && !this.isShifting) {
            console.log("Freezing due to leading note at deck", leadingNoteObj.id);
            this.isPaused = true;
        }
    }
}
