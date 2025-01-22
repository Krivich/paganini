// saxophone.js
import { Instrument } from './instrument.js';
import { NoCalibration } from './no-calibration.js'; // Saxophone might not need traditional calibration

export class Saxophone extends Instrument {
    constructor() {
        super("saxophone");
        this.calibration = new NoCalibration();
        this.noteMap = this.generateNoteMap(); // Abstract note to screen position mapping
    }

    draw(containerElement) {
        containerElement.innerHTML = `
            <div id="saxophoneBody">
                <!-- Basic saxophone body shape -->
            </div>
            <div id="saxophoneKeys">
                <!-- Placeholder for keys -->
            </div>
        `;
        this.styleSaxophone(containerElement);
    }

    styleSaxophone(containerElement) {
        const body = containerElement.querySelector('#saxophoneBody');
        const keys = containerElement.querySelector('#saxophoneKeys');

        if (body) {
            Object.assign(body.style, {
                position: 'absolute',
                top: '10%',
                left: '20%',
                width: '60%',
                height: '80%',
                backgroundColor: 'goldenrod',
                borderRadius: '50px',
                // Add more styling to resemble a saxophone body
            });
        }

        if (keys) {
            Object.assign(keys.style, {
                position: 'absolute',
                top: '30%',
                left: '35%',
                width: '30%',
                height: '50%',
                // Add styling for key placeholders
            });
        }
    }

    generateNoteMap() {
        // A very basic mapping of abstract note IDs to vertical positions
        // This would need to be more sophisticated based on actual saxophone fingering
        return {
            1: { top: '80%', left: '50%' },
            2: { top: '70%', left: '50%' },
            3: { top: '60%', left: '50%' },
            4: { top: '50%', left: '50%' },
            5: { top: '40%', left: '50%' },
            6: { top: '30%', left: '50%' },
            7: { top: '20%', left: '50%' },
            8: { top: '10%', left: '50%' },
            // ... more notes
        };
    }

    getNotePosition(noteId, gameArea) {
        const bodyRect = gameArea.parentNode.querySelector('#saxophoneBody').getBoundingClientRect();
        const availableWidth = bodyRect.width;
        const numberOfNotes = Object.keys(this.noteMap).length;
        const spacing = availableWidth / (numberOfNotes + 1);
        const index = Object.keys(this.noteMap).indexOf(String(noteId));

        const leftPosition = bodyRect.left + spacing * (index + 1) - gameArea.offsetLeft;

        return { left: leftPosition, top: '10%' }; // Example: fixed top, horizontal distribution
    }


    getExpectedFrequency(noteId) {
        // Placeholder - needs actual frequency mapping for saxophone notes
        return 440;
    }

    calculateFrequencyDelta(noteId) {
        return 30; // Placeholder
    }

    // Implementation of getDeckTop for Saxophone (adjust as needed)
    getDeckTop() {
        const saxophoneKeysElement = document.getElementById('saxophoneKeys');
        if (saxophoneKeysElement) {
            return saxophoneKeysElement.getBoundingClientRect().top;
        }
        return 0;
    }
}
