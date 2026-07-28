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
      key,
    );
    let newValue = currentValue + diff;
    if (toggle) {
      newValue = currentValue === 0 ? 1 : 0;
    }
    (parameter ? engine.setParameter : engine.setValue)(group, key, newValue);
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
}

/** @constant @type {NpmUtil} */
var npmUtil = new NpmUtil();
