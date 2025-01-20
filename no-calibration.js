import { Calibratable } from './calibratable.js';

export class NoCalibration extends Calibratable {
    startCalibration(callback) {
        console.log("No calibration needed for this instrument.");
        if (callback) {
            callback();
        }
    }
    handleAudioInput(frequency) {}
    isCalibrationComplete() { return true; }
    getCalibrationData() { return {}; }
    resetCalibration() {}
}
