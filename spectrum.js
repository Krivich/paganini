// Bottom-of-screen FFT strip: a live "what the program hears" view.
// Bars are drawn on a log-frequency axis so the low-frequency fan/hum peak and
// the ukulele notes are both visible. The accepted peak (the frame that passed
// the gate and was forwarded to calibration / the game) is marked in green, and
// the current target note is marked with a yellow dashed line.
//
// Not part of pitch detection itself; purely a diagnostic overlay.

const FLOOR_DB = -90;
const CEIL_DB = -15;
const MIN_HZ = 30;
const BAR_WIDTH = 2;

export class SpectrumStrip {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.w = 0;
        this.h = 0;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.w = this.canvas.clientWidth || 800;
        this.h = this.canvas.clientHeight || 48;
        this.canvas.width = Math.round(this.w * dpr);
        this.canvas.height = Math.round(this.h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    freqToX(frequency, fMin, fMax) {
        if (frequency <= 0) return -1;
        const t = Math.log(frequency / fMin) / Math.log(fMax / fMin);
        return t * this.w;
    }

    levelOf(db) {
        const t = (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB);
        return Math.max(0, Math.min(1, t));
    }

    draw({ freqDb, sampleRate, fftSize, settings, acceptedFrequency, targetFrequency, backgroundSpectrum }) {
        if (!freqDb) return;
        if (this.canvas.clientWidth !== this.w) this.resize();

        const ctx = this.ctx;
        const w = this.w;
        const h = this.h;
        if (w <= 0 || h <= 0) return;

        const binHz = sampleRate / fftSize;
        const binCount = freqDb.length;
        const fMin = MIN_HZ;
        const fMax = Math.min(sampleRate / 2, (settings && settings.maxFreq ? settings.maxFreq : 2000) * 2);
        const logRange = Math.log(fMax / fMin);

        ctx.clearRect(0, 0, w, h);

        // Bars (log-frequency axis).
        for (let x = 0; x < w; x += BAR_WIDTH) {
            const frequency = fMin * Math.exp((x / w) * logRange);
            const bin = Math.min(binCount - 1, Math.max(0, Math.round(frequency / binHz)));
            const level = this.levelOf(freqDb[bin]);
            const barHeight = level * h;
            const v = Math.round(level * 255);
            ctx.fillStyle = `rgb(${Math.round(40 + v * 0.35)},${Math.round(90 + v * 0.45)},${Math.round(140 + v * 0.4)})`;
            ctx.fillRect(x, h - barHeight, BAR_WIDTH, barHeight);
        }

        // Measured background profile (linear amplitude -> dB), the floor the
        // noise gate compares against. The fan/hum shows up as an orange spike.
        if (backgroundSpectrum) {
            ctx.strokeStyle = 'rgba(255,150,0,0.65)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 0; x <= w; x += BAR_WIDTH) {
                const frequency = fMin * Math.exp((x / w) * logRange);
                const bin = Math.min(binCount - 1, Math.max(0, Math.round(frequency / binHz)));
                const db = 20 * Math.log10(backgroundSpectrum[bin] + 1e-12);
                const y = h - this.levelOf(db) * h;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Target note (what should be played now).
        if (targetFrequency) {
            const x = this.freqToX(targetFrequency, fMin, fMax);
            ctx.strokeStyle = 'rgba(255,213,74,0.9)';
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Accepted peak: the frame that passed the gate and was forwarded to
        // calibration / the game as a detected note.
        if (acceptedFrequency) {
            const x = this.freqToX(acceptedFrequency, fMin, fMax);
            ctx.fillStyle = '#3dff5b';
            ctx.fillRect(x - 1, 0, 3, h);
        }
    }
}
