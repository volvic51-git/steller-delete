# Board Format

**Status:** Draft v0.9
**親文書:** [`00-Architecture.md`](00-Architecture.md)（七原則）/ [`10-StellerDataSpec.md`](10-StellerDataSpec.md)（共通型）
**位置づけ:** ステデリの **盤面（事実）** を表現する最初の具体フォーマット。
憲法に従った「実装例」であり、以降のフォーマットの手本となる。

> **このバージョンは v0.9（ドラフト）。** `verification` は **Board の責務ではない**ため、
> このフォーマットには存在しない（独立フォーマット `30-VerificationFormat.md` が Board を参照する）。
> solver.js の100×100実測を経て v1.0 に凍結する。

---

## 0. 設計の一線（この文書の最重要ルール）

> **Board は「このJSONだけ見ても、ゲームが1フレームも動かない」状態を理想とする。**

Board は **事実の集合** であり、ゲームを動かすために必要な RuleSet・Solver・UI を **一切含まない。**
ゲームを動かすには別途それらが要る。Board はただの盤面資産である。

この一線を守ることで、同じ Board を RuleSet A でも B でも遊べる——Board が **再利用可能な資産** になる。

### Board が持つもの / 持たないもの

| 分類 | 項目 | Board に入れるか | 理由 |
|---|---|---|---|
| 盤面そのもの | 行数・列数 | ✅ 入れる | 盤面の寸法は事実 |
| 盤面そのもの | 地雷配置 | ✅ 入れる | 地雷の位置は事実 |
| 盤面制約 | 開始セル（startCells） | ✅ 入れる | 「ここから始めれば成立する」という盤面の制約 |
| 隣接アルゴリズム | 円柱 / トーラス / 矩形 | ❌ 入れない | 盤面の性質でなく **隣接判定の解釈** → RuleSet の責務 |
| 派生値 | 地雷数・近傍数字 | ❌ 入れない | mineMap から導出可能（Single Source of Truth） |
| ゲームルール・演出 | hintGaugeMax / autoFlag / allowRetry / 勝利条件 | ❌ 入れない | ゲームのモード・演出。盤面ではない |
| 他フォーマットの責務 | storyId / difficultyName / rankingCategory / bestTime | ❌ 入れない | Story / Ranking 等の責務 |
| 評価 | verification | ❌ 入れない | Immutability（第六条）。Verification が Board を参照する |

> **円柱（横ラップ）を Board に入れない**理由：円柱は盤面の性質ではなく **隣接判定アルゴリズム** である。
> 同じ地雷配置を、円柱で解釈しても矩形で解釈しても「盤面の事実」は変わらない。隣接の解釈は RuleSet が持つ。
> 将来 円柱 / トーラス / 矩形 が増えても **Board は1bitも変わらない。ルールだけ変わる。**

> **予約フィールドを作らない**（Data Responsibility の延長）：verification 用・replay 用・ranking 用の
> 「将来のための空欄」は一切置かない。必要になったら新フォーマットを足す。

---

## 1. 全体構造

Board は4ブロックのみ。`formatVersion` / `identity` / `board` / `provenance`、加えて生成由来の `meta`。

```jsonc
{
  "formatVersion": 1,

  "identity": {                  // → 10-StellerDataSpec.md §2
    "resourceId": "550e8400-e29b-41d4-a716-446655440000",
    "displayId": null,           // 未認定は null。認定時に "ST-000123"
    "parentId": "....."          // 生成元 Job の resourceId（手生成なら null）
  },

  "board": {                     // ← 盤面の事実。この文書の本体
    "rows": 100,
    "cols": 100,
    "mines": [ {"r":0,"c":5}, {"r":3,"c":12}, ... ],
    "startCells": [ {"r":50,"c":50} ],
    "hash": "sha256:...."        // board の正規形から計算した指紋
  },

  "provenance": {                // → 10-StellerDataSpec.md §3
    "createdBy": "factory",
    "createdAt": "2026-06-30T12:34:56.000Z",
    "createdWith": "board-factory",
    "toolVersion": "0.9.0"
  },

  "meta": {                      // 生成由来の情報（盤面の事実そのものではないが、再現に要る）
    "seed": 1234567890,
    "genVersion": "1"
  }
}
```

---

## 2. `board` ブロック（本体）

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `rows` | int | ✅ | 行数（1〜100）。 |
| `cols` | int | ✅ | 列数（1〜100）。 |
| `mines` | `{r,c}[]` | ✅ | 地雷セルの座標集合。**これが盤面の唯一の事実。** 重複・範囲外は不正。 |
| `startCells` | `{r,c}[]` | ✅ | 開始セル候補。1個以上。「このいずれかから始めれば成立する」という盤面制約。 |
| `hash` | string | ✅ | board 正規形の SHA-256（§4）。Board の同一性・重複排除に使う。 |

### 座標モデル

- `r` は行 `0 .. rows-1`、`c` は列 `0 .. cols-1`。
- 座標は **絶対位置のみ**。隣接（どのセルが隣か）は Board の関知するところではない（RuleSet の責務）。
- したがって Board は **近傍数字（neighborMines）を保存しない。** 数字は RuleSet の隣接定義から導出される。

### 派生値を持たない

- **地雷数は `mines.length` から導出**するため、`mineCount` フィールドは持たない（Single Source of Truth）。
- 同様に密度・数字盤面なども保存しない。

### startCells について

- `startCells` は **ルールではなく盤面制約** なので Board に属する。
- 「初手保証（最初に開くセルの周囲が安全）」という **方式** は RuleSet の責務。Board は
  「どのセルが開始点として妥当か」という **結果の制約** だけを持つ。
- 複数候補を持てる（イージー＝複数開始点、ストーリー専用＝固定など、RuleSet 側の使い分けに対応）。

---

## 3. `meta` ブロック（生成由来）

盤面の事実そのものではないが、**再現性のために必要**な最小情報のみ。

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `seed` | int | ✅ | 生成に使った決定論 PRNG のシード。 |
| `genVersion` | string | ✅ | 生成アルゴリズムのバージョン。同じ seed でも genVersion が違えば別盤面になり得る。 |

> seed 単体では再現性を保証できない。**seed + genVersion + PRNG実装** が揃って初めて
> 「同じ seed → 同じ盤面」が成立する。だから genVersion を必須とする。

---

## 4. `board.hash`（正規化と算出）

Immutability（第六条）により Board は不変であり、その指紋 `hash` も永久に同じである。

### 正規形（canonical form）

ハッシュは以下の **正規形の文字列** に対して計算する。実装差で hash がブレないよう、順序を固定する。

1. `mines` を `(r, c)` の昇順でソート。
2. `startCells` を `(r, c)` の昇順でソート。
3. 次の正規文字列を構成する（空白なし）：
   ```
   v1|rows=<rows>|cols=<cols>|mines=<r,c;r,c;...>|start=<r,c;r,c;...>
   ```
4. `hash = "sha256:" + SHA256(正規文字列)`。

### 方針

- **完全一致のみ**。円柱回転などの同値判定は **今は行わない**（必要になってから別途追加）。
  → 重複排除（同じ盤面を二度ライブラリに入れない）は、この hash の完全一致で判定する。
- 正規形の定義（上記の `v1|...` 仕様）は **hash バージョンの一部**。将来正規化規則を変えるなら
  `v2|...` とし、古い hash と混同しない。

---

## 5. バリデーション規則

読み込み時、以下を満たさない Board は **不正** として拒否する。

- `formatVersion` が読み手の対応範囲内。
- `1 ≤ rows ≤ 100`、`1 ≤ cols ≤ 100`。
- すべての `mines[i]` / `startCells[i]` が範囲内（`0 ≤ r < rows`, `0 ≤ c < cols`）。
- `mines` に重複座標がない。
- `startCells` が1個以上あり、`mines` と重複しない（開始セルが地雷でない）。
- `board.hash` が §4 で再計算した値と一致する（改竄・破損検出）。

---

## 6. v1.0 までに確定すること（未決事項）

このドラフトは v0.9。以下は **solver.js の切り出しと100×100実測** を経てから確定する。

- `mines` の表現形式：座標配列 `{r,c}[]` のままでよいか、100×100・高密度で
  **ビットマップ等の圧縮形式**が要るか（実測でファイルサイズと読込速度を確認して決める）。
- `startCells` の標準的な個数・選び方の指針（RuleSet 設計と連動）。
- 正規文字列フォーマットの最終確定（hash v1 の凍結）。

> verification（盤面の評価）は **この文書では一切扱わない。** Board は事実のみ。
> 評価は `30-VerificationFormat.md` が Board を `boardRef`(UUID) で参照して表現する。
