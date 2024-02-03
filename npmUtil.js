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
   * @param {number} on
   * @param {number} off
   * @param {(state: boolean) => void} callback
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

  shortAndLong({ id, push, hold: { start, end } }) {
    return (...args) => {
      const value = args[2];
      if (value === 0) {
        end(...args);
        if (new Date().getTime() - shortAndLongTimes[id] < 500) {
          push(...args);
        }
      } else {
        shortAndLongTimes[id] = new Date().getTime();
        start(...args);
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
};

/** @constant @type {NpmUtil} */
var npmUtil = new NpmUtil();