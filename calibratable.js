export class Calibratable {
    startCalibration(callback) {
        throw new Error("startCalibration method must be implemented.");
    }

    handleAudioInput(frequency) {
        throw new Error("handleAudioInput method must be implemented.");
    }

    isCalibrationComplete() {
        throw new Error("isCalibrationComplete method must be implemented.");
    }

    getCalibrationData() {
        throw new Error("getCalibrationData method must be implemented.");
    }

    resetCalibration() {
        throw new Error("resetCalibration method must be implemented.");
    }
}
