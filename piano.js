import { Instrument } from './instrument.js';
import { NoCalibration } from './no-calibration.js'; // Piano likely won't need calibration initially

export class Piano extends Instrument {
    constructor() {
        super("piano");
        this.calibration = new NoCalibration();
        this.keyMap = this.generateKeyMap();
    }

    draw(containerElement) {
        containerElement.innerHTML = '<div id="pianoKeys"></div>';
        const pianoKeys = containerElement.querySelector('#pianoKeys');
        this.renderKeys(pianoKeys);
    }

    renderKeys(pianoKeys) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const keyWidth = (100 / 28); // Approximate width for 44 keys (28 white keys)

        for (let i = 0; i < 44; i++) {
            const keyElement = document.createElement('div');
            const noteIndex = i % 12;
            const noteName = notes[noteIndex].replace('#', 'Sharp');
            const octave = Math.floor(i / 12) + 3; // Starting from octave 3

            keyElement.classList.add('piano-key');
            keyElement.style.width = `${keyWidth}%`;

            if (noteName.includes('Sharp')) {
                keyElement.classList.add('black');
                keyElement.style.width = `${keyWidth / 1.5}%`;
            } else {
                keyElement.classList.add('white');
            }

            const label = document.createElement('span');
            label.classList.add('piano-key-label');
            label.textContent = `${noteName.replace('Sharp', '#')}${octave}`;
            keyElement.appendChild(label);

            pianoKeys.appendChild(keyElement);
        }
    }

    generateKeyMap() {
        const map = {};
        let keyCounter = 1;
        // A very basic mapping - you'd need a proper frequency to MIDI/note mapping
        for (let i = 0; i < 44; i++) {
            map[i + 1] = 261.63 * Math.pow(2, (i - 24) / 12); // Approximate frequency
        }
        return map;
    }

    getNotePosition(keyNumber, gameArea) {
        const pianoKeysContainer = gameArea.parentNode.querySelector('#pianoKeys');
        if (!pianoKeysContainer) return { top: 0, left: 0 };

        const keys = pianoKeysContainer.querySelectorAll('.piano-key');
        if (keyNumber > 0 && keyNumber <= keys.length) {
            const keyRect = keys[keyNumber - 1].getBoundingClientRect();
            return {
                left: keyRect.left + keyRect.width / 2 - gameArea.offsetLeft
            };
        }
        return { left: 0 };
    }


    getExpectedFrequency(keyNumber) {
        return this.keyMap[keyNumber];
    }

    calculateFrequencyDelta(keyNumber) {
        return 20; // A generic delta for piano for now
    }
}
