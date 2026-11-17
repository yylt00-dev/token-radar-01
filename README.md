# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yylt00-dev/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yylt00-dev/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a snapshot of 758 DeFi protocols and ranks the ones that have real traction (TVL, chains, momentum) but no token yet — the strongest candidates to launch one. Each candidate gets an implied launch valuation (its category's median market-cap/TVL multiple, computed from tokenised peers in the same snapshot, adjusted for 7-day TVL momentum, protocol age and chain reach), a confidence score, the evidence behind the call, and a concrete 3–12 step plan for farming a potential airdrop. The program writes the board as JSON, generates a static dashboard (sortable/filterable board, per-protocol detail view, live already-trading reference prices) and hands in a dossier with real browser screenshots of that dashboard.

## Run it

```sh
node main.ts
```

Reads `/input/snapshot.json` (set `MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR` to relocate) and writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to `/output`. Node 22, standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?ref=cyjtwd3n&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
