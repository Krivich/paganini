import { Instrument } from './instrument.js';
import { UkuleleCalibration } from './ukulele-calibration.js';

export class Ukulele extends Instrument {
    constructor() {
        super("ukulele");
        this.calibration = new UkuleleCalibration();
    }

    draw(containerElement) {
        containerElement.innerHTML = `
            <div id="ukuleleHead"></div>
            <div id="ukuleleNeck"></div>
            <div id="ukuleleResonator">
                <div id="soundHole"></div>
            </div>
        `;
        this.renderStrings(containerElement.querySelector('#ukuleleNeck'));
        this.renderFrets(containerElement.querySelector('#ukuleleNeck'));
    }

    renderStrings(neckElement) {
        neckElement.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const stringElement = document.createElement('div');
            stringElement.classList.add('ukulele-string');
            stringElement.style.top = `${15 + (i * 25)}%`;
            neckElement.appendChild(stringElement);
        }
    }

    renderFrets(neckElement) {
        const neckWidth = neckElement.offsetWidth;
        const scaleLength = 380;
        for (let fret = 1; fret <= 12; fret++) {
            const fretPos = scaleLength - (scaleLength / Math.pow(2, fret / 12));
            const normalizedFretPos = fretPos / scaleLength;
            const fretElem = document.createElement('div');
            fretElem.classList.add('fret');
            fretElem.style.left = `${normalizedFretPos * neckWidth}px`;
            neckElement.appendChild(fretElem);
        }
    }

    getNotePosition(fret, gameArea) {
        const neck = gameArea.parentNode.querySelector('#ukuleleNeck');
        if (!neck) return { top: 0, left: 0 };
        const neckRect = neck.getBoundingClientRect();
        const fretElements = neck.querySelectorAll('.fret');

        let leftPosition;
        if (fret === 0) {
            leftPosition = neckRect.left + (neckRect.width * 0.05); // Approximate open string position
        } else if (fret > 0 && fret <= fretElements.length) {
            const fretRect = fretElements[fret - 1].getBoundingClientRect();
            leftPosition = fretRect.left + fretRect.width / 2 - gameArea.offsetLeft;
        } else {
            leftPosition = 0;
        }

        return { left: leftPosition }; // Only horizontal position
    }


    getExpectedFrequency(fret) {
        return this.calibration.calibratedFrequencies[fret];
    }

    calculateFrequencyDelta(fret) {
        const freq1 = this.calibration.calibratedFrequencies[fret];
        const freq2 = this.calibration.calibratedFrequencies[parseInt(fret) + 1];
        let dynamicDelta = 20;

        if (freq1 && freq2) {
            dynamicDelta = Math.abs(freq2 - freq1) * 0.4;
        }

        const fixedTolerance = 15;
        return Math.max(dynamicDelta, fixedTolerance);
    }

    // Implementation of getDeckTop for Ukulele
    getDeckTop() {
        const neckElement = document.getElementById('ukuleleNeck');
        if (neckElement) {
            return neckElement.getBoundingClientRect().top;
        }
        return 0;
    }
}
