// Spectral subtraction: strips the stationary background (fan / hum) from a
// frame before pitch detection.
//
// A cheap USB mic on a projector hears the projector's fan as a strong, steady
// spectrum (e.g. a 436 Hz whine) that swamps a quiet note. YIN locks onto that
// steady component instead of the note. Since the fan is stationary, we measure
// its magnitude spectrum once and over-subtract it from every frame while
// keeping the frame's own phase.
//
// Pure JS (no DOM), importable from Node and the browser.

function nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

// In-place iterative radix-2 complex FFT (same as pitch-detector.js).
function fft(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            const tr = re[i]; re[i] = re[j]; re[j] = tr;
            const ti = im[i]; im[i] = im[j]; im[j] = ti;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (inverse ? 2 : -2) * Math.PI / len;
        const wr = Math.cos(ang);
        const wi = Math.sin(ang);
        const half = len >> 1;
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < half; k++) {
                const ur = re[i + k], ui = im[i + k];
                const xr = re[i + k + half], xi = im[i + k + half];
                const vr = xr * cr - xi * ci;
                const vi = xr * ci + xi * cr;
                re[i + k] = ur + vr;
                im[i + k] = ui + vi;
                re[i + k + half] = ur - vr;
                im[i + k + half] = ui - vi;
                const ncr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = ncr;
            }
        }
    }
    if (inverse) {
        for (let i = 0; i < n; i++) {
            re[i] /= n;
            im[i] /= n;
        }
    }
}

function windowOf(samples, size) {
    const n = nextPow2(Math.min(size, samples.length));
    return { n, offset: Math.max(0, samples.length - n) };
}

// Magnitude spectrum (bins 0..n/2) of the last `size` samples of `samples`.
export function magnitudeSpectrum(samples, size) {
    const { n, offset } = windowOf(samples, size);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = samples[offset + i];
    fft(re, im, false);
    const half = n >> 1;
    const mag = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) mag[k] = Math.hypot(re[k], im[k]);
    return mag;
}

// Remove `alpha * backgroundMag` from the frame's spectrum, keeping the frame's
// phase, and return the reconstructed time signal (length = power-of-2 window).
export function subtractBackground(samples, size, backgroundMag, alpha = 2, floorRatio = 0.05) {
    const { n, offset } = windowOf(samples, size);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = samples[offset + i];
    fft(re, im, false);
    const half = n >> 1;
    for (let k = 0; k < n; k++) {
        const mag = Math.hypot(re[k], im[k]);
        if (mag < 1e-12) continue;
        const bk = backgroundMag[k <= half ? k : n - k] || 0;
        const cleansed = Math.max(mag - alpha * bk, floorRatio * mag);
        const s = cleansed / mag;
        re[k] *= s;
        im[k] *= s;
    }
    fft(re, im, true);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = re[i];
    return out;
}
