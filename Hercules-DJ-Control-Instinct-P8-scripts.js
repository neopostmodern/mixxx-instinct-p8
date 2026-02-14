// Hercules-DJ-Control-Instinct-P8-scripts.js
//
// Prior art:
// 2017.01.23, piff, first draft
// 2018-06-19, STi, added soft-takeover to more controls, without success though
// 2018-10-20, Piega, clean js
// 2018-11-23, Be, rewrite and cleanup
// 2018-12-28, EM-HB, corections made

// Tune the jog sensitivity when the scratch mode is disabled

function log() {
  var debugText = "[P8] ";
  for (
    var argumentIndex = 0;
    argumentIndex < arguments.length;
    argumentIndex++
  ) {
    debugText += arguments[argumentIndex] + " : ";
  }
  print(debugText);
}

function oppositeGroup(group) {
  return group === "[Channel1]" ? "[Channel2]" : "[Channel1]";
}

var DJControlInstinctP8 = {
  // There is only one scratch toggle button for both decks.
  scratchModeActive: false,
  // also use move loop / utility toggle for both sides, despite having two buttons
  moveLoopActive: false,
  utilityActive: false,

  timers: {
    loopPressed: 0,
    keylockPressed: 0,
  },
  counters: {
    utilityJog: 0,
    utilityScratchJog: 0,
  },

  CC: {
    SET_LED: 0x90,
  },
  LED: {
    OFF: 0x00,
    BLUE: 0x7d,
    RED: 0x7e,
    PURPLE: 0x7f,
  }
};

const deckChangeHandler = () => {
  const activeFocusedDeckIndex = deckControl.getActiveFocusedDeckIndex();

  // channel 1
  midi.sendShortMsg(
    DJControlInstinctP8.CC.SET_LED,
    0x1c,
    activeFocusedDeckIndex === 1 ? DJControlInstinctP8.LED.BLUE : DJControlInstinctP8.LED.OFF
  );
  // channel 2
  midi.sendShortMsg(
    DJControlInstinctP8.CC.SET_LED,
    0x4b,
    activeFocusedDeckIndex === 2 ? DJControlInstinctP8.LED.BLUE : DJControlInstinctP8.LED.OFF
  );
}

DJControlInstinctP8.init = function () {
  engine.setValue("[Master]", "num_samplers", 8);

  // Query the controller for knob and slider positions...
  midi.sendShortMsg(0xb0, 0x7f, 0x7f);

  // ...but the rate values get messed up, so reset them.
  engine.setValue("[Channel1]", "rate_set_default", 1.0);
  engine.setValue("[Channel2]", "rate_set_default", 1.0);

  deckControl.events.onDeckChange(deckChangeHandler);
  deckChangeHandler();

  print("Hercules Instinct P8 custom bindings initialized.");
};

DJControlInstinctP8.shutdown = function () {
  print("[P8] Shutdown...");
  // turn off all lights
  for (var i = 0x01; i < 0x5c; i++) {
    midi.sendShortMsg(0x90, i, 0x00);
  }
};

engine.makeConnection(
  "[App]",
  "indicator_500ms",
  npmUtil.engineBlink(1, 100, (on) => {
    if (!on) {
      return;
    }
    midi.sendShortMsg(0x90, 0x01, 0x7d);
  })
);

DJControlInstinctP8.noop = function (midino, control, value, status, group) {
  log(
    "Noop",
    "midino " + midino,
    "control " + control,
    "value " + value,
    "status " + status,
    "group " + group
  );
};

DJControlInstinctP8.scratchMode = npmUtil.shortAndLong({
  id: "scratch",
  push: (channel, control) => {
    if (DJControlInstinctP8.utilityActive) {
      const utilityChannel = deckControl.getChannel(
        DJControlInstinctP8.utilityActive
      );
      engine.setValue(utilityChannel, "beats_translate_half", 1);
      return;
    }

    script.toggleControl("[Skin]", "show_maximized_library");
  },
  hold: {
    both: (channel, control) => {
      if (DJControlInstinctP8.utilityActive) {
        // only defined for push
        return;
      }

      DJControlInstinctP8.scratchModeActive =
        !DJControlInstinctP8.scratchModeActive;

      // update LED of 'scratch' button
      midi.sendShortMsg(
        0x90,
        0x2d,
        DJControlInstinctP8.scratchModeActive ? 0x7f : 0x00
      );
    },
  },
});

DJControlInstinctP8.shiftScratchMode = function (
  channel,
  control,
  value,
  status,
  group
) {
  // unused!
  // jog wheel is "pitch", since shift is pressed
  midi.sendShortMsg(0x90, 0x2e, value ? 0x7f : 0x00);
};

DJControlInstinctP8.jogWheel = function (
  midino,
  control,
  value,
  status,
  group
) {
  var deck = group === "[Channel1]" ? 1 : 2;
  var direction = value === 1 ? 1 : -1;

  const currentPlayPosition = engine.getValue(group, "playposition");

  log("jog", direction, DJControlInstinctP8.scratchModeActive);
  if (DJControlInstinctP8.scratchModeActive) {
    engine.setValue(
      group,
      direction > 0 ? "beatjump_4_forward" : "beatjump_4_backward",
      1
    );
  } else if (DJControlInstinctP8.utilityActive) {
    DJControlInstinctP8.counters.utilityJog += 1;
    if (DJControlInstinctP8.counters.utilityJog >= 20) {
      engine.setValue(
        group,
        direction > 0 ? "beatjump_32_forward" : "beatjump_32_backward",
        1
      );
      DJControlInstinctP8.counters.utilityJog = 0;
    }
  } else {
    engine.setValue(group, "jog", 0.25 * direction);
  }
};

// Pitch is adjusted by holding down shift and turning the jog wheel.
DJControlInstinctP8.pitch = function (channel, control, value, status, group) {
  const direction = value === 127 ? -1 : 1;
  const currentPlayPosition = engine.getValue(group, "playposition");

  if (DJControlInstinctP8.utilityActive) {
    DJControlInstinctP8.counters.utilityScratchJog += 1;
    if (DJControlInstinctP8.counters.utilityScratchJog >= 30) {
      let lowerCue = null;
      let cues = [];
      for (let potentialCue = 1; potentialCue <= 8; potentialCue += 1) {
        if (engine.getValue(group, `hotcue_${potentialCue}_status`) > 0) {
          cues.push(potentialCue);

          const cuePosition =
            engine.getValue(group, `hotcue_${potentialCue}_position`) /
            engine.getValue(group, "track_samples");
          if (cuePosition < currentPlayPosition) {
            lowerCue = potentialCue;
          }
        }
      }

      if (cues.length > 0) {
        const lowerCueIndex = cues.indexOf(lowerCue);
        if (lowerCueIndex === -1 && direction < 0) {
          // nothing
        } else {
          let jumpToCueIndex = lowerCueIndex;
          log(jumpToCueIndex, cues[jumpToCueIndex]);

          if (direction > 0) {
            if (jumpToCueIndex === -1) {
              jumpToCueIndex = 0;
            } else {
              jumpToCueIndex += 1;
            }

            if (
              Math.abs(
                engine.getValue(
                  group,
                  `hotcue_${cues[jumpToCueIndex]}_position`
                ) /
                  engine.getValue(group, "track_samples") -
                  currentPlayPosition
              ) < 0.0001
            ) {
              jumpToCueIndex += 1;
            }
          }

          log(jumpToCueIndex, cues[jumpToCueIndex]);

          engine.setValue(group, `hotcue_${cues[jumpToCueIndex]}_goto`, 1);
        }
      }

      DJControlInstinctP8.counters.utilityScratchJog = 0;
    }
  } else {
    var delta = direction / 1000;
    engine.setValue(group, "rate", engine.getValue(group, "rate") - delta); // 2023-04-30: switch to up = slow
  }
};

// Pad (outer bottom) – LOADED STATUS & EJECTING
DJControlInstinctP8.ejectAndSwitch = function (
  channel,
  control,
  value,
  status,
  group
) {
  if (value === 0) {
    return;
  }

  deckControl.ejectDeck(script.deckFromGroup(group));
};

const trackLoadedHandler = (value, group, control) => {
  const deck = /** @type {DeckNumber} */ (script.deckFromGroup(group))
  if (value) {
    deckControl.setActiveFocusedDeckIndex(deck);
  }
  midi.sendShortMsg(0x90, deck === 1 ? 0x1b : 0x4c, value ? 0x7e : 0x00);
}
engine.makeConnection(
  "[Channel1]",
  "track_loaded",
  trackLoadedHandler
);
engine.makeConnection(
  "[Channel2]",
  "track_loaded",
  trackLoadedHandler
);

// KNOB (multi-use depending on activity)
DJControlInstinctP8.multiKnob = function (
  channel,
  control,
  value,
  status,
  group
) {
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
      engine.getValue(group, "pregain") + 0.01 * (value > 64 ? -1 : 1)
    );
  } else {
    if (value > 64) {
      script.toggleControl(group, "loop_halve");
    } else {
      script.toggleControl(group, "loop_double");
    }
  }
};

// LOOPS
// push knob
DJControlInstinctP8.loopKnob = function (
  channel,
  control,
  value,
  status,
  group
) {
  if (value === 0) {
    return;
  }
  if (engine.getValue(group, "loop_enabled")) {
    engine.setValue(group, "reloop_toggle", 1);
  } else {
    engine.setValue(group, "beatloop_activate", 1);
  }
};
// pad
DJControlInstinctP8.loopPad = function (
  channel,
  control,
  value,
  status,
  group
) {
  if (value === 0) {
    DJControlInstinctP8.moveLoopActive = false;
    if (new Date().getTime() - DJControlInstinctP8.timers.loopPressed < 500) {
      engine.setValue(group, "reloop_toggle", 1);
    }
  } else {
    DJControlInstinctP8.timers.loopPressed = new Date().getTime();
    DJControlInstinctP8.moveLoopActive = true;
  }
  midi.sendShortMsg(
    0x90,
    group === "[Channel1]" ? 0x1a : 0x49,
    DJControlInstinctP8.moveLoopActive ? 0x7e : 0x00
  );
};

engine.makeConnection(
  "[Channel1]",
  "loop_enabled",
  function (value, group, control) {
    midi.sendShortMsg(0x90, 0x1a, value ? 0x7d : 0x00);
  }
);
engine.makeConnection(
  "[Channel2]",
  "loop_enabled",
  function (value, group, control) {
    midi.sendShortMsg(0x90, 0x49, value ? 0x7d : 0x00);
  }
);

// (LOOP) KNOB WITH SHIFT
DJControlInstinctP8.multiKnobShift = (
  channel,
  control,
  value,
  status,
  group
) => {
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
      Math.min(1, currentFilterValue + direction * 0.0075)
    );
    engine.setValue(filterName, "super1", newFilterValue);
  }
};

// Pad (outer top) – KEYLOCK
DJControlInstinctP8.keylock = function (
  channel,
  control,
  value,
  status,
  group
) {
  if (value === 0) {
    if (
      new Date().getTime() - DJControlInstinctP8.timers.keylockPressed <
      500
    ) {
      log(
        "keylock",
        engine.getValue(group, "keylock"),
        "sync_key",
        engine.getValue(group, "sync_key")
      );
      if (engine.getValue(group, "sync_key")) {
        engine.setValue(group, "sync_key", 0);
        engine.setValue(group, "reset_key", 1);
      } else {
        engine.setValue(
          group,
          "keylock",
          engine.getValue(group, "keylock") ? 0 : 1
        );
      }
    } else {
      engine.setValue(group, "keylock", 1);
      engine.setValue(group, "sync_key", 1);
    }
  } else {
    DJControlInstinctP8.timers.keylockPressed = new Date().getTime();
  }
};
engine.makeConnection("[Channel1]", "keylock", function (value) {
  midi.sendShortMsg(0x90, 0x19, value ? 0x7d : 0x00);
});
engine.makeConnection("[Channel1]", "sync_key", function (value) {
  if (value) {
    midi.sendShortMsg(0x90, 0x19, 0x7e);
  }
});
engine.makeConnection("[Channel1]", "reset_key", function (value) {
  // show keylock colors again
  midi.sendShortMsg(
    0x90,
    0x19,
    engine.getValue("[Channel1]", "keylock") ? 0x7d : 0x00
  );
});
engine.makeConnection("[Channel2]", "keylock", function (value) {
  midi.sendShortMsg(0x90, 0x4a, value ? 0x7d : 0x00);
});
engine.makeConnection("[Channel2]", "sync_key", function (value) {
  if (value) {
    midi.sendShortMsg(0x90, 0x4a, 0x7e);
  }
});
engine.makeConnection("[Channel2]", "reset_key", function (value) {
  // show keylock colors again
  midi.sendShortMsg(
    0x90,
    0x4a,
    engine.getValue("[Channel2]", "keylock") ? 0x7d : 0x00
  );
});

// Pad (inner bottom) – UTILITY
DJControlInstinctP8.utilityPad = function (
  channel,
  control,
  value,
  status,
  group
) {
  // todo: stars_up, stars_down

  if (value === 0) {
    DJControlInstinctP8.utilityActive = false;
  } else {
    if (DJControlInstinctP8.utilityActive) {
      engine.setValue(oppositeGroup(group), "beats_translate_curpos", 1);
    } else {
      DJControlInstinctP8.utilityActive = true;
      DJControlInstinctP8.counters.utilityJog = 0;
      DJControlInstinctP8.counters.utilityScratchJog = 0;
    }
  }
  midi.sendShortMsg(
    0x90,
    group === "[Channel1]" ? 0x1c : 0x4b,
    DJControlInstinctP8.utilityActive
      ? (deckControl.getActiveFocusedDeckIndex() === script.deckFromGroup(group) ? DJControlInstinctP8.LED.PURPLE : DJControlInstinctP8.LED.RED)
      : (deckControl.getActiveFocusedDeckIndex() === script.deckFromGroup(group) ? DJControlInstinctP8.LED.BLUE : DJControlInstinctP8.LED.OFF)
  );
};

// HEADPHONE GAIN
// ...is managed by hardware!
DJControlInstinctP8.headphoneGain = function (
  channel,
  control,
  value,
  status,
  group
) {
  // if (value === 0) {
  // return;
  // }
  // var currentValue = engine.getValue('[Master]', 'headGain')
  // engine.setValue('[Master]', 'headGain', currentValue + 0.01 * (control === 0x5D ? -1 : 1));
};

DJControlInstinctP8.crossfader = function (
  channel,
  control,
  value,
  status,
  group
) {
  var group = value >= 64 ? "2" : "1";
  var oppositeGroup = group == "1" ? "2" : "1";
  var effectStrength = Math.abs(value - 64) / 64;

  engine.setValue(
    "[EffectRack1_EffectUnit" + group + "]",
    "mix",
    effectStrength
  );
  engine.setValue("[EffectRack1_EffectUnit" + oppositeGroup + "]", "mix", 0);

const WIDGET_ID = {
  TREE_NAV: 2,
  LIST: 3,
}
DJControlInstinctP8.pushBrowserButton = (channel, control, value) => {
  if (value === 0) {
    return;
  }

  const isShiftPressed = control === 44;
  const currentlyFocusedWidget = engine.getValue("[Library]", "focused_widget");


  if (isShiftPressed) {
    if (currentlyFocusedWidget === WIDGET_ID.LIST) {
      // todo: load to preview?
    } else {
      // unused for now
    }
  } else {
    if (currentlyFocusedWidget === WIDGET_ID.LIST) {
      engine.setValue(
        "[Library]",
        "focused_widget",
        WIDGET_ID.TREE_NAV
      );
    } else {
      engine.setValue("[Library]", "GoToItem", 1);
    }
  }
};
DJControlInstinctP8.browserKnob = (channel, control, value) => {
  if (DJControlInstinctP8.utilityActive) {
    npmUtil.updateValue("[Master]", "gain", (value < 64 ? 1 : -1) * 0.01);
  } else {
    if (engine.getValue("[Library]", "focused_widget") === 0) {
      engine.setValue(
        "[Playlist]",
        value < 64 ? "SelectNextTrack" : "SelectPrevTrack",
        1
      );
    } else {
      engine.setValue("[Library]", "MoveVertical", value < 64 ? 1 : -1);
    }
  }
};
DJControlInstinctP8.browserKnobShift = (channel, control, value) => {
  for (let scrollCount = 0; scrollCount < 20; scrollCount++) {
    engine.setValue(
      "[Playlist]",
      value < 64 ? "SelectNextTrack" : "SelectPrevTrack",
      1
    );
  }
};
