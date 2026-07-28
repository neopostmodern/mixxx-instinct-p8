/**
 * @callback MidiCallback
 * @param {Object} event
 * @param {number} event.midiPrefix
 * @param {number} event.midiNote
 * @param {number} event.value
 * @param {number} event.midiStatus
 * @param {typeof deckControl.LEFT | typeof deckControl.RIGHT} [event.side]
 * @param {Object} event.config
 * @returns {void}
 */
/**
 * @typedef {Object} MidiInputHandlerController
 * @property {() => boolean} disconnect
 */

class _MidiHelpers {
  constructor(defaultMidiPrefix) {
    this.defaultMidiPrefix = defaultMidiPrefix;
    this.shortAndLongTimes = {};
  }

  /**
   * Batch connect MIDI handlers to all combinations of prefixes and notes
   * @param {Object} config
   * @param {string} config.id Unique ID of this handler
   * @param {string} [config.description] Free form text description
   * @param {number|Array<number>} [config.midiPrefixes] One or more MIDI prefixes
   * @param {number|Array<number>|{left: number, right: number}} config.midiNotes One or more MIDI notes
   * @param {MidiCallback} [config.onChange] TODO
   * @param {MidiCallback} [config.onTap] TODO
   * @param {MidiCallback} [config.onLongTap] TODO
   * @param {{down?: MidiCallback, up?: MidiCallback, both?: MidiCallback}} [config.onPress] TODO
   * @param {Object} [config.autoSetup] TODO
   * @param {string} config.autoSetup.key Name of property to auto-configure
   * @param {'toggle'|'value'} [config.autoSetup.behavior] Name of property to auto-configure, defaults to 'value'
   * @param {Object} [config.feedback] TODO
   * @param {Object} [config.feedback.key] Name of property to auto-configure for feedback
   * @param {Object} [config.feedback.color] Color value to send
   * @param {boolean} [config.softTakeover] Configure soft takeover for this property
   * @returns {Array<MidiInputHandlerController>} Array of MIDI connections
   */
  bind({
    id,
    midiPrefixes = this.defaultMidiPrefix,
    midiNotes,
    onChange = () => {},
    onTap = () => {},
    onLongTap = () => {},
    onPress: {
      up: onPress_up = () => {},
      down: onPress_down = () => {},
      both: onPress_both = () => {},
    } = {},
    autoSetup,
    feedback,
  }) {
    const midiNotesAsArray =
      typeof midiNotes === "object" && "left" in midiNotes
        ? [midiNotes.left, midiNotes.right]
        : midiNotes;
    return npmUtil.flattenArray(
      npmUtil.ensureArray(midiPrefixes).map((midiPrefix) =>
        npmUtil.ensureArray(midiNotesAsArray).map((midiNote) => {
          const compositeId = `${id}:${midiPrefix}:${midiNote}`;
          let side = undefined;
          if (typeof midiNotes === "object" && "left" in midiNotes) {
            side =
              midiNote === midiNotes.left
                ? deckControl.LEFT
                : deckControl.RIGHT;
          }
          if (feedback) {
            // todo: need to track (store) the connections to unbind/bind them on deck swap!
            // connect(deckControl.getChannel(side), feedback.key, (value) => {
            //   midi.sendShortMsg(0x90, 0x21, value ? 0x7d : 0x00);
            //   midi.sendShortMsg(0x90, 0x24, value ? 0x7d : 0x00);
            // });
          }
          return midi.makeInputHandler(
            midiPrefix,
            midiNote,
            (eventMidiPrefix, eventMidiNote, value, midiStatus) => {
              const event = {
                midiPrefix,
                midiNote,
                value,
                midiStatus,
                config: { midiPrefixes, midiNotes },
                side,
              };

              onChange(event);

              if (value === 0) {
                onPress_up(event);
                onPress_both(event);
                if (
                  new Date().getTime() - this.shortAndLongTimes[compositeId] <
                  500
                ) {
                  onTap(event);
                } else {
                  onLongTap(event);
                }
              } else {
                this.shortAndLongTimes[compositeId] = new Date().getTime();
                onPress_down(event);
                onPress_both(event);
              }

              if (autoSetup) {
                if (value !== 0) {
                  if (autoSetup.behavior === "toggle") {
                    script.toggleControl(
                      deckControl.getChannel(event.side),
                      autoSetup.key,
                    );
                  } else {
                    engine.setValue(
                      deckControl.getChannel(event.side),
                      autoSetup.key,
                      1,
                    );
                  }
                }
              }
            },
          );
        }),
      ),
    );
  }
}

var MidiHelpers = _MidiHelpers;
