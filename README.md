# Opinionated, unorthodox, versatile Mixxx mappings

## Instinct P8

A mapping for the Hercules DJ Control Instinct P8 controller

### Layout description

Pads are mirrored horizontally per deck

TODO: Shift + Load für toggle A/C bzw B/D? Anzeige per Farbe auf Pad unten innen?

### Outer top: Key

Short: toggle key lock
Long: tnable "match key" + key lock

### Inner top: Loop

Short: toggle loop (in place)
Hold + `knob`: move loop 1 bar

### Outer bottom: Eject

Short: eject track, enable headphone for channel, disable headphone for other channel, reset all filters + effects + pregain

### Inner bottom: Utilities

Hold + press other utility button: set beat grid
Hold + press `scratch`: adjust grid by half a beat
Hold + `knob`: adjust pre-gain
Hold + then hold `shift` + `knob`: adjust key
_Also used in combination with jog wheel and browsing knob, see below_

Blue light: deck is active and focused
Red light: button is held

### Scratch (button)

Short press: toggle large library view
Hold + press *any pad*: set or trigger hotcue; on the left pads are the first four and right the last four, always left to right, top to bottom
```txt
1 2 | 5 6
3 4 | 7 8
```
(TODO: LED feedback when scratch is held, show already set hotcues)

Also see _Utilities_ and _Jog wheel_

### Jog wheel

Regular: Slow jog wheel
Hold `scratch` + jog wheel: Super-fast jog wheel (degrades performance!)
Hold `shift` + jog wheel: adjust BPM
Hold `shift` + then hold `shift` + jog wheel: _UNUSED_
Hold `utility` + jog wheel: jump 32 bars
Hold `utility` + then hold `shift` + jog wheel: jump between available hotcues

### Sync

Short: sync (BPM + position) to other deck _once_ (if it is playing loud)
Long: sync (BPM + position) to other deck _permanently_
Shift + short: reset BPM

### Cue

Short, while playing: jump to cue
Short, while stopped: set cue position
Shift + short: jump to start (and stop)

### Play

Short: play/pause
Shift + short: play from cue position

### Crossfader

Effect mix from left (dry) to right (wet) for the focused channel

### Browsing knob

Regular turn: browse
Shift + turn: fast browse
Regular press: switch pane or open (context dependent)
Shift + press: unused
Hold `utility` + turn: master volume

## Behring CMD DV-1

Focus/Master/Double should be "Focus"

### Knobs above deck-buttons

Volume of the channels

### Deck-buttons

Short: set active deck

Hold a deck button and then...
Slice: pause/play
Erase: custom eject (see above)
~~Store: load highlighted track~~ (hold Store, see below)
~~Phrase: toggle loop~~
Four knobs above deck buttons: base / mid / high / filter
Short on another deck: move to deck, swap if deck is occupied (experimental, takes a few second)

### Erase

Short: see _Deck-Buttons_
Hold: see _Numbers_

### Store

Hold:

- Press number to set rating, 8 to delete rating
- Press deck to load track

### Phrase

Short: toggle library large view

### 1, 4, 8, 16 buttons

On the deck you hold:

1: back 32 bars
4: forward 32 bars
16: loop 32 bars

### Numbers

Short: Set or jump to hot cue
Hold _Erase_ + short: Delete hot cue
