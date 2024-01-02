/* setup { "prefix": "Behringer" } */

const log = (...args) => console.log("[NPM/Behringer]", ...args);

const range = (start, step, count) => {
  const values = [];
  for (let index = 0; index < count; index++) {
    values.push(start + step * index);
  }
  return values;
};

const CHANNEL = 7 - 1;

const COLOR_BUTTON_ORANGE = 0x00;
const COLOR_BUTTON_BLUE = 0x01;
const COLOR_BUTTON_BLUE_BLINK = 0x02;

const ENCODER_VALUE_DECREASE = 0x3f;
const ENCODER_VALUE_OFFSET = 0x40;
const ENCODER_VALUE_INCREASE = 0x41;

const BUTTON_LED_COMMAND = 0x90;
const ENCODER_LED_COMMAND = 0xb0;
const ENCODER_LED_COUNT = 15;

const CONTROLS_DECK_OFFSET = 0x40;

const CONTROLS_FX_OFFSET = 0x14;
const CONTROLS_EFFECT_ON_1 = range(0x14, 4, 4);
const CONTROLS_LAST_EFFECT_KNOB_1 = range(0x17, 4, 4);
const CONTROLS_LAST_EFFECT_KNOB_2 = range(0x27, 4, 4);

const CONTROLS_HOTCUE_OFFSET = 0x58;

const DECK_DISABLED = 0;
const DECK_ACTIVE = 1;
const DECK_ACTIVE_FOCUS = 2;
const DECK_ADDITIONAL = 3;
let decks = [
  null,
  DECK_ACTIVE_FOCUS,
  DECK_ACTIVE,
  DECK_DISABLED,
  DECK_DISABLED,
];
const getActiveDeckIndex = () => decks.indexOf(DECK_ACTIVE_FOCUS);
const getChannel = (deck = getActiveDeckIndex()) => `[Channel${deck}]`;

const midiMappings = {};

const analyzeDeckControl = (control) => {
  return {
    number: control - CONTROLS_DECK_OFFSET + 1, // 1 indexed
  };
};

const analyzeFxControl = (control) => {
  let relativeControl = control - CONTROLS_FX_OFFSET;
  const unit = relativeControl >= 16 ? 2 : 1;
  relativeControl -= unit === 2 ? 16 : 0;
  const fxNumber = Math.floor(relativeControl / 4) + 1;
  const position = relativeControl % 4;

  return {
    unit,
    fxNumber,
    position,
  };
};
const analyzeHotcueControl = (control) => {
  let relativeControl = control - CONTROLS_HOTCUE_OFFSET;
  let number = relativeControl - 4;
  if (number < 0) {
    number += 8;
  }
  number += 1; // 1 indexed
  return { number };
};

const setButtonColor = (control, color) => {
  midi.sendShortMsg(CHANNEL | BUTTON_LED_COMMAND, control, color);
};

const deckStatusToColor = (deckStatus) => {
  if (deckStatus > 2) {
    return 0;
  }
  return deckStatus;
};
const changeDeck = (newFocus) => {
  const newDecks = [...decks];

  newDecks[getActiveDeckIndex()] = DECK_ACTIVE;
  newDecks[newFocus] = DECK_ACTIVE_FOCUS;

  engine.setValue(
    "[Master]",
    "duckStrength",
    npmUtil.encodeDuckFromDecks(newDecks)
  );
};

var Behringer = {
  init() {
    log("init");
    changeDeck(1);
  },
  shutdown() {
    log("shutdown");
  },
};

/* midi 0x40-0x43 */
Behringer.deck_button_down = (channel, control) => {
  const { number } = analyzeDeckControl(control);
  changeDeck(number);

  // midi.sendShortMsg(channel | BUTTON_LED_COMMAND, control, 0x01);
};

let deckSpecificConnections;
engine.makeConnection("[Master]", "duckStrength", (value) => {
  log("duck", value, npmUtil.decodeDecksFromDuck )
  decks = npmUtil.decodeDecksFromDuck(value);
  log("decks", decks);

  range(CONTROLS_DECK_OFFSET, 1, 4).forEach((deckControl) => {
    const { number: deckNumber } = analyzeDeckControl(deckControl);
    setButtonColor(deckControl, deckStatusToColor(decks[deckNumber]));
  });

  if (deckSpecificConnections) {
    deckSpecificConnections.forEach((connection) => connection.disconnect());
  }

  deckSpecificConnections = [];

  deckSpecificConnections = deckSpecificConnections.concat(
    range(CONTROLS_HOTCUE_OFFSET, 1, 8).map((hotcueControl) => {
      const { number } = analyzeHotcueControl(hotcueControl);
      const connection = engine.makeConnection(
        getChannel(),
        `hotcue_${number}_status`,
        (value) => {
          log("connection hotcue", hotcueControl, number, value);
          setButtonColor(hotcueControl, value);
        }
      );
      connection.trigger();
      return connection;
    })
  );
});

// 2 rows * 4 fx * 4 encoders
/* midi 0x14-0x33 */
Behringer.fx_encoder = (channel, control, value) => {
  const { unit, fxNumber, position } = analyzeFxControl(control);

  const delta = value - ENCODER_VALUE_OFFSET;

  if (position === 0) {
    npmUtil.updateValue(
      `[EffectRack1_EffectUnit${unit}_Effect${fxNumber}]`,
      "meta",
      delta * 0.05
    );
  } else if (position === 3) {
    npmUtil.updateValue(`[EffectRack1_EffectUnit${unit}]`, "mix", delta * 0.05);
  } else {
    npmUtil.updateValue(
      `[EffectRack1_EffectUnit${unit}_Effect${fxNumber}]`,
      `parameter${position}`,
      delta * 0.05,
      { parameter: true }
    );
  }
  // LED += value - ENCODER_VALUE_OFFSET;
  // midi.sendShortMsg(channel | ENCODER_LED_COMMAND, control, LED);
  // log((control - 0x14) % 4);
};
// /* midi */
// Behringer.fxOn_button_down = (channel, control) => {
//   midi.sendShortMsg(channel | BUTTON_LED_COMMAND, control, 0x01);
// };

// if (typeof engine !== "undefined") {
range(CONTROLS_FX_OFFSET, 1, 32).forEach((control) => {
  const { unit, fxNumber, position } = analyzeFxControl(control);
  if (position === 0) {
    midiMappings[control] = {
      description: "",
      group: `[EffectRack1_EffectUnit${unit}_Effect${fxNumber}]`,
      key: "enabled",
      type: "BUTTON",
    };
    engine.makeConnection(
      `[EffectRack1_EffectUnit${unit}_Effect${fxNumber}]`,
      "meta",
      function (value) {
        midi.sendShortMsg(CHANNEL | ENCODER_LED_COMMAND, control, value * 15);
      }
    ).trigger();
  } else if (position === 3) {
    engine.makeConnection(
      `[EffectRack1_EffectUnit${unit}]`,
      "mix",
      function (value) {
        midi.sendShortMsg(
          CHANNEL | ENCODER_LED_COMMAND,
          control,
          value * ENCODER_LED_COUNT
        );
      }
    ).trigger();
  } else {
    engine.makeConnection(
      `[EffectRack1_EffectUnit${unit}_Effect${fxNumber}]`,
      `parameter${position}`,
      function () {
        midi.sendShortMsg(
          CHANNEL | ENCODER_LED_COMMAND,
          control,
          engine.getParameter(
            `[EffectRack1_EffectUnit${unit}_Effect${fxNumber}]`,
            `parameter${position}`
          ) * ENCODER_LED_COUNT
        );
      }
    ).trigger();
  }
});

/* midi 0x58-0x5F */
Behringer.hotcue_button_down = (channel, control) => {
  const { number } = analyzeHotcueControl(control);
  log("hotcue!", number);
  const hotcueStatus = engine.getValue(getChannel(), `hotcue_${number}_status`);
  if (hotcueStatus === 0) {
    engine.setValue(getChannel(), `hotcue_${number}_set`, 1);
  } else {
    engine.setValue(getChannel(), `hotcue_${number}_goto`, 1);
  }
};
// CONTROLS_LAST_EFFECT_KNOB_2.forEach((control) => {
//   engine.makeConnection("[EffectRack1_EffectUnit2]", "mix", function (value) {
//     midi.sendShortMsg(CHANNEL | ENCODER_LED_COMMAND, control, value * 15);
//   });
// });
// }

/* midi 0x57 */
Behringer.library_button_down = () => {
  script.toggleControl("[Skin]", "show_maximized_library"); //, 1, { toggle: true });
};

const MIDI_MAPPINGS = () => {
  return midiMappings;
};
