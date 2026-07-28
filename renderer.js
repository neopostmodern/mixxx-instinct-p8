class _Renderer {
  /**
   * @param {number} ccCode CC Code to send to change LED color
   */
  constructor(ccCode) {
    this.ccCode = ccCode;
    this.inherentValues = {};
  }

  /**
   * @param {number} midiNote MIDI note of the LED to change
   * @param {number} value New value of the LED
   * @param {boolean?} override Whether this call is an override (or a default write that will be stored, but has lower priority)
   */
  set(midiNote, value, override = false) {
    if (!override) {
      this.inherentValues[midiNote] = value;
    }
    midi.sendShortMsg(this.ccCode, midiNote, value);
  }

  /**
   * @param {number} midiNote
   * @param {number} value
   */
  override(midiNote, value) {
    this.set(midiNote, value, true);
  }

  /**
   * @param {number} midiNote
   */
  release(midiNote) {
    this.set(midiNote, this.inherentValues[midiNote]);
  }
}

var Renderer = _Renderer;
