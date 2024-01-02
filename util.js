const DUCK_SIZE = 2 ** 16;

var npmUtil = {};

npmUtil.updateValue = (
  group,
  key,
  diff,
  { parameter = false, toggle = false } = {}
) => {
  const currentValue = (parameter ? engine.getParameter : engine.getValue)(
    group,
    key
  );
  let newValue = currentValue + diff;
  if (toggle) {
    newValue = currentValue === 0 ? 1 : 0;
  }
  (parameter ? engine.setParameter : engine.setValue)(group, key, newValue);
};

npmUtil.encodeDuckFromDecks = (decks) => {
  let duckCode = 0;
  for (let deckIndex = 0; deckIndex < 4; deckIndex++) {
    duckCode += decks[deckIndex + 1] << (deckIndex * 2);
  }
  return duckCode / DUCK_SIZE;
};

npmUtil.decodeDecksFromDuck = (value) => {
  const duckValue = value * DUCK_SIZE;
  const decks = [null, null, null, null, null];
  for (let deckIndex = 0; deckIndex < 4; deckIndex++) {
    decks[deckIndex + 1] = (duckValue >> (deckIndex * 2)) & 3;
  }
  return decks;
};
