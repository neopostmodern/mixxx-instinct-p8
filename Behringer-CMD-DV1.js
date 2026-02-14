/* setup { "prefix": "Behringer" } */

const log = (...args) => console.log("[NPM/Behringer]", ...args);

const CHANNEL = 7 - 1;

const MIDI_BUTTON_DOWN = 0x96;
const MIDI_BUTTON_UP = 0x86;
const MIDI_BUTTON_BOTH = [MIDI_BUTTON_DOWN, MIDI_BUTTON_UP];
const MIDI_KNOB_TURN = 0xb6;

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
const CONTROLS_EFFECT_ON_1 = npmUtil.range(0x14, 4, 4);
const CONTROLS_LAST_EFFECT_KNOB_1 = npmUtil.range(0x17, 4, 4);
const CONTROLS_LAST_EFFECT_KNOB_2 = npmUtil.range(0x27, 4, 4);

const CONTROLS_FUNCTIONS_OFFSET = 0x54;

const CONTROLS_HOTCUE_OFFSET = 0x58;

const midiMappings = {};

const analyzeDeckControl = deckControl.fx_analyzeDeckControl(CONTROLS_DECK_OFFSET);
const deckNumberToControl = deckControl.fx_deckNumberToControl(CONTROLS_DECK_OFFSET);

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
const setEncoderLEDs = (control, normalizedValue) => {
  midi.sendShortMsg(
    CHANNEL | ENCODER_LED_COMMAND,
    control,
    normalizedValue * (ENCODER_LED_COUNT - 1) + 1
  );
};

//#region DECK CONTROL
const deckStatusToColor = (deckStatus) => {
  if (deckStatus > 2) {
    return 0;
  }
  return deckStatus;
};

const copyDeck = (fromDeck, toDeck) => {
  log("Copying deck from", fromDeck, "to", toDeck);
  engine.setValue(deckControl.getChannel(toDeck), "CloneFromDeck", fromDeck);
  const valuesToCopy = [
    (deck) => [deckControl.getChannel(deck), "sync_enabled"],
    (deck) => [deckControl.getChannel(deck), "pregain"],
    ...npmUtil
      .range(1, 1, 3)
      .map((parameterIndex) => (deck) => [
        `[EqualizerRack1_${deckControl.getChannel(deck)}_Effect1]`,
        `parameter${parameterIndex}`,
      ]),
    (deck) => [`[QuickEffectRack1_${deckControl.getChannel(deck)}]`, "super1"],
    (deck) => [deckControl.getChannel(deck), "keylock"],
    // todo: effect rack "send" assignments
    ...npmUtil
      .range(1, 1, 4)
      .map((stemIndex) => (deck) => [
        `[Channel${deck}_Stem${stemIndex}]`,
        "volume",
      ]),
  ];

  npmUtil.setTimeout(() => {
    valuesToCopy.forEach((valuePair) => {
      const [fromGroup, fromKey] = valuePair(fromDeck);
      const [toGroup, toKey] = valuePair(toDeck);
      engine.setValue(toGroup, toKey, engine.getValue(fromGroup, fromKey));
    });
  }, 100);
};
const moveDeck = (fromDeck, toDeck) => {
  engine.setValue(deckControl.getChannel(toDeck), "volume", 0);
  copyDeck(fromDeck, toDeck);
  npmUtil.setTimeout(() => {
    engine.setValue(
      deckControl.getChannel(toDeck),
      "volume",
      engine.getValue(deckControl.getChannel(fromDeck), "volume")
    );
    engine.setValue(deckControl.getChannel(fromDeck), "volume", 0);
    engine.setValue(deckControl.getChannel(fromDeck), "play", 0);
    deckControl.ejectDeck(fromDeck);
  }, 2000);
};
const swapDecks = (fromDeck, toDeck) => {
  if (engine.getValue(deckControl.getChannel(toDeck), "track_loaded")) {
    const freeDeck = npmUtil
      .range(1, 1, engine.getValue("[App]", "num_decks"))
      .find(
        (deckNumber) =>
          !engine.getValue(deckControl.getChannel(deckNumber), "track_loaded")
      );
    if (!freeDeck) {
      log("Warning! No free deck for swapping available");
      return;
    }

    moveDeck(toDeck, freeDeck);
    npmUtil.setTimeout(() => moveDeck(fromDeck, toDeck), 3000);
    npmUtil.setTimeout(() => moveDeck(freeDeck, fromDeck), 6000);
  } else {
    moveDeck(fromDeck, toDeck);
  }
};
//#endregion

//#region CONNECTIONS
const connectHotcueLEDs = (color = COLOR_BUTTON_BLUE) => {
  Behringer.connections.hotcues = npmUtil.range(CONTROLS_HOTCUE_OFFSET, 1, 8).map(
    (hotcueControl) => {
      const { number } = analyzeHotcueControl(hotcueControl);
      const connection = engine.makeConnection(
        deckControl.getChannel(),
        `hotcue_${number}_status`,
        (value) => {
          setButtonColor(hotcueControl, value ? color : COLOR_BUTTON_ORANGE);
        }
      );
      connection.trigger();
      return connection;
    }
  );
};
const disconnectHotcueLEDs = () => {
  Behringer.connections.hotcues.forEach((connection) =>
    connection.disconnect()
  );
};
const disconnectAllDeckSpecificConnections = () => {
  disconnectHotcueLEDs();
};

const connectDeckFocusedLED = () => {
  const connection = engine.makeConnection(
    "[App]",
    "indicator_500ms",
    npmUtil.engineBlink(2, 2, (on) => {
      setButtonColor(
        deckNumberToControl(deckControl.getActiveFocusedDeckIndex()),
        on ? COLOR_BUTTON_ORANGE : COLOR_BUTTON_BLUE
      );
    })
  );
  connection.trigger();
  Behringer.connections.deckFocusedLED = connection;
};
const disconnectDeckFocusedLED = () => {
  if (Behringer.connections.deckFocusedLED) {
    Behringer.connections.deckFocusedLED.disconnect();
  }
};
const setDeckLEDs = () => {
  disconnectDeckFocusedLED();
  npmUtil.range(CONTROLS_DECK_OFFSET, 1, 4).map((deckControl_) => {
    const { number: deckNumber } = analyzeDeckControl(deckControl_);
    setButtonColor(deckControl_, deckStatusToColor(deckControl.decks[deckNumber]));
  });
  connectDeckFocusedLED();
};

const connectDeckVolume = () => {
  Behringer.connections.deckVolume = npmUtil.range(CONTROLS_DECK_OFFSET, 1, 4).map(
    (deckControl_) => {
      const { number } = analyzeDeckControl(deckControl_);
      const connection = engine.makeConnection(
        deckControl.getChannel(number),
        "volume",
        (value) => {
          setEncoderLEDs(deckControl, value);
        }
      );
      connection.trigger();
      return connection;
    }
  );
};
const disconnectDeckVolume = () => {
  Behringer.connections.deckVolume.forEach((connection) =>
    connection.disconnect()
  );
};

const connectEffectButtonsAndEncoders = () => {
  npmUtil.range(CONTROLS_FX_OFFSET, 1, 2 * 4 * 4).forEach((control) => {
    const { unit, fxNumber, position } = analyzeFxControl(control);

    if (fxNumber === 4) {
      // FX4 is used for stems
      return;
    }

    if (position === 0) {
      // todo
      midiMappings[control] = {
        description: "",
        group: `[EffectRack1_EffectUnit${unit}_Effect${fxNumber}]`,
        key: "enabled",
        type: "BUTTON",
      };
      engine
        .makeConnection(
          `[EffectRack1_EffectUnit${unit}_Effect${fxNumber}]`,
          "meta",
          function (value) {
            setEncoderLEDs(control, value);
          }
        )
        .trigger();
    } else if (position === 3) {
      engine
        .makeConnection(
          `[EffectRack1_EffectUnit${unit}]`,
          "mix",
          function (value) {
            midi.sendShortMsg(
              CHANNEL | ENCODER_LED_COMMAND,
              control,
              value * ENCODER_LED_COUNT
            );
          }
        )
        .trigger();
    } else {
      engine
        .makeConnection(
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
        )
        .trigger();
    }
  });
};

const connectStemLEDs = () => {
  npmUtil.range(CONTROLS_FX_OFFSET, 1, 2 * 4 * 4).forEach((control) => {
    const { unit, fxNumber, position } = analyzeFxControl(control);

    if (fxNumber !== 4) {
      // only FX4 is used for stems
      return;
    }

    const channel = unit; // todo: make 4-deck compatible
    const stem = position + 1;

    log("connect", channel, stem);

    engine
      .makeConnection(`[Channel${channel}_Stem${stem}]`, "volume", (value) => {
        setEncoderLEDs(control, value);
      })
      .trigger();
  });
};
//#endregion

var Behringer = {
  mode: {
    erase: false,
    store: false,
    holdDeck: null,
  },
  connections: {
    hotcues: [],
    deckVolume: [],
    deckFocusedLED: null,
    deckVolumeAsEffect: [],
  },
  init() {
    log("init");

    deckControl.setActiveFocusedDeckIndex(1); // triggers connectHotcueLEDs
    connectDeckVolume();
    connectEffectButtonsAndEncoders();
    connectStemLEDs();
  },
  shutdown() {
    log("shutdown");
  },
};

deckControl.events.onDeckChange(() => {
  setDeckLEDs();

  disconnectAllDeckSpecificConnections();
  connectHotcueLEDs();
})

const getAssignmentForDeckEncoderAsEffect = (deckNumber, physicalNumber) => {
  if (physicalNumber <= 3) {
    return [
      `[EqualizerRack1_${deckControl.getChannel(deckNumber)}_Effect1]`,
      `parameter${physicalNumber}`,
    ];
  }
  return [`[QuickEffectRack1_${deckControl.getChannel(deckNumber)}]`, "super1"];
};

/* midi 0x40-0x43 */
Behringer.deck_button_both = npmUtil.shortAndLong({
  id: "deck",
  push: (channel, control) => {
    const { number } = analyzeDeckControl(control);
    if (Behringer.mode.store) {
      engine.setParameter(
        deckControl.getChannel(number),
        "LoadSelectedTrack",
        1
      );
    } else if (Behringer.mode.holdDeck) {
      swapDecks(Behringer.mode.holdDeck, number);
    } else {
      deckControl.setActiveFocusedDeckIndex(number);
    }
  },
  hold: {
    start: (channel, control) => {
      if (Behringer.mode.holdDeck) {
        return;
      }
      const { number } = analyzeDeckControl(control);
      Behringer.mode.holdDeck = number;
      disconnectDeckFocusedLED();
      npmUtil.range(CONTROLS_DECK_OFFSET, 1, 4).forEach((deckControl) => {
        setButtonColor(
          deckControl,
          deckControl == control ? COLOR_BUTTON_BLUE_BLINK : COLOR_BUTTON_ORANGE
        );
      });
      disconnectDeckVolume();
      Behringer.connections.deckVolumeAsEffect = npmUtil.range(
        CONTROLS_DECK_OFFSET,
        1,
        4
      ).map((deckControl) => {
        const { physicalNumber } = analyzeDeckControl(deckControl);
        const [group, key] = getAssignmentForDeckEncoderAsEffect(
          number,
          physicalNumber
        );
        const connection = engine.makeConnection(group, key, (value) => {
          setEncoderLEDs(deckControl, value / (physicalNumber <= 3 ? 2 : 1));
        });
        connection.trigger();
        return connection;
      });

      npmUtil.range(CONTROLS_FUNCTIONS_OFFSET, 1, 2).forEach((control) => {
        setButtonColor(control, COLOR_BUTTON_BLUE);
      });
    },
    end: (channel, control) => {
      const { number } = analyzeDeckControl(control);
      if (Behringer.mode.holdDeck !== number) {
        return;
      }
      Behringer.mode.holdDeck = null;
      setDeckLEDs();
      Behringer.connections.deckVolumeAsEffect.forEach((connection) =>
        connection.disconnect()
      );
      connectDeckVolume();

      npmUtil.range(CONTROLS_FUNCTIONS_OFFSET, 1, 2).forEach((control) => {
        setButtonColor(control, COLOR_BUTTON_ORANGE);
      });
    },
  },
});
npmUtil.connectMidi(
  MIDI_BUTTON_BOTH,
  npmUtil.range(0x40, 1, 4),
  Behringer.deck_button_both
);

/* midi 0x40-0x43 */
Behringer.deck_encoder = (channel, control, value) => {
  const { physicalNumber, number } = analyzeDeckControl(control);
  if (Behringer.mode.holdDeck) {
    const [group, key] = getAssignmentForDeckEncoderAsEffect(
      Behringer.mode.holdDeck,
      physicalNumber
    );
    npmUtil.updateValue(
      group,
      key,
      (value - ENCODER_VALUE_OFFSET) * (physicalNumber === 4 ? 0.01 : 0.05)
    );
  } else {
    npmUtil.updateValue(
      deckControl.getChannel(number),
      "volume",
      (value - ENCODER_VALUE_OFFSET) * 0.02
    );
  }
};

/**
 * Handle updates to the stem volume from function encoders
 * @param {("left"|"right")} side
 * @param {number} position
 * @param {number} value
 */
Behringer.stem_control = (side, position, value) => {
  const delta = value - ENCODER_VALUE_OFFSET;
  npmUtil.updateValue(
    `[Channel${side === "left" ? 1 : 2}_Stem${position + 1}]`,
    "volume",
    delta * 0.04
  );
};

// 2 rows * 4 fx * 4 encoders
/* midi 0x14-0x33 */
Behringer.fx_encoder = (channel, control, value) => {
  const { unit, fxNumber, position } = analyzeFxControl(control);

  if (fxNumber === 4) {
    Behringer.stem_control(unit === 2 ? "right" : "left", position, value);
    return;
  }

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
// 2 rows, 4 knobs, 4 effects
npmUtil.connectMidi(
  MIDI_KNOB_TURN,
  npmUtil.range(0x14, 1, 2 * 4 * 4),
  Behringer.fx_encoder
);

// /* midi */
// Behringer.fxOn_button_down = (channel, control) => {
//   midi.sendShortMsg(channel | BUTTON_LED_COMMAND, control, 0x01);
// };

// if (typeof engine !== "undefined") {

/* midi 0x54 */
Behringer.slice_button_down = () => {
  log("slice")
  if (Behringer.mode.holdDeck) {
    script.toggleControl(deckControl.getChannel(Behringer.mode.holdDeck), "play");
    return;
  }
};

/* midi 0x55 */
Behringer.erase_button_both = (channel, control, value) => {
  if (Behringer.mode.holdDeck) {
    if (value) {
      deckControl.ejectDeck(Behringer.mode.holdDeck);
    }
    return;
  }
  Behringer.mode.erase = Boolean(value);
  setButtonColor(
    control,
    Behringer.mode.erase ? COLOR_BUTTON_BLUE : COLOR_BUTTON_ORANGE
  );
  disconnectHotcueLEDs();
  connectHotcueLEDs(Behringer.mode.erase ? COLOR_BUTTON_BLUE_BLINK : undefined);
};
/* midi 0x56 */
Behringer.store_button_both = (channel, control, value) => {
  Behringer.mode.store = Boolean(value);
  setButtonColor(
    control,
    Behringer.mode.store ? COLOR_BUTTON_BLUE : COLOR_BUTTON_ORANGE
  );
  if (Behringer.mode.store) {
    disconnectHotcueLEDs();
    npmUtil.range(CONTROLS_HOTCUE_OFFSET, 1, 8).forEach((control) => {
      const { number } = analyzeHotcueControl(control);
      let color = COLOR_BUTTON_ORANGE;
      if (number === 8) {
        color = COLOR_BUTTON_BLUE_BLINK;
      } else if (number <= 5) {
        color = COLOR_BUTTON_BLUE;
      }
      setButtonColor(control, color);
    });

    disconnectDeckFocusedLED();
    npmUtil.range(CONTROLS_DECK_OFFSET, 1, 4).map((deckControl_) => {
      const { number: deckNumber } = analyzeDeckControl(deckControl_);
      setButtonColor(
        deckControl_,
        engine.getValue(deckControl.getChannel(deckNumber), "play")
          ? COLOR_BUTTON_ORANGE
          : COLOR_BUTTON_BLUE
      );
    });
  } else {
    connectHotcueLEDs();
    connectDeckFocusedLED();
  }
};

/* midi 0x57 */
Behringer.library_button_down = () => {
  script.toggleControl("[Skin]", "show_maximized_library"); //, 1, { toggle: true });
};

/* midi 0x50-0x53 = 1, 4, 8, 16 row */
Behringer.num1_button_down = () => {
  engine.setValue(
    deckControl.getChannel(Behringer.mode.holdDeck), // deckControl.getActiveFocusedDeckIndex()
    "beatjump_32_backward", // direction > 0 ? "beatjump_32_forward" :
    1
  );
};
Behringer.num4_button_down = () => {
  engine.setValue(
    deckControl.getChannel(Behringer.mode.holdDeck), // deckControl.getActiveFocusedDeckIndex()
    "beatjump_32_forward",
    1
  );
};
npmUtil.connectMidi(MIDI_BUTTON_DOWN, 0x50, Behringer.num1_button_down);
npmUtil.connectMidi(MIDI_BUTTON_DOWN, 0x51, Behringer.num4_button_down);

Behringer.num16_button_down = () => {
  engine.setValue(
    deckControl.getChannel(Behringer.mode.holdDeck), // deckControl.getActiveFocusedDeckIndex()
    "beatloop_32_activate",
    1
  );
};
npmUtil.connectMidi(MIDI_BUTTON_DOWN, 0x53, Behringer.num16_button_down);

/* midi 0x58-0x5F */
Behringer.hotcue_button_down = (channel, control) => {
  const { number } = analyzeHotcueControl(control);
  if (Behringer.mode.store) {
    if (number == 6 || number == 7) {
      log("Invalid rating: ", number);
      return;
    }
    // hack to reset rating
    for (let index = 0; index < 5; index++) {
      engine.setValue(deckControl.getChannel(), "stars_down", 1);
    }

    if (number == 8) {
      // reset rating to 0
      return;
    }

    // hack to set rating
    for (let index = 0; index < number; index++) {
      engine.setValue(deckControl.getChannel(), "stars_up", 1);
    }
  } else {
    const hotcueStatus = engine.getValue(
      deckControl.getChannel(),
      `hotcue_${number}_status`
    );
    if (hotcueStatus === 0) {
      engine.setValue(deckControl.getChannel(), `hotcue_${number}_set`, 1);
    } else {
      if (Behringer.mode.erase) {
        engine.setValue(deckControl.getChannel(), `hotcue_${number}_clear`, 1);
      } else {
        engine.setValue(deckControl.getChannel(), `hotcue_${number}_goto`, 1);
      }
    }
  }
};

const MIDI_MAPPINGS = () => {
  return midiMappings;
};
