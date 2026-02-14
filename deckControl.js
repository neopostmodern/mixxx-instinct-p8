/**
 * @typedef { 1 | 2 | 3 | 4 } DeckNumber
 */

const DUCK_SIZE = 2 ** 16;

const DECK_DISABLED = 0;
const DECK_ACTIVE = 1;
const DECK_ACTIVE_FOCUS = 2;
const DECK_ADDITIONAL = 3;

const DECK_SIBBLINGS = {
  1: 3,
  2: 4,
  3: 1,
  4: 2,
};

class Test {
  constructor() {
    console.log("lol");
  }
}
new Test();

class DeckControl {
  constructor() {
    this.decks = [
      null,
      DECK_ACTIVE_FOCUS,
      DECK_ACTIVE,
      DECK_DISABLED,
      DECK_DISABLED,
    ];
    this.callbacks = {};
    this.events = {};

    this.events.onDeckChange = this._addEventHandler("onDeckChange");

    engine
      .makeConnection("[Master]", "duckStrength", (value) => {
        print("duck " + value);
        this.decks = this.decodeDecksFromDuck(value);

        this.callbacks.onDeckChange.forEach((callback) => callback());
      })
      .trigger();
  }

  getActiveFocusedDeckIndex() {
    return /** @type {DeckNumber} */ (this.decks.indexOf(DECK_ACTIVE_FOCUS));
  }

  /**
   * Set the new focused deck in memory (incl. updating the engine & MIDI devices)
   * @param {DeckNumber} newFocus
   */
  setActiveFocusedDeckIndex(newFocus) {
    const sibblingIndex = DECK_SIBBLINGS[newFocus];
    if (this.decks[sibblingIndex]) {
      this.decks[sibblingIndex] = DECK_DISABLED;
    } else {
      this.decks[this.getActiveFocusedDeckIndex()] = DECK_ACTIVE;
    }
    this.decks[newFocus] = DECK_ACTIVE_FOCUS;

    engine.setValue(
      "[Master]",
      "duckStrength",
      deckControl.encodeDuckFromDecks()
    );
  }

  getChannel(deck = this.getActiveFocusedDeckIndex()) {
    return `[Channel${deck}]`;
  }

  encodeDuckFromDecks() {
    let duckCode = 0;
    for (let deckIndex = 0; deckIndex < 4; deckIndex++) {
      duckCode += this.decks[deckIndex + 1] << (deckIndex * 2);
    }
    return duckCode / DUCK_SIZE;
  }

  decodeDecksFromDuck(value) {
    const duckValue = value * DUCK_SIZE;
    const decks = [null, null, null, null, null];
    for (let deckIndex = 0; deckIndex < 4; deckIndex++) {
      decks[deckIndex + 1] = (duckValue >> (deckIndex * 2)) & 3;
    }
    return decks;
  }

  ejectDeck(deckNumber) {
    const group = this.getChannel(deckNumber);
    if (engine.getValue(group, "play")) {
      return;
    }

    engine.setValue(group, "eject", 1);
    engine.setValue(group, "pregain", 1);
    engine.setValue(group, "keylock", 0);
    engine.setValue("[QuickEffectRack1_" + group + "]", "super1", 0.5);
    engine.setValue(
      "[EffectRack1_EffectUnit" +
        group.replace("[Channel", "").replace("]", "") +
        "]",
      "mix",
      0
    );
    for (var i = 1; i <= 3; i++) {
      engine.setValue(
        "[EqualizerRack1_" + group + "_Effect1]",
        "parameter" + i,
        1
      );
    }
    for (var deckIndex = 1; deckIndex <= 4; deckIndex++) {
      engine.setValue(
        deckControl.getChannel(/** @type {DeckNumber} */ (deckIndex)),
        "pfl",
        deckIndex === deckNumber ? 1 : 0
      );
    }
  }

  /**
   * Create a function that converts control numbers to deck numbers
   * @param {number} controlsDeckOffset
   * @returns {(controlNumber: number) => { number: DeckNumber, physicalNumber: DeckNumber }}
   */
  fx_analyzeDeckControl(controlsDeckOffset) {
    return (control) => {
      let physicalNumber =
        /** @type {DeckNumber} */ control - controlsDeckOffset + 1;
      /** @type {DeckNumber} */
      let number;
      switch (physicalNumber) {
        case 1:
          number = 3;
          break;
        case 2:
          number = 1;
          break;
        case 3:
          number = 2;
          break;
        case 4:
          number = 4;
          break;
        default:
          throw Error(
            `Illegal deck: control ${control} interpreted as physical ${physicalNumber}`
          );
      }
      return { number, physicalNumber };
    };
  }

  /**
   * Create a function that converts deck numbers to control numbers
   * @param {number} controlsDeckOffset
   * @returns {(deckNumber: DeckNumber) => number}
   */
  fx_deckNumberToControl(controlsDeckOffset) {
    return (deckNumber) => {
      switch (deckNumber) {
        case 3:
          return controlsDeckOffset;
        case 1:
          return controlsDeckOffset + 1;
        case 2:
          return controlsDeckOffset + 2;
        case 4:
          return controlsDeckOffset + 3;
        default:
          throw Error(`Illegal deck number: ${deckNumber}`);
      }
    };
  }

  _addEventHandler(name) {
    this.callbacks[name] = [];

    return (callback) => {
      print("sub " + name + " > " + callback);
      this.callbacks[name].push(callback);
    };
  }
}
var deckControl = new DeckControl();
