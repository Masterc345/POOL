// Local two-player (hot-seat) setup: identification and per-player key hints.
export const LOCAL_CONTROLS = {
  shared: 'Mouse / arrow keys aim, Up/Down power, Space shoots, 1-3 cameras.',
  hint(playerIndex, name) {
    return `${name} (Player ${playerIndex + 1}) - it is your turn`;
  },
};

export function createLocalMatch(name1, name2) {
  return [
    { name: (name1 || 'Player 1').trim() || 'Player 1', type: 'human', color: '#4fc3f7' },
    { name: (name2 || 'Player 2').trim() || 'Player 2', type: 'human', color: '#ffb74d' },
  ];
}
