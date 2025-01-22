export class Instrument {
    constructor(name) {
        this.name = name;
        this.calibration = null; // Can be overridden by specific instruments
    }

    draw(containerElement) {
        throw new Error("draw method must be implemented.");
    }

    getNotePosition(noteId, gameArea) {
        throw new Error("getNotePosition method must be implemented.");
    }

    getExpectedFrequency(noteId) {
        throw new Error("getExpectedFrequency method must be implemented.");
    }

    calculateFrequencyDelta(noteId) {
        throw new Error("calculateFrequencyDelta method must be implemented.");
    }

    // New method to get the top position of the "deck"
    getDeckTop() {
        return 0; // Default implementation, can be overridden by subclasses
    }
}
