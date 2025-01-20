import { Calibratable } from './calibratable.js';

export class UkuleleCalibration extends Calibratable {
    constructor() {
        super();
        this.calibrationState = 'lowFret1';
        this.lowFrequencies = [];
        this.highFrequencies = [];
        this.calibratedFrequencies = {};
        this.lowCalibrationFret = 1;
        this.highCalibrationFret = 12;
        this.calibrationError = false;
        this.stabilityWindow = [];
        this.stabilityThreshold = 5;
        this.requiredStableDuration = 500;
        this.calibrationConsistencyTolerance = 3;
        this.minFrequencyDifference = 100;
        this.stabilityTimeout = null;
        this.calibrationCallback = null;
    }

    resetCalibration() {
        console.log("Ukulele Calibration Resetting...");
        this.calibrationState = 'lowFret1';
        this.lowFrequencies = [];
        this.highFrequencies = [];
        this.calibratedFrequencies = {};
        this.calibrationError = false;
        localStorage.removeItem('avgLowFrequency');
        localStorage.removeItem('avgHighFrequency');
        this.updateCalibrationUI();
    }

    startCalibration(callback) {
        console.log("Ukulele Calibration Started.");
        this.calibrationCallback = callback;
        this.resetCalibration();
        this.updateCalibrationUI();
    }

    handleAudioInput(frequency) {
        this.updateCalibrationUI(); // Keep UI updated with state
        if (this.calibrationState === 'lowFret1') {
            this.checkFrequencyStability(frequency, (stableFrequency) => {
                this.handleStableFrequencyLow(stableFrequency);
            });
        } else if (this.calibrationState === 'highFret1') {
            this.checkFrequencyStability(frequency, (stableFrequency) => {
                this.handleStableFrequencyHigh(stableFrequency);
            });
        }
    }

    checkFrequencyStability(frequency, onStable) {
        this.stabilityWindow.push({frequency, time: Date.now()});
        const windowStartTime = Date.now() - this.requiredStableDuration;
        while (this.stabilityWindow.length > 0 && this.stabilityWindow[0].time < windowStartTime) {
            this.stabilityWindow.shift();
        }

        if (this.stabilityWindow.length > 0) {
            const frequenciesInWindow = this.stabilityWindow.map(item => item.frequency);
            const minFreq = Math.min(...frequenciesInWindow);
            const maxFreq = Math.max(...frequenciesInWindow);

            if (maxFreq - minFreq <= this.stabilityThreshold) {
                if (!this.stabilityTimeout) {
                    this.stabilityTimeout = setTimeout(() => {
                        onStable(frequency);
                        this.stabilityTimeout = null;
                    }, this.requiredStableDuration);
                    console.log("Frequency considered stable:", frequency.toFixed(2), "after", this.requiredStableDuration, "ms");
                }
            } else {
                clearTimeout(this.stabilityTimeout);
                this.stabilityTimeout = null;
                console.log("Frequency unstable:", frequency.toFixed(2), "Variation:", (maxFreq - minFreq).toFixed(2));
            }
        }
    }

    handleStableFrequencyLow(stableFrequency) {
        console.log("Stable low frequency detected:", stableFrequency.toFixed(2));
        this.lowFrequencies.push(stableFrequency);
        this.updateCalibrationUI();
        if (this.lowFrequencies.length >= 3) {
            const diff1 = Math.abs(this.lowFrequencies[0] - this.lowFrequencies[1]);
            const diff2 = Math.abs(this.lowFrequencies[1] - this.lowFrequencies[2]);
            console.log("Consistency check - Low:", diff1.toFixed(2), diff2.toFixed(2));
            if (diff1 <= this.calibrationConsistencyTolerance && diff2 <= this.calibrationConsistencyTolerance) {
                this.calibrationState = 'highFret1';
                localStorage.setItem('avgLowFrequency', this.lowFrequencies.reduce((a, b) => a + b, 0) / 3);
                this.lowFrequencies = [];
                this.updateCalibrationUI();
                console.log("Calibration state changed to:", this.calibrationState);
            } else {
                this.updateCalibrationUI("Low note samples inconsistent. Please play a steady note.");
                this.lowFrequencies = [];
                console.log("Low note samples inconsistent, resetting lowFrequencies.");
            }
        }
    }

    handleStableFrequencyHigh(stableFrequency) {
        console.log("Stable high frequency detected:", stableFrequency.toFixed(2));
        this.highFrequencies.push(stableFrequency);
        this.updateCalibrationUI();
        if (this.highFrequencies.length >= 3) {
            const diff1 = Math.abs(this.highFrequencies[0] - this.highFrequencies[1]);
            const diff2 = Math.abs(this.highFrequencies[1] - this.highFrequencies[2]);
            console.log("Consistency check - High:", diff1.toFixed(2), diff2.toFixed(2));
            if (diff1 <= this.calibrationConsistencyTolerance && diff2 <= this.calibrationConsistencyTolerance) {
                const avgLowFrequency = parseFloat(localStorage.getItem('avgLowFrequency'));
                const avgHighFrequency = this.highFrequencies.reduce((a, b) => a + b, 0) / 3;
                if (avgHighFrequency - avgLowFrequency < this.minFrequencyDifference) {
                    this.calibrationError = true;
                    this.updateCalibrationUI(`Frequency difference too small. Ensure clear low and high notes.`);
                    console.log("Calibration failed: Frequency difference too small. Resetting.");
                    this.resetCalibration();
                } else {
                    this.calibratedFrequencies = this.calculateCalibratedFrequencies(avgLowFrequency, avgHighFrequency);
                    this.calibrationState = 'completed';
                    this.updateCalibrationUI('Calibration Complete!');
                    console.log("Ukulele Calibration completed successfully.");
                    if (this.calibrationCallback) {
                        this.calibrationCallback();
                    }
                }
                this.highFrequencies = [];
            } else {
                this.updateCalibrationUI("High note samples inconsistent. Please play a steady note at the 12th fret.");
                this.highFrequencies = [];
                console.log("High note samples inconsistent, resetting highFrequencies.");
            }
        }
    }

    calculateCalibratedFrequencies(baseFrequencyLow, baseFrequencyHigh) {
        if (this.calibrationError) {
            console.log("Calibration error detected, skipping frequency calculation.");
            return {};
        }
        baseFrequencyLow = parseFloat(baseFrequencyLow);
        baseFrequencyHigh = parseFloat(baseFrequencyHigh);
        if (isNaN(baseFrequencyLow) || isNaN(baseFrequencyHigh) || baseFrequencyLow <= 0 || baseFrequencyHigh <= 0 || baseFrequencyHigh <= baseFrequencyLow) {
            console.error("Invalid calibration frequencies.");
            this.updateCalibrationUI("Calibration failed. Please ensure proper microphone input.");
            return {};
        }
        const numFrets = this.highCalibrationFret - this.lowCalibrationFret;
        const frequencyRatio = Math.pow(baseFrequencyHigh / baseFrequencyLow, 1 / numFrets);
        const calibratedFrequencies = {};

        // Extrapolate frequency for fret 0
        calibratedFrequencies[0] = baseFrequencyLow / frequencyRatio;

        for (let i = this.lowCalibrationFret; i <= this.highCalibrationFret; i++) {
            calibratedFrequencies[i] = baseFrequencyLow * Math.pow(frequencyRatio, i - this.lowCalibrationFret);
        }

        // Extrapolate frequency for the 13th fret
        const frequency12 = calibratedFrequencies[12];
        const frequency11 = calibratedFrequencies[11];
        if (frequency12 && frequency11) {
            const ratio12_11 = frequency12 / frequency11;
            calibratedFrequencies[13] = frequency12 * ratio12_11;
        } else if (frequency12) {
            calibratedFrequencies[13] = frequency12 * frequencyRatio;
        }

        console.log("Calibrated Ukulele Frequencies:", calibratedFrequencies);
        return calibratedFrequencies;
    }

    isCalibrationComplete() {
        return this.calibrationState === 'completed';
    }

    updateCalibrationUI(message) {
        const hintElement = document.getElementById('calibrationHint');
        const progressBar = document.getElementById('calibrationProgressBar');
        const stateElement = document.getElementById('debugCalibrationState');

        if (hintElement) {
            if (message) {
                hintElement.textContent = message;
            } else if (this.calibrationState === 'lowFret1') {
                hintElement.textContent = `Calibrating low note: ${this.lowFrequencies.length}/3 samples collected.`;
            } else if (this.calibrationState === 'highFret1') {
                hintElement.textContent = `Calibrating high note (12th fret): ${this.highFrequencies.length}/3 samples collected.`;
            } else if (this.calibrationState === 'completed') {
                hintElement.textContent = 'Calibration Complete!';
            }
        }

        if (progressBar) {
            let progress = 0;
            if (this.calibrationState === 'lowFret1') {
                progress = this.lowFrequencies.length / 3 * 0.5;
            } else if (this.calibrationState === 'highFret1') {
                progress = 0.5 + this.highFrequencies.length / 3 * 0.5;
            } else if (this.calibrationState === 'completed') {
                progress = 1;
            }
            progressBar.style.width = `${progress * 100}%`;
        }

        if (stateElement) {
            stateElement.textContent = this.calibrationState;
        }
    }

    getCalibrationData() {
        return this.calibratedFrequencies;
    }
}