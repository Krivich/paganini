// Pure-JS pitch detector (no DOM, importable from Node and the browser).
//
//   detectYin(samples, sampleRate, opts) -> { frequency, confidence }
//
// YIN follows de Cheveigne & Kawahara (2002), FFT-accelerated autocorrelation:
// difference function -> cumulative mean normalized difference -> absolute
// threshold -> parabolic interpolation.

function nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

// In-place iterative radix-2 complex FFT.
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

function toWindow(samples, size) {
    const n = nextPow2(Math.min(size, samples.length));
    const offset = Math.max(0, samples.length - n);
    return samples.subarray ? samples.subarray(offset, offset + n) : samples.slice(offset, offset + n);
}

// Second-order Butterworth high-pass, used to strip sub-bass rumble (fans,
// handling noise, DC) before autocorrelation without touching instrument range.
function applyHighpass(samples, sampleRate, fc, q = 0.707) {
    if (!fc || fc <= 0 || fc >= sampleRate / 2) return samples;
    const w0 = 2 * Math.PI * fc / sampleRate;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    const b0 = (1 + cw) / 2;
    const b1 = -(1 + cw);
    const b2 = (1 + cw) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cw;
    const a2 = 1 - alpha;
    const out = new Float32Array(samples.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < samples.length; i++) {
        const x0 = samples[i];
        const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        out[i] = y0;
        x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    }
    return out;
}

// YIN pitch detector. Returns { frequency, confidence } where confidence is
// 1 - CMNDF[tau] in [0, 1]; frequency is 0 when no pitch passes the threshold.
export function detectYin(samples, sampleRate, options = {}) {
    const threshold = options.threshold ?? 0.15;
    const minFreq = options.minFreq ?? 40;
    const maxFreq = options.maxFreq ?? 2000;
    const windowSize = options.windowSize ?? 4096;
    const highpassHz = options.highpassHz ?? 0;
    if (!samples || samples.length < 16) return { frequency: 0, confidence: 0, mode: 'none' };

    const filtered = highpassHz > 0 ? applyHighpass(samples, sampleRate, highpassHz) : samples;
    const x = toWindow(filtered, windowSize);
    const N = x.length;
    if (N < 16) return { frequency: 0, confidence: 0, mode: 'none' };
    const W = N >> 1;
    const fftSize = N << 1;

    // Linear autocorrelation of x (zero-padded to 2N) via Wiener-Khinchin.
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    for (let i = 0; i < N; i++) re[i] = x[i];
    fft(re, im, false);
    for (let i = 0; i < fftSize; i++) {
        const rr = re[i], ii = im[i];
        re[i] = rr * rr + ii * ii;
        im[i] = 0;
    }
    fft(re, im, true);
    const acf = re;

    const prefix = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) prefix[i + 1] = prefix[i] + x[i] * x[i];

    const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
    const tauMax = Math.min(W, Math.floor(sampleRate / minFreq));
    if (tauMax <= tauMin) return { frequency: 0, confidence: 0, mode: 'none' };

    // Difference function d(tau) = sum_j (x_j - x_{j+tau})^2 over the
    // overlapping region, then cumulative mean normalization (CMNDF).
    const d = new Float64Array(tauMax + 1);
    const cmnd = new Float64Array(tauMax + 1);
    cmnd[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) {
        const left = prefix[N - tau];
        const right = prefix[N] - prefix[tau];
        let value = left + right - 2 * acf[tau];
        d[tau] = value > 0 ? value : 0;
    }
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
        running += d[tau];
        cmnd[tau] = running > 1e-12 ? d[tau] * tau / running : 1;
    }

    // Absolute threshold: first dip below `threshold`, walked down to its local
    // minimum.
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
        if (cmnd[t] < threshold) {
            while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
            tau = t;
            break;
        }
    }

    let confidence;
    let mode;
    if (tau === -1) {
        // No dip below the strict threshold. Take the global minimum, then walk
        // up through integer divisors: if a shorter lag (tau/k) is an equally
        // strong dip, that is the true fundamental (the global min landed on a
        // subharmonic ÷2, ÷3, ...). Picking the global min outright (or the
        // first local min) makes noisy input jump across the whole spectrum.
        let best = -1;
        let bestValue = Infinity;
        for (let t = tauMin; t <= tauMax; t++) {
            if (cmnd[t] < bestValue) {
                bestValue = cmnd[t];
                best = t;
            }
        }
        if (best === -1 || bestValue > 0.9) return { frequency: 0, confidence: 0, mode: 'none' };
        let cur = best;
        for (;;) {
            let moved = false;
            for (let k = 2; k <= 4; k++) {
                const cand = Math.round(cur / k);
                if (cand >= tauMin && cmnd[cand] <= bestValue + 0.15) {
                    cur = cand;
                    moved = true;
                    break;
                }
            }
            if (!moved) break;
        }
        tau = cur;
        confidence = 1 - cmnd[tau];
        mode = 'fallback';
    } else {
        confidence = 1 - cmnd[tau];
        mode = 'threshold';
    }

    // Parabolic interpolation around the minimum for sub-sample precision.
    const x0 = tau > tauMin ? tau - 1 : tau;
    const x2 = tau + 1 <= tauMax ? tau + 1 : tau;
    let betterTau;
    if (x0 === tau) {
        betterTau = cmnd[tau] <= cmnd[x2] ? tau : x2;
    } else if (x2 === tau) {
        betterTau = cmnd[tau] <= cmnd[x0] ? tau : x0;
    } else {
        const s0 = cmnd[x0], s1 = cmnd[tau], s2 = cmnd[x2];
        const denom = 2 * (2 * s1 - s2 - s0);
        betterTau = denom !== 0 ? tau + (s2 - s0) / denom : tau;
    }

    return { frequency: sampleRate / betterTau, confidence, mode };
}
