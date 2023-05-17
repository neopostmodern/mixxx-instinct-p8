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
    var debugText = '[P8] ';
    for (var argumentIndex=0; argumentIndex < arguments.length; argumentIndex++) {
        debugText += arguments[argumentIndex] + " : ";
    }
    print(debugText);
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
        utilityPressed: 0
    }
};

DJControlInstinctP8.init = function() {
    engine.setValue("[Master]", "num_samplers", 8);

    // turn off all lights
    for (var i = 1; i < 0x5C; i++) {
        midi.sendShortMsg(0x90, i, 0x00);
    }

    // Query the controller for knob and slider positions...
    midi.sendShortMsg(0xB0, 0x7F, 0x7F);

    // ...but the rate values get messed up, so reset them.
    engine.setValue("[Channel1]", "rate_set_default", 1.0);
    engine.setValue("[Channel2]", "rate_set_default", 1.0);

    print("Hercules Instinct P8 custom bindings initialized.")
};

DJControlInstinctP8.shutdown = function() {
    print("[P8] Shutdown...")
    // turn off all lights
    for (var i = 0x01; i < 0x5C; i++) {
        midi.sendShortMsg(0x90, i, 0x00);
    }
};

DJControlInstinctP8.noop = function (midino, control, value, status, group) {
    log("Noop", "midino " + midino, "control " + control, "value " + value, "status " + status, "group " + group)
}

// scratchmode on? with lights
DJControlInstinctP8.scratchMode = function (channel, control, value, status, group) {
    DJControlInstinctP8.scratchModeActive = !DJControlInstinctP8.scratchModeActive;
    midi.sendShortMsg(0x90, 0x2D, DJControlInstinctP8.scratchModeActive ? 0x7F : 0x00);
};

DJControlInstinctP8.jogWheel = function (midino, control, value, status, group) {
    var deck = (group === "[Channel1]") ? 1 : 2;
    var direction = (value === 1) ? 1 : -1;

    log("jog", direction, DJControlInstinctP8.scratchModeActive)
    if (DJControlInstinctP8.scratchModeActive) {
        if (engine.getValue(group, "volume") < 0.5) { // play_latched
            engine.setValue(group, "playposition", Math.min(1, Math.max(0, engine.getValue(group, "playposition") + direction / 1000)));
        }
    } else {
        engine.setValue(group, "jog", 0.5 * direction);
    }
};

// Pitch is adjusted by holding down shift and turning the jog wheel.
DJControlInstinctP8.pitch = function (channel, control, value, status, group) {
    var delta = (value === 127 ? -1 : 1) / 1000;
    engine.setValue(group, "rate", engine.getValue(group, "rate") - delta); // 2023-04-30: switch to up = slow
};


// LOADED STATUS & EJECTING
DJControlInstinctP8.ejectAndSwitch = function (channel, control, value, status, group) {
    log("switch", channel, group)

    if (value === 0) {
        return;
    }

    if (engine.getValue(group, "play")) {
        return;
    }

    engine.setValue(group, "eject", 1);
    engine.setValue(group, "pfl", 1);
    engine.setValue(group, "pregain", 1);
    engine.setValue("[QuickEffectRack1_" + group + "]", "super1", 0.5);
    engine.setValue('[EffectRack1_EffectUnit' + group.replace('[Channel', '').replace(']', '') + ']', "mix", 0);
    engine.setValue(group === "[Channel1]" ? "[Channel2]" : "[Channel1]", "pfl", 0);
    for (var i = 1; i <= 3; i++) {
        engine.setValue('[EqualizerRack1_' + group + '_Effect1]', 'parameter' + i, 1);
    }
};
engine.makeConnection('[Channel1]', 'track_loaded', function (value, group, control) {
    midi.sendShortMsg(0x90, 0x1B, value ? 0x7E : 0x00);
});
engine.makeConnection('[Channel2]', 'track_loaded', function (value, group, control) {
    midi.sendShortMsg(0x90, 0x4C, value ? 0x7E : 0x00);
});

// KNOB (multi-use depending on activity)
DJControlInstinctP8.multiKnob = function (channel, control, value, status, group) {
    if (DJControlInstinctP8.moveLoopActive) {
        if (value > 64) {
            engine.setValue(group, "loop_move", -1);
        } else {
            engine.setValue(group, "loop_move", 1);
        }
    } else if (DJControlInstinctP8.utilityActive) {
        engine.setValue(group, "pregain", engine.getValue(group, "pregain") + 0.01 * (value > 64 ? -1 : 1));
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
DJControlInstinctP8.loopKnob = function (channel, control, value, status, group) {
    if (value === 0) {
        return;
    } 
    if (engine.getValue(group, 'loop_enabled')) {
        engine.setValue(group, 'reloop_toggle', 1)
    } else {
        engine.setValue(group, 'beatloop_activate', 1)
    }
}
// pad
DJControlInstinctP8.loopPad = function (channel, control, value, status, group) {
    if (value === 0) {
        DJControlInstinctP8.moveLoopActive = false;
        if (new Date().getTime() - DJControlInstinctP8.timers.loopPressed < 500) {
            engine.setValue(group, 'reloop_toggle', 1);
        }
    } else {
        DJControlInstinctP8.timers.loopPressed = new Date().getTime()
        DJControlInstinctP8.moveLoopActive = true;
    }
    midi.sendShortMsg(0x90, group === "[Channel1]" ? 0x1A : 0x49, DJControlInstinctP8.moveLoopActive ? 0x7E : 0x00);
}

engine.makeConnection('[Channel1]', 'loop_enabled', function (value, group, control) {
    midi.sendShortMsg(0x90, 0x1A, value ? 0x7D : 0x00);
});
engine.makeConnection('[Channel2]', 'loop_enabled', function (value, group, control) {
    midi.sendShortMsg(0x90, 0x49, value ? 0x7D : 0x00);
});

// KEYLOCK
DJControlInstinctP8.keylock = function (channel, control, value, status, group) {
    if (value === 0) {
        if (new Date().getTime() - DJControlInstinctP8.timers.keylockPressed < 500) {
            log("keylock", engine.getValue(group, 'keylock'), "sync_key", engine.getValue(group, 'sync_key'))
            if (engine.getValue(group, 'sync_key')) {
                engine.setValue(group, 'sync_key', 0)
                engine.setValue(group, 'reset_key', 1)
            } else {
                engine.setValue(group, 'keylock', engine.getValue(group, 'keylock') ? 0 : 1)
            }
        } else {
            engine.setValue(group, 'keylock', 1)
            engine.setValue(group, 'sync_key', 1)
        }
    } else {
        DJControlInstinctP8.timers.keylockPressed = new Date().getTime()
    }
}
engine.makeConnection('[Channel1]', 'keylock', function (value) {
    midi.sendShortMsg(0x90, 0x19, value ? 0x7D : 0x00);
});
engine.makeConnection('[Channel1]', 'sync_key', function (value) {
    if (value) {
        midi.sendShortMsg(0x90, 0x19, 0x7E);
    }
});
engine.makeConnection('[Channel1]', 'reset_key', function (value) {
    // show keylock colors again
    midi.sendShortMsg(0x90, 0x19, engine.getValue('[Channel1]', 'keylock') ? 0x7D : 0x00);    
});
engine.makeConnection('[Channel2]', 'keylock', function (value) {
    midi.sendShortMsg(0x90, 0x4A, value ? 0x7D : 0x00);
});
engine.makeConnection('[Channel2]', 'sync_key', function (value) {
    if (value) {
        midi.sendShortMsg(0x90, 0x4A, 0x7E);
    }
});
engine.makeConnection('[Channel2]', 'reset_key', function (value) {
    // show keylock colors again
    midi.sendShortMsg(0x90, 0x4A, engine.getValue('[Channel2]', 'keylock') ? 0x7D : 0x00);    
});

// UTILITY
DJControlInstinctP8.utilityPad = function (channel, control, value, status, group) {
    // todo: stars_up, stars_down

    if (value === 0) {
        DJControlInstinctP8.utilityActive = false;
        if (new Date().getTime() - DJControlInstinctP8.timers.utilityPressed < 500) {
            engine.setValue(group, "beats_translate_curpos", 1);
        }
    } else {
        DJControlInstinctP8.timers.utilityPressed = new Date().getTime()
        DJControlInstinctP8.utilityActive = true;
    }
    midi.sendShortMsg(0x90, group === "[Channel1]" ? 0x1A : 0x49, DJControlInstinctP8.utilityActive ? 0x7E : 0x00);
}

// HEADPHONE GAIN
// ...is managed by hardware!
DJControlInstinctP8.headphoneGain = function (channel, control, value, status, group) {
    // if (value === 0) {
        // return;
    // }
    // var currentValue = engine.getValue('[Master]', 'headGain')
    // engine.setValue('[Master]', 'headGain', currentValue + 0.01 * (control === 0x5D ? -1 : 1));
}

DJControlInstinctP8.crossfader = function (channel, control, value, status, group) {
    var group = value >= 64 ? "2" : "1";
    var oppositeGroup = group == '1' ? '2' : '1';
    var effectStrength = Math.abs(value - 64) / 64;
    
    engine.setValue('[EffectRack1_EffectUnit' + group + ']', "mix", effectStrength);
    engine.setValue('[EffectRack1_EffectUnit' + oppositeGroup + ']', "mix", 0);
}
