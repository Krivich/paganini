// calibration.js
export class Calibration {
    constructor(calibrationDiv, calibrationHint, calibrationProgressBar, debugCalibrationState, createFretsCallback) {
        this.calibrationDiv = calibrationDiv;
        this.calibrationHint = calibrationHint;
        this.calibrationProgressBar = calibrationProgressBar;
        this.debugCalibrationState = debugCalibrationState;
        this.calibrationState = 'lowFret1'; // Start with low fret 1
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
        this.createFretsCallback = createFretsCallback;
    }

    resetCalibration() {
        console.log("Calibration Resetting...");
        this.calibrationState = 'lowFret1'; // Start at low fret 1
        this.lowFrequencies = [];
        this.highFrequencies = [];
        this.calibrationError = false;
        localStorage.removeItem('avgLowFrequency');
        localStorage.removeItem('avgHighFrequency');
        this.calibrationProgressBar.style.width = '0%';
        this.calibrationHint.textContent = "Calibrating: Play the first note repeatedly and steadily.";
        document.getElementById('startButton').style.display = 'none';
        this.calibrationDiv.style.display = 'block';
        console.log("Calibration State:", this.calibrationState);
    }

    checkFrequencyStability(frequency, onStable) {
        this.stabilityWindow.push({ frequency, time: Date.now() });
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

    handleCalibration(frequency, gameInstance) {
        this.debugCalibrationState.textContent = this.calibrationState;
        let progress = 0;

        const handleStableFrequency = (stableFrequency) => {
            console.log("Stable frequency detected:", stableFrequency.toFixed(2), "in state:", this.calibrationState);
            if (this.calibrationState === 'lowFret1') {
                this.lowFrequencies.push(stableFrequency);
                console.log("Collected low frequencies:", this.lowFrequencies.map(f => f.toFixed(2)));
                this.calibrationHint.textContent = `Calibrating low note: ${this.lowFrequencies.length}/3 samples collected.`;
                if (this.lowFrequencies.length >= 3) {
                    const diff1 = Math.abs(this.lowFrequencies[0] - this.lowFrequencies[1]);
                    const diff2 = Math.abs(this.lowFrequencies[1] - this.lowFrequencies[2]);
                    console.log("Consistency check - Low:", diff1.toFixed(2), diff2.toFixed(2));
                    if (diff1 <= this.calibrationConsistencyTolerance && diff2 <= this.calibrationConsistencyTolerance) {
                        this.calibrationState = 'highFret1';
                        localStorage.setItem('avgLowFrequency', this.lowFrequencies.reduce((a, b) => a + b, 0) / 3);
                        this.lowFrequencies = [];
                        this.calibrationHint.textContent = "Calibrating: Now play the note at the 12th fret repeatedly and steadily.";
                        console.log("Calibration state changed to:", this.calibrationState);
                    } else {
                        this.calibrationHint.textContent = "Low note samples inconsistent. Please play a steady note.";
                        this.lowFrequencies = [];
                        console.log("Low note samples inconsistent, resetting lowFrequencies.");
                    }
                }
                progress = this.lowFrequencies.length / 3 * 0.5;
            } else if (this.calibrationState === 'highFret1') {
                this.highFrequencies.push(stableFrequency);
                console.log("Collected high frequencies:", this.highFrequencies.map(f => f.toFixed(2)));
                this.calibrationHint.textContent = `Calibrating high note (12th fret): ${this.highFrequencies.length}/3 samples collected.`;
                if (this.highFrequencies.length >= 3) {
                    const diff1 = Math.abs(this.highFrequencies[0] - this.highFrequencies[1]);
                    const diff2 = Math.abs(this.highFrequencies[1] - this.highFrequencies[2]);
                    console.log("Consistency check - High:", diff1.toFixed(2), diff2.toFixed(2));
                    if (diff1 <= this.calibrationConsistencyTolerance && diff2 <= this.calibrationConsistencyTolerance) {
                        const avgLowFrequency = parseFloat(localStorage.getItem('avgLowFrequency'));
                        const avgHighFrequency = this.highFrequencies.reduce((a, b) => a + b, 0) / 3;
                        if (avgHighFrequency - avgLowFrequency < this.minFrequencyDifference) {
                            this.calibrationError = true;
                            this.calibrationHint.textContent = `Frequency difference too small. Ensure clear low and high notes.`;
                            console.log("Calibration failed: Frequency difference too small. Resetting.");
                            this.resetCalibration();
                        } else {
                            const calibratedFreqs = this.calculateCalibratedFrequencies(avgLowFrequency, avgHighFrequency);
                            gameInstance.setCalibratedFrequencies(calibratedFreqs);

                            if (this.createFretsCallback) {
                                this.createFretsCallback();
                            }
                            this.calibrationDiv.style.display = 'none';
                            // document.getElementById('startButton').style.display = 'block';
                            this.calibrationHint.textContent = 'Calibration Complete! You can now start playing.';
                            console.log("Calibration completed successfully.");
                        }
                        this.highFrequencies = [];
                    } else {
                        this.calibrationHint.textContent = "High note samples inconsistent. Please play a steady note at the 12th fret.";
                        this.highFrequencies = [];
                        console.log("High note samples inconsistent, resetting highFrequencies.");
                    }
                }
                progress = 0.5 + this.highFrequencies.length / 3 * 0.5;
            }
            this.calibrationProgressBar.style.width = `${progress * 100}%`;
        };

        if (this.calibrationState === 'lowFret1') {
            this.calibrationHint.textContent = `Calibrating fret ${this.lowCalibrationFret}. Keep it steady.`;
            this.checkFrequencyStability(frequency, handleStableFrequency);
        } else if (this.calibrationState === 'highFret1') {
            this.calibrationHint.textContent = `Calibrating fret 12. Keep it steady.`;
            this.checkFrequencyStability(frequency, handleStableFrequency);
        } else if (this.calibrationState === 'completed') {
            this.calibrationHint.textContent = 'Calibration Complete!';
            this.calibrationProgressBar.style.width = '100%';
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
            this.calibrationHint.textContent = "Calibration failed. Please ensure proper microphone input.";
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

        console.log("Calibrated Frequencies:", calibratedFrequencies);
        this.calibrationState = 'completed';
        return calibratedFrequencies;
    }
}
