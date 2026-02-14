const shortAndLongTimes = {};

class NpmUtil {
  setTimeout(callback, millisecondsDelay) {
    const timerHandle = engine.beginTimer(millisecondsDelay, () => {
      engine.stopTimer(timerHandle);
      callback();
    });
  }

  /**
   * Callback-factory for `indicator_500ms` that gets called in a specified cycle on both edges
   * @param {number} on how many ticks the on state lasts
   * @param {number} off how many ticks the off state lasts
   * @param {(state: boolean) => void} callback Callback on both edges that gets passed next state as argument
   * @returns
   */
  engineBlink(on, off, callback) {
    let counter = 0;
    let previousValue = null;
    return () => {
      const newValue = counter < on;
      if (newValue !== previousValue) {
        callback(newValue);
      }
      previousValue = newValue;
      counter += 1;
      if (counter >= on + off) {
        counter = 0;
      }
    };
  }

  updateValue(group, key, diff, { parameter = false, toggle = false } = {}) {
    const currentValue = (parameter ? engine.getParameter : engine.getValue)(
      group,
      key
    );
    let newValue = currentValue + diff;
    if (toggle) {
      newValue = currentValue === 0 ? 1 : 0;
    }
    (parameter ? engine.setParameter : engine.setValue)(group, key, newValue);
  }

  shortAndLong({
    id,
    push,
    hold: {
      start = (...args) => {},
      end = (...args) => {},
      both = (...args) => {},
    },
  }) {
    return (...args) => {
      const value = args[2];
      if (value === 0) {
        end(...args);
        both(...args);
        if (new Date().getTime() - shortAndLongTimes[id] < 500) {
          push(...args);
        }
      } else {
        shortAndLongTimes[id] = new Date().getTime();
        start(...args);
        both(...args);
      }
    };
  }

  sendSysex(data) {
    midi.sendSysexMsg([0xf0, ...data, 0xf7], data.length + 2);
  }

  range(start, step, count) {
    const values = [];
    for (let index = 0; index < count; index++) {
      values.push(start + step * index);
    }
    return values;
  }

  /**
   * Takes arrays or single values and returns an array
   * @template T
   * @param {T | Array<T>} arrayOrSingleValue
   * @returns {Array<T>}
   */
  ensureArray(arrayOrSingleValue) {
    if (Array.isArray(arrayOrSingleValue)) {
      return arrayOrSingleValue;
    }

    return [arrayOrSingleValue];
  }

  flattenArray(arrayOrSingleValue) {
    const result = [];
    for (let element of arrayOrSingleValue) {
      if (Array.isArray(element)) {
        result.push(...this.flattenArray(element));
      } else {
        result.push(element);
      }
    }
    return result;
  }

  /**
   * Batch connect MIDI handlers to all combinations of prefixes and notes
   * @param {number|Array<number>} midiPrefixes One or more MIDI prefixes
   * @param {number|Array<number>} midiNotes One or more MIDI notes
   * @param {midi.InputCallback} handler MIDI handler
   * @returns {Array<MidiInputHandlerController>} Array of MIDI connections
   */
  connectMidi(midiPrefixes, midiNotes, handler) {
    return npmUtil.flattenArray(
      this.ensureArray(midiPrefixes).map((midiPrefix) =>
        this.ensureArray(midiNotes).map((midiNote) =>
          midi.makeInputHandler(midiPrefix, midiNote, handler)
        )
      )
    );
  }

}

/** @constant @type {NpmUtil} */
var npmUtil = new NpmUtil();
