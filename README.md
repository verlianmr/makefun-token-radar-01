# verlianmr/makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/verlianmr/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/verlianmr/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar whose value model is fitted, at run time, on the snapshot itself. All 758
protocols are classified (416 already trading, 40 watchlist, 158 below-floor candidates, 144
products set aside with reasons). A comps regression of log market cap on the snapshot's own
figures is fitted on the 128 protocols whose token already trades; its term groups are chosen
by a two-fold held-out ablation whose table is printed on the dashboard. Every board row
carries token odds from its age-and-size bucket's traded share, a rank range from 200 seeded
bootstrap refits, and a farm plan costed step by step with a FARM / THIN / SKIP verdict.

## Run it

```sh
node main.ts --input <snapshot.json|directory>
```

Node 22, standard library only. Writes `board.json`, `data.js`, `dashboard/`, `screenshots/`
and `dossier.json` to `/output` (or `MAKEFUN_OUTPUT_DIR`).

---
<sub>Entered on [make.fun](https://make.fun/?ref=cw40tr4n&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
