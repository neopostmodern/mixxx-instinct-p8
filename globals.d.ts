interface Script {
  toggleControl: (group: string, control: string) => void;
  deckFromGroup: (group: string) => number;
}
declare const script: Script;

interface Midi {
  makeInputHandler: (
    midiPrefix: number,
    midiNote: number,
    callback: (
      midiPrefix: number,
      midiNote: number,
      value: number,
      status: number,
    ) => void,
  ) => { disconnect: () => void };
  sendShortMsg: (midiPrefix: number, midiNote: number, value: number) => void;
}
declare const midi: Midi;

declare const print: (text: string) => void;
