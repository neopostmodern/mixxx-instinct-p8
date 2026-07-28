// Hercules-DJ-Control-Instinct-P8-scripts.js
//
// Prior art:
// 2017.01.23, piff, first draft
// 2018-06-19, STi, added soft-takeover to more controls, without success though
// 2018-10-20, Piega, clean js
// 2018-11-23, Be, rewrite and cleanup
// 2018-12-28, EM-HB, corections made

// Tune the jog sensitivity when the scratch mode is disabled

var DJControlInstinctP8 = {
  // There is only one scratch toggle button for both decks.
  scratchModeActive: false,
  // also use move loop / utility toggle for both sides, despite having two buttons
  moveLoopActive: false,
  /** @type (DeckNumber | null) */
  utilityActive: null,
  /** @type (DeckNumber | null) */
  shiftActive: null,

  timers: {
    loopPressed: 0,
    keylockPressed: 0,
  },
  counters: {
    utilityJog: 0,
  },

  CC: {
    SET_LED: 0x90,
  },
  LED: {
    OFF: 0x00, // making this 0x7c causes issues
    BLUE: 0x7d, // ends with b01
    RED: 0x7e, // ends with b10
    PURPLE: 0x7f, // ends with b11
  },
};

const renderer = new Renderer(DJControlInstinctP8.CC.SET_LED);
const midiHelpers = new MidiHelpers(0x90);

const deckChangeHandler = () => {
  refreshDeckOutputs();
};

const hotcueHandler = (number) => {
  const hotcueStatus = engine.getValue(
    deckControl.getChannel(),
    `hotcue_${number}_status`,
  );

  if (hotcueStatus === 0) {
    engine.setValue(deckControl.getChannel(), `hotcue_${number}_set`, 1);
  } else {
    engine.setValue(deckControl.getChannel(), `hotcue_${number}_goto`, 1);
  }
};

DJControlInstinctP8.init = function () {
  engine.setValue("[Master]", "num_samplers", 8);

  // Set up soft-takeover for all potential deck channels
  for (var ch = 1; ch <= 4; ch++) {
    engine.softTakeover("[Channel" + ch + "]", "volume", true);
    for (var p = 1; p <= 3; p++) {
      engine.softTakeover(
        "[EqualizerRack1_[Channel" + ch + "]_Effect1]",
        "parameter" + p,
        true,
      );
    }
  }

  deckControl.events.onDeckChange(deckChangeHandler);
  deckChangeHandler();

  // todo: find some check that prevents this code from running on "not first startup" (this doesn't work!), alternatives could be if any track is loaded?
  if (engine.getValue("[master]", "duckStrength") === 0) {
    deckControl.setDeckActive(2);
    deckControl.ejectDeck(2);
    deckControl.setActiveFocusedDeckIndex(1);
    deckControl.ejectDeck(1);
  }

  print("Hercules Instinct P8 custom bindings initialized.");
};

DJControlInstinctP8.shutdown = function () {
  print("[P8] Shutdown...");
  managedConnections.forEach((c) => c.disconnect());
  // turn off all lights
  for (var i = 0x01; i < 0x5c; i++) {
    renderer.set(i, 0x00);
  }
};

engine.makeConnection(
  "[App]",
  "indicator_500ms",
  npmUtil.engineBlink(1, 100, (on) => {
    if (!on) {
      return;
    }
    renderer.set(0x01, 0x7d);
  }),
);

midiHelpers.bind({
  id: "shift",
  description: "Track state of shift (left/right) button",
  midiNotes: { left: 0x63, right: 0x2f },
  onPress: {
    down: ({ side }) => {
      DJControlInstinctP8.shiftActive =
        side === deckControl.LEFT
          ? deckControl.getLeftDeckIndex()
          : deckControl.getRightDeckIndex();
    },
    up: () => {
      DJControlInstinctP8.shiftActive = null;
    },
  },
});

midiHelpers.bind({
  id: "scratch-button",
  midiNotes: 0x2d,
  onTap: () => {
    if (DJControlInstinctP8.utilityActive) {
      const utilityChannel = deckControl.getChannel(
        DJControlInstinctP8.utilityActive,
      );
      engine.setValue(utilityChannel, "beats_translate_half", 1);
      return;
    }

    script.toggleControl("[Skin]", "show_maximized_library");
  },
  onPress: {
    both: () => {
      if (DJControlInstinctP8.utilityActive) {
        // only defined for push
        return;
      }

      DJControlInstinctP8.scratchModeActive =
        !DJControlInstinctP8.scratchModeActive;

      // update LED of 'scratch' button
      renderer.override(
        0x2d,
        DJControlInstinctP8.scratchModeActive
          ? DJControlInstinctP8.LED.BLUE
          : DJControlInstinctP8.LED.OFF,
      );

      const activeGroup = deckControl.getChannel(
        deckControl.getActiveFocusedDeckIndex(),
      );

      // LED feedback for available hotcues across all pads
      npmUtil.range(1, 1, 8).forEach((hotcueNumber) => {
        const midiBaseNote = hotcueNumber <= 4 ? 0x19 - 1 : 0x49 - 5;
        if (DJControlInstinctP8.scratchModeActive) {
          let hotcueColor = 0x00;
          const hotcueType = engine.getValue(
            activeGroup,
            `hotcue_${hotcueNumber}_type`,
          );
          if (hotcueType === 1) {
            hotcueColor = DJControlInstinctP8.LED.BLUE;
          } else if (hotcueType === 4) {
            hotcueColor = DJControlInstinctP8.LED.PURPLE;
          }
          renderer.override(midiBaseNote + hotcueNumber, hotcueColor);
        } else {
          renderer.release(midiBaseNote + hotcueNumber);
        }
      });
    },
  },
});

midiHelpers.bind({
  id: "shift+scratch-button",
  midiNotes: 0x2e,
  onChange: ({ value }) => {
    // actually unused, dummy handler to light button up
    renderer.set(0x2e, value ? 0x7f : 0x00);
  },
});

midiHelpers.bind({
  id: "jog-wheel",
  midiPrefixes: 0xb0,
  midiNotes: { left: 0x30, right: 0x32 },
  onChange: ({ side, value }) => {
    const group = deckControl.getChannel(side);
    const direction = value === 1 ? 1 : -1;

    if (DJControlInstinctP8.scratchModeActive) {
      engine.setValue(
        group,
        direction > 0 ? "beatjump_4_forward" : "beatjump_4_backward",
        1,
      );
    } else if (DJControlInstinctP8.utilityActive) {
      DJControlInstinctP8.counters.utilityJog += 1;
      if (DJControlInstinctP8.counters.utilityJog >= 20) {
        engine.setValue(
          group,
          direction > 0 ? "beatjump_32_forward" : "beatjump_32_backward",
          1,
        );
        DJControlInstinctP8.counters.utilityJog = 0;
      }
    } else {
      engine.setValue(group, "jog", 0.25 * direction);
    }
  },
});

midiHelpers.bind({
  id: "shift+jog-wheel",
  description:
    "Jog wheel movement with SHIFT held: usually adjusts pitch, when UTILITY is held, jumps between hotcues",
  midiPrefixes: 0xb0,
  midiNotes: { left: 0x31, right: 0x33 },
  onChange: ({ value, side }) => {
    const group = deckControl.getChannel(side);
    const direction = value === 127 ? -1 : 1;

    var delta = direction / 1000;
    engine.setValue(group, "rate", engine.getValue(group, "rate") - delta);
  },
});

// Pad (outer bottom) – LOADED STATUS & EJECTING
midiHelpers.bind({
  id: "eject-switch",
  description: "Pad (outer bottom) for eject and deck switching",
  midiNotes: { left: 0x1b, right: 0x4c },
  onPress: {
    down: ({ side }) => {
      if (DJControlInstinctP8.scratchModeActive) {
        hotcueHandler(side === deckControl.LEFT ? 3 : 8);
        return;
      }
      const deckNumber =
        side === deckControl.LEFT
          ? deckControl.getLeftDeckIndex()
          : deckControl.getRightDeckIndex();
      deckControl.ejectDeck(deckNumber);
    },
  },
});

midiHelpers.bind({
  id: "multi-knob",
  description: "Loop knob, overlayed with many other uses depending on context",
  midiPrefixes: 0xb0,
  midiNotes: { left: 0x34, right: 0x36 },
  onChange: ({ side, value }) => {
    const group = deckControl.getChannel(side);
    if (DJControlInstinctP8.moveLoopActive) {
      if (value > 64) {
        engine.setValue(group, "loop_move", -1);
      } else {
        engine.setValue(group, "loop_move", 1);
      }
    } else if (DJControlInstinctP8.utilityActive) {
      engine.setValue(
        group,
        "pregain",
        engine.getValue(group, "pregain") + 0.01 * (value > 64 ? -1 : 1),
      );
    } else {
      if (value > 64) {
        script.toggleControl(group, "loop_halve");
      } else {
        script.toggleControl(group, "loop_double");
      }
    }
  },
});

midiHelpers.bind({
  id: "loop-knob-push",
  description: "Push knob for loop toggle",
  midiNotes: { left: 0x57, right: 0x58 },
  onPress: {
    down: ({ side }) => {
      const group = deckControl.getChannel(side);
      if (engine.getValue(group, "loop_enabled")) {
        engine.setValue(group, "reloop_toggle", 1);
      } else {
        engine.setValue(group, "beatloop_activate", 1);
      }
    },
  },
});

midiHelpers.bind({
  id: "loop-pad",
  description: "Pad (inner top) for loop-related controls",
  midiNotes: { left: 0x1a, right: 0x49 },
  onTap: ({ value, side }) => {
    engine.setValue(deckControl.getChannel(side), "reloop_toggle", 1);
  },
  onPress: {
    both: ({ side, config, value, midiNote }) => {
      DJControlInstinctP8.moveLoopActive = Boolean(value);

      if (value) {
        renderer.override(midiNote, DJControlInstinctP8.LED.PURPLE);
      } else {
        renderer.release(midiNote);
      }
    },
  },
});

// (LOOP) KNOB WITH SHIFT
midiHelpers.bind({
  id: "shift+loop-knob",
  midiPrefixes: 0xb0,
  midiNotes: { left: 0x35, right: 0x37 },
  onChange: ({ value, side }) => {
    const group = deckControl.getChannel(side);
    const direction = value > 64 ? -1 : 1;

    if (DJControlInstinctP8.utilityActive) {
      const currentKey = engine.getValue(group, "key");
      const newKey = ((currentKey + direction - 1) % 24) + 1; // between 1 [C] and 24 [Bm]
      engine.setValue(group, "key", newKey);
    } else {
      const filterName = `[QuickEffectRack1_${group}]`;
      const currentFilterValue = engine.getValue(filterName, "super1");
      const newFilterValue = Math.max(
        0,
        Math.min(1, currentFilterValue + direction * 0.0075),
      );
      engine.setValue(filterName, "super1", newFilterValue);
    }
  },
});

// Pad (outer top) – KEYLOCK
midiHelpers.bind({
  id: "keylock",
  description: "Pad (outer top) for keylock and key sync",
  midiNotes: { left: 0x19, right: 0x4a },
  onTap: ({ side }) => {
    if (DJControlInstinctP8.scratchModeActive) {
      hotcueHandler(side === deckControl.LEFT ? 1 : 6);
      return;
    }

    const group = deckControl.getChannel(side);
    if (engine.getValue(group, "sync_key")) {
      engine.setValue(group, "sync_key", 0);
      engine.setValue(group, "reset_key", 1);
    } else {
      engine.setValue(
        group,
        "keylock",
        engine.getValue(group, "keylock") ? 0 : 1,
      );
    }
  },
  onLongTap: ({ side }) => {
    const group = deckControl.getChannel(side);
    engine.setValue(group, "keylock", 1);
    engine.setValue(group, "sync_key", 1);
  },
});

// todo: stars_up, stars_down
let utilityBlinkConnection = null;
midiHelpers.bind({
  id: "utility-pad",
  description: "Pad (inner bottom) for utility controls",
  midiNotes: { left: 0x1c, right: 0x4b },
  onTap: ({ side }) => {
    deckControl.setActiveFocusedDeckIndex(
      side === deckControl.LEFT
        ? deckControl.getLeftDeckIndex()
        : deckControl.getRightDeckIndex(),
    );
  },
  onPress: {
    down: ({ side, midiNote }) => {
      if (DJControlInstinctP8.scratchModeActive) {
        hotcueHandler(side === deckControl.LEFT ? 4 : 7);
        return;
      }
      if (DJControlInstinctP8.utilityActive) {
        const oppositeSide =
          side === deckControl.LEFT ? deckControl.RIGHT : deckControl.LEFT;
        engine.setValue(
          deckControl.getChannel(oppositeSide),
          "beats_translate_curpos",
          1,
        );
        return;
      }

      DJControlInstinctP8.utilityActive = side;
      DJControlInstinctP8.counters.utilityJog = 0;
      DJControlInstinctP8.counters.utilityScratchJog = 0;

      utilityBlinkConnection = engine.makeConnection(
        "[App]",
        "indicator_250ms",
        npmUtil.engineBlink(1, 1, (on) => {
          renderer.override(
            midiNote,
            on ? DJControlInstinctP8.LED.BLUE : DJControlInstinctP8.LED.OFF,
          );
        }),
      );
    },
    up: ({ midiNote }) => {
      DJControlInstinctP8.utilityActive = null;
      utilityBlinkConnection.disconnect();
      renderer.release(midiNote);
    },
  },
});

const trackLoadedHandler = (value, group, control) => {
  renderer.set(
    deckControl.isGroupLeftDeck(group) ? 0x1b : 0x4c,
    value ? DJControlInstinctP8.LED.RED : DJControlInstinctP8.LED.OFF,
  );
};

const buildDeckColorForUtilityPad = (
  sideIndex,
  sideDefaultIndex,
  activeFocusedIndex,
) => {
  let color = DJControlInstinctP8.LED.OFF;
  if (sideIndex === activeFocusedIndex) {
    color |= DJControlInstinctP8.LED.BLUE;
  }
  if (sideIndex !== sideDefaultIndex) {
    color |= DJControlInstinctP8.LED.RED;
  }
  return color;
};

// MANAGED CONNECTIONS (reconnected on deck change)
var managedConnections = [];

const refreshDeckOutputs = () => {
  managedConnections.forEach((c) => c.disconnect());
  managedConnections = [];

  const leftDeckIndex = deckControl.getLeftDeckIndex();
  const leftGroup = deckControl.getChannel(leftDeckIndex);
  const rightDeckIndex = deckControl.getRightDeckIndex();
  const rightGroup = deckControl.getChannel(rightDeckIndex);
  const activeFocusedDeckIndex = deckControl.getActiveFocusedDeckIndex();

  // set colors of utility pad = which deck is active and focused

  // left deck
  renderer.set(
    0x1c,
    buildDeckColorForUtilityPad(leftDeckIndex, 1, activeFocusedDeckIndex),
  );
  // right deck
  renderer.set(
    0x4b,
    buildDeckColorForUtilityPad(rightDeckIndex, 2, activeFocusedDeckIndex),
  );

  const connectManaged = (group, key, callback) => {
    const connection = engine.makeConnection(group, key, callback);
    managedConnections.push(connection);
    connection.trigger();
  };

  // Play/Cue/Sync indicators, second row is for 'shift held' (to keep buttons lit)
  connectManaged(leftGroup, "play_indicator", (value) => {
    renderer.set(0x21, value ? 0x7d : 0x00);
    renderer.set(0x24, value ? 0x7d : 0x00);
  });
  connectManaged(leftGroup, "cue_indicator", (value) => {
    renderer.set(0x22, value ? 0x7d : 0x00);
    renderer.set(0x25, value ? 0x7d : 0x00);
  });
  connectManaged(leftGroup, "sync_enabled", (value) => {
    renderer.set(0x23, value ? 0x7d : 0x00);
    renderer.set(0x26, value ? 0x7d : 0x00);
  });
  connectManaged(rightGroup, "play_indicator", (value) => {
    renderer.set(0x51, value ? 0x7d : 0x00);
    renderer.set(0x54, value ? 0x7d : 0x00);
  });
  connectManaged(rightGroup, "cue_indicator", (value) => {
    renderer.set(0x52, value ? 0x7d : 0x00);
    renderer.set(0x55, value ? 0x7d : 0x00);
  });
  connectManaged(rightGroup, "sync_enabled", (value) => {
    renderer.set(0x53, value ? 0x7d : 0x00);
    renderer.set(0x56, value ? 0x7d : 0x00);
  });

  // PFL
  connectManaged(leftGroup, "pfl", (value) => {
    renderer.set(0x5b, value ? 0x7d : 0x00);
  });
  connectManaged(rightGroup, "pfl", (value) => {
    renderer.set(0x5c, value ? 0x7d : 0x00);
  });

  // Loop enabled (pad LED + shift+pad LEDs)
  connectManaged(leftGroup, "loop_enabled", (value) => {
    renderer.set(0x1a, value ? 0x7d : 0x00);
    renderer.set(0x1d, value ? 0x7f : 0x00);
    renderer.set(0x1e, value ? 0x7f : 0x00);
  });
  connectManaged(rightGroup, "loop_enabled", (value) => {
    renderer.set(0x49, value ? 0x7d : 0x00);
    renderer.set(0x4d, value ? 0x7f : 0x00);
    renderer.set(0x4e, value ? 0x7f : 0x00);
  });

  // Track loaded
  connectManaged(leftGroup, "track_loaded", trackLoadedHandler);
  connectManaged(rightGroup, "track_loaded", trackLoadedHandler);

  // Keylock / sync_key / reset_key
  connectManaged(leftGroup, "keylock", (value) => {
    renderer.set(0x19, value ? 0x7d : 0x00);
  });
  connectManaged(leftGroup, "sync_key", (value) => {
    if (value) {
      renderer.set(0x19, 0x7e);
    }
  });
  connectManaged(leftGroup, "reset_key", () => {
    renderer.set(0x19, engine.getValue(leftGroup, "keylock") ? 0x7d : 0x00);
  });
  connectManaged(rightGroup, "keylock", (value) => {
    renderer.set(0x4a, value ? 0x7d : 0x00);
  });
  connectManaged(rightGroup, "sync_key", (value) => {
    if (value) {
      renderer.set(0x4a, 0x7e);
    }
  });
  connectManaged(rightGroup, "reset_key", () => {
    renderer.set(0x4a, engine.getValue(rightGroup, "keylock") ? 0x7d : 0x00);
  });

  // Soft-takeover: ignore next value for new active decks
  engine.softTakeoverIgnoreNextValue(leftGroup, "volume");
  engine.softTakeoverIgnoreNextValue(rightGroup, "volume");
  for (let i = 1; i <= 3; i++) {
    engine.softTakeoverIgnoreNextValue(
      "[EqualizerRack1_" + leftGroup + "_Effect1]",
      "parameter" + i,
    );
    engine.softTakeoverIgnoreNextValue(
      "[EqualizerRack1_" + rightGroup + "_Effect1]",
      "parameter" + i,
    );
  }
};

/** @type {[number, number, string, 'toggle'?][]} */
([
  [0x21, 0x51, "play", "toggle"],
  [0x22, 0x52, "cue_cdj"],
  [0x23, 0x53, "sync_enabled", "toggle"],
  [0x24, 0x54, "play_stutter"],
  [0x25, 0x55, "start_stop"],
  [0x26, 0x56, "rate_set_default"],
  [0x5b, 0x5c, "pfl", "toggle"],
]).forEach(function ([left, right, key, behavior]) {
  midiHelpers.bind({
    id: key,
    midiNotes: { left, right },
    autoSetup: { key, behavior },
  });
});

midiHelpers.bind({
  id: "volume-fader",
  midiPrefixes: 0xb0,
  midiNotes: { left: 0x40, right: 0x42 },
  onChange: ({ side, value }) => {
    engine.setParameter(deckControl.getChannel(side), "volume", value / 127);
  },
});

/** @type {[number, number, string][]} */
([
  [0x44, 0x50, "parameter1"],
  [0x46, 0x52, "parameter2"],
  [0x48, 0x54, "parameter3"],
]).forEach(([left, right, key]) => {
  midiHelpers.bind({
    id: `eq-${key}`,
    midiPrefixes: 0xb0,
    midiNotes: { left, right },
    onChange: ({ side, value }) => {
      engine.setParameter(
        "[EqualizerRack1_" + deckControl.getChannel(side) + "_Effect1]",
        key,
        value / 127,
      );
    },
  });
});

midiHelpers.bind({
  id: "crossfader",
  midiPrefixes: 0xb0,
  midiNotes: 0x56,
  onChange: ({ value }) => {
    let focusedDeckIndex = deckControl.getActiveFocusedDeckIndex();
    if (focusedDeckIndex > 2) {
      focusedDeckIndex = deckControl.getSiblingDeckNumber(focusedDeckIndex);
    }
    engine.setValue(
      "[EffectRack1_EffectUnit" + focusedDeckIndex + "]",
      "mix",
      value / 128,
    );
  },
});

const WIDGET_ID = {
  TREE_NAV: 2,
  LIST: 3,
};

midiHelpers.bind({
  id: "browser-knob-push",
  midiNotes: [0x2b, 0x2c], // without and with shift held
  onPress: {
    down: ({ midiNote }) => {
      const isShiftPressed = midiNote === 0x2c;
      const currentlyFocusedWidget = engine.getValue(
        "[Library]",
        "focused_widget",
      );

      if (isShiftPressed) {
        if (currentlyFocusedWidget === WIDGET_ID.LIST) {
          // todo: load to preview?
        } else {
          // unused for now
        }
      } else {
        if (currentlyFocusedWidget === WIDGET_ID.LIST) {
          engine.setValue("[Library]", "focused_widget", WIDGET_ID.TREE_NAV);
        } else {
          engine.setValue("[Library]", "GoToItem", 1);
        }
      }
    },
  },
});

midiHelpers.bind({
  id: "load-ab",
  description: "Load A/B buttons",
  midiNotes: { left: 0x5f, right: 0x60 },
  onPress: {
    down: ({ side }) => {
      const deckNumber =
        side === deckControl.LEFT
          ? deckControl.getLeftDeckIndex()
          : deckControl.getRightDeckIndex();
      if (DJControlInstinctP8.shiftActive) {
        deckControl.setDeckActive(deckControl.getSiblingDeckNumber(deckNumber));
        return;
      }
      engine.setValue(deckControl.getChannel(side), "LoadSelectedTrack", 1);
    },
  },
});

midiHelpers.bind({
  id: "browser-knob",
  description: "Browser knob (rotation)",
  midiPrefixes: 0xb0,
  midiNotes: 0x38,
  onChange: ({ value }) => {
    if (DJControlInstinctP8.utilityActive) {
      npmUtil.updateValue("[Master]", "gain", (value < 64 ? 1 : -1) * 0.01);
    } else {
      if (engine.getValue("[Library]", "focused_widget") === 0) {
        engine.setValue(
          "[Playlist]",
          value < 64 ? "SelectNextTrack" : "SelectPrevTrack",
          1,
        );
      } else {
        engine.setValue("[Library]", "MoveVertical", value < 64 ? 1 : -1);
      }
    }
  },
});

midiHelpers.bind({
  id: "shift+browser-knob",
  description: "Shift + browser knob (rotation) for fast browsing",
  midiPrefixes: 0xb0,
  midiNotes: 0x39,
  onChange: ({ value }) => {
    for (let scrollCount = 0; scrollCount < 20; scrollCount++) {
      engine.setValue(
        "[Playlist]",
        value < 64 ? "SelectNextTrack" : "SelectPrevTrack",
        1,
      );
    }
  },
});
