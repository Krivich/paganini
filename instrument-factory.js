// instrument-factory.js
import { Ukulele } from './ukulele.js';
import { Piano } from './piano.js';
import { Saxophone } from './saxophone.js'; // Import the Saxophone class

export class InstrumentFactory {
    static createInstrument(instrumentName, containerElement) {
        let instrument = null;
        if (instrumentName === 'ukulele') {
            instrument = new Ukulele();
        } else if (instrumentName === 'piano') {
            instrument = new Piano();
        } else if (instrumentName === 'saxophone') {
            instrument = new Saxophone();
        }

        if (instrument) {
            instrument.draw(containerElement);
            return instrument;
        } else {
            console.error(`Instrument "${instrumentName}" is not supported.`);
            return null;
        }
    }
}
