interface Script {
  toggleControl: (group: string, control: string) => void;
  deckFromGroup: (group: string) => number;
}
declare const script: Script;

declare const print: (text: string) => void;