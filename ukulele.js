import { Instrument } from './instrument.js';
import { UkuleleCalibration } from './ukulele-calibration.js';

export class Ukulele extends Instrument {
    constructor() {
        super("ukulele");
        this.calibration = new UkuleleCalibration();
        // Which of the 4 drawn strings the melody is played on (0 = top).
        // Song data is fret-only, so this is a visual cue the player picks by
        // tapping the neck; remembered across reloads.
        this.melodyString = 0;
        try {
            const saved = parseInt(localStorage.getItem('ukulele.melodyString'), 10);
            if (saved >= 0 && saved < 4) this.melodyString = saved;
        } catch (e) { /* localStorage unavailable */ }
    }

    draw(containerElement) {
        containerElement.innerHTML = `
            <div id="ukuleleHead"></div>
            <div id="ukuleleNeck"></div>
            <div id="ukuleleResonator">
                <div id="soundHole"></div>
            </div>
        `;
        const neck = containerElement.querySelector('#ukuleleNeck');
        this.renderStrings(neck);
        this.renderFrets(neck);
        // Feedback markers: green = where to press, red = where the note was
        // actually heard.
        const heard = document.createElement('div');
        heard.id = 'ukuleleHeard';
        const target = document.createElement('div');
        target.id = 'ukuleleTarget';
        neck.appendChild(heard);
        neck.appendChild(target);
        neck.title = 'Tap a string to set the melody string';
        neck.addEventListener('click', (e) => this.onNeckClick(e));
    }

    // Tap the neck near a string to make that string the melody string.
    onNeckClick(e) {
        const rect = e.currentTarget.getBoundingClientRect();
        if (!rect.height) return;
        const y = (e.clientY - rect.top) / rect.height;
        // Drawn strings sit at 15%, 40%, 65%, 90% of the neck height.
        const idx = Math.max(0, Math.min(3, Math.round((y - 0.15) / 0.25)));
        this.setMelodyString(idx);
    }

    setMelodyString(index) {
        this.melodyString = index;
        try { localStorage.setItem('ukulele.melodyString', String(index)); } catch (e) { /* ignore */ }
        const strings = document.querySelectorAll('#ukuleleNeck .ukulele-string');
        strings.forEach((s, i) => {
            s.classList.toggle('melody-string', i === index);
            s.classList.toggle('active', i === index && this.targetActive === true);
        });
        const target = document.getElementById('ukuleleTarget');
        if (target && target.style.display !== 'none') {
            target.style.top = `${15 + 25 * index}%`;
        }
    }

    renderStrings(neckElement) {
        neckElement.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const stringElement = document.createElement('div');
            stringElement.classList.add('ukulele-string');
            stringElement.style.top = `${15 + (i * 25)}%`;
            if (i === this.melodyString) stringElement.classList.add('melody-string');
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
            fretElem.style.left = `${normalizedFretPos * neckWidth * 1.9}px`;
            neckElement.appendChild(fretElem);
        }
    }

    // Fraction (0..1) across the neck where a finger presses for `fret`.
    // Fret N is the gap between wire N-1 and wire N (fret 1 = nut..wire 1);
    // fret 0 (open string) sits on the nut.
    pressFrac(fret) {
        const wireFrac = (f) => (1 - Math.pow(2, -f / 12)) * 1.9;
        if (fret <= 0) return 0.015;
        if (fret <= 12) {
            const left = fret === 1 ? 0 : wireFrac(fret - 1);
            return (left + wireFrac(fret)) / 2;
        }
        const step = wireFrac(12) - wireFrac(11);
        return wireFrac(12) + step * (fret - 12);
    }

    // Fractional fret of a frequency (ukulele is chromatic, so one fret = one
    // semitone). null when we don't have a calibrated open-string frequency.
    freqToFret(frequency) {
        const f0 = this.calibration && this.calibration.calibratedFrequencies
            ? this.calibration.calibratedFrequencies[0] : null;
        if (!f0 || frequency <= 0) return null;
        return 12 * Math.log2(frequency / f0);
    }

    // Green marker: where the current target note must be pressed.
    showTarget(fret) {
        const el = document.getElementById('ukuleleTarget');
        this.targetActive = fret != null;
        const strings = document.querySelectorAll('#ukuleleNeck .ukulele-string');
        strings.forEach((s, i) => s.classList.toggle('active', fret != null && i === this.melodyString));
        if (!el) return;
        if (fret == null) { el.style.display = 'none'; return; }
        el.style.left = `${this.pressFrac(fret) * 100}%`;
        el.style.top = `${15 + 25 * this.melodyString}%`;
        el.style.display = 'block';
    }

    // Red marker: where the note the mic actually heard lies on the neck.
    // Held for a moment after the last clear pitch so a decaying pluck stays
    // visible instead of blinking off between picks.
    showHeard(frequency) {
        const el = document.getElementById('ukuleleHeard');
        if (!el) return;
        const fret = frequency > 0 ? this.freqToFret(frequency) : null;
        if (fret != null && fret >= -0.5 && fret <= 24) {
            this.lastHeardFret = fret;
            this.lastHeardTime = performance.now();
        }
        const fresh = this.lastHeardTime && (performance.now() - this.lastHeardTime < 900);
        if (!fresh) { el.style.display = 'none'; return; }
        el.style.left = `${this.pressFrac(this.lastHeardFret) * 100}%`;
        el.style.display = 'block';
    }

    getNotePosition(fret, gameArea) {
        const neck = document.getElementById('ukuleleNeck');
        if (!neck) return { left: 0 };
        const neckRect = neck.getBoundingClientRect();
        const frets = neck.querySelectorAll('.fret');
        if (!frets.length) return { left: neckRect.left - gameArea.offsetLeft };

        const wireCenter = (i) => {
            const r = frets[i].getBoundingClientRect();
            return r.left + r.width / 2;
        };
        let centerX;
        if (fret <= 0) {
            centerX = neckRect.left; // open string: the nut
        } else if (fret <= frets.length) {
            const leftEdge = fret === 1 ? neckRect.left : wireCenter(fret - 2);
            centerX = (leftEdge + wireCenter(fret - 1)) / 2;
        } else {
            const last = wireCenter(frets.length - 1);
            const prev = wireCenter(frets.length - 2);
            centerX = last + (last - prev) * (fret - frets.length);
        }
        return { left: centerX - gameArea.offsetLeft };
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
