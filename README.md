# token-radar-makefun

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Suirobot/token-radar-makefun/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Suirobot/token-radar-makefun/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from a sealed DefiLlama snapshot: 198 protocols that record no token yet — the full 40-protocol watchlist plus the strongest further candidates under the same exclusions — ranked by implied launch value (TVL x category peer multiple x growth factor x maturity factor). The static dashboard (no network) shows the ranked board with search, category/chain/tier filters and five sort orders, a detail view per protocol with the model's working shown, and a concrete farm plan with costs and times for every row. main.ts (Node 22, standard library only) reads the snapshot, writes board.json and data.js, copies dashboard/ and screenshots/, and emits dossier.json via vendor/makefun-board.ts.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=dtmbvfy0&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
