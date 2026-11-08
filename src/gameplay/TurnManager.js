// Who is playing and whose turn it is. Players are { name, type: 'human' | 'ai', difficulty? }.
export class TurnManager {
  constructor(players) {
    this.players = players;
    this.current = 0;
  }

  get currentPlayer() { return this.players[this.current]; }
  isAI(index = this.current) { return this.players[index].type === 'ai'; }
  set(index) { this.current = index; }
  other() { return (this.current + 1) % this.players.length; }
}
