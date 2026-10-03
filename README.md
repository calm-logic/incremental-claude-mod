# incremental-claude-mod

`/incremental` turns Claude Code into an incremental game. The Claude mascot mines a rock with a pickaxe while Claude works, and every ore it digs adds to a big ASCII token counter above the mine.

- **Claude is working:** the mascot swings and the rock drops ore: iron most of the time, with rarer copper, silver, gold, emerald, diamond and prismatic finds. Rare finds get ring bursts, star showers and a toast.
- **Waiting on a tool call:** no digging. The mascot stands with the pickaxe over his shoulder and checks his watch, with a clock bubble and a seconds counter.
- **No turn running:** pickaxe on shoulder, idle.

It is drawn as a band above the prompt. Run `/incremental` to show it, and again to hide it. Collapse it with ctrl+x ctrl+a.

This is a function-hooks plugin (the Claude Code mod API is early access and may change). The counter is the game's own, not your real API token usage.

## Install

```sh
git clone https://github.com/calm-logic/incremental-claude-mod
claude --plugin-dir ./incremental-claude-mod
```

## Develop

```sh
claude plugin validate .
claude plugin test .
```
