# V2 盤面密度 実測データ — 列の説明

`V2_board_density_data.csv` の各列の意味。1行＝1条件（盤面サイズ×密度）の集計。
全試行の生データ（seedごと）は `tools/board-benchmark.html` の JSON 出力に残し、
この CSV には**条件ごとのサマリ**だけを記録する。

| 列 | 意味 | 例 |
|---|---|---|
| `rows` | 行数 | 72 |
| `cols` | 列数 | 144 |
| `density_pct` | 地雷密度（%） | 18 |
| `mine_count` | 実際の地雷数 = round(rows×cols×density) | 1866 |
| `wrap` | 隣接ルール（cyl=円柱 / rect=矩形 / torus=トーラス） | cyl |
| `start` | 開始セル（center=中央、または "r,c"） | center |
| `trials` | 試行回数 | 1000 |
| `solvable` | 保証成立（推測なしで解けた）件数 | 103 |
| `success_rate_pct` | 成功率 = solvable / trials × 100 | 10.3 |
| `avg_solver_ms` | solver 1回の平均時間（ms） | 45.2 |
| `max_solver_ms` | solver 1回の最大時間（ms） | 180.5 |
| `retry300_ok_pct` | リアルタイム生成（上限300回リトライ）で1枚出る確率（%）。空欄なら未算出 | 100 |
| `gen_version` | 生成アルゴリズムのバージョン。ロジックを変えたら必ず変える | 1 |
| `measured_at` | 計測日（YYYY-MM-DD） | 2026-06-30 |
| `note` | 所感（realtime可 / Factory推奨 など） | Factory推奨 |

## 記入のヒント

- `success_rate_pct` が分かれば方式判断はできる。`avg/max_solver_ms` は余裕があれば。
- `retry300_ok_pct` の目安：成功率 p のとき `1 - (1-p)^300`。
  - 10% → ほぼ100%（realtime可）
  - 0.3% → 約59%（4割が保証なしで開始 → Factory推奨）
- **`gen_version` は必ず埋める**。これが違うと同じ密度でも数字が変わるため、後で比較するときに必要。

## この先

データが揃ったら、この CSV をもとに `V2_BOARD_DENSITY_FINDINGS.md`（しきい値の文章化）を作成し、
`V2_GENERATION_ENGINE.md` から参照させる。先頭2行は既知の概算値（要・本計測で上書き）。
