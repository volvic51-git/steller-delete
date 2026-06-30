# Steller Data Architecture

**Status:** Draft v0.9
**作成日:** 2026-06-30
**位置づけ:** この文書はステデリ（Stellar Delete）V2以降の **設計の北極星** である。
コードではなく「なぜこの設計を選ぶのか」を残すための哲学書であり、
Board・Replay・Save・Job・Ranking、そして将来のAPK版・オンライン版・
コミュニティ投稿・クラウド同期まで、すべての判断はこの文書に従う。

> この文書に技術的な実装は書かない。具体的なフィールド定義は
> `10-StellerDataSpec.md`（共通型）および `20-BoardFormat.md`（各論）に置く。

---

## 1. なぜデータ仕様を先に作るのか

ステデリは長く育てるゲームである。これから

- 盤面（Board）
- リプレイ（Replay）
- 中断・再開（Save）
- 生成過程（Job）
- ランキング（Ranking）
- 将来のユーザー / クラウド同期

が増えていく。これらが **別々の思想で実装される** ことが、長期的に最も危険な未来である。

コードは書き直せる。しかし **一度ライブラリやユーザー端末に溜まったデータのフォーマットは書き直せない。**
移行コストは溜まったデータ量に比例して青天井に膨らむ。

したがってV2の最初の成果物は **プログラムではなくデータ仕様** である。
仕様が憲法であり、コード（Board Factory・ゲーム本体・将来のサーバー）はその憲法に従う実装に過ぎない。

この順序を守るために、開発は次の流れで進める。

```
仕様書 v0.9（理想のデータ構造をドラフト）
        ↓
solver.js の共通化・100×100 実測（現実とのギャップ確認）
        ↓
仕様書 v1.0（実装可能な仕様として凍結）
        ↓
Board Factory 本体・各機能の実装
```

机上の理想だけで v1.0 を固定すると、「実際には100×100のL2判定が現実的でなかった」と
判明したときに仕様を崩すことになる。**ドラフトで枠を決め、実測で裏を取ってから凍結する。**

---

## 2. Data Responsibility Principle（憲法第一条）

> **一つのデータフォーマットは一つの責務のみを持つ。**

- **Board** は盤面のみを表現する。
- **Replay** はプレイのみを表現する。
- **Save** はゲーム状態のみを表現する。
- **Job** は生成過程のみを表現する。
- **Ranking** は記録のみを表現する。

これらは互いを **参照する** が、**責務を共有しない。**

### なぜか

責務の混在はデータ構造を静かに腐らせる。例：

- Board に `bestTime` を入れた瞬間、Board は「盤面」ではなく「ランキング」も持ち始める。
  → 同じ盤面が別々のベストタイムを抱え、どれが正なのか分からなくなる。
- Replay が Board 全体をコピーし始めると、Replay は「プレイ」ではなく「盤面の複製」も持ち始める。
  → 盤面定義が二重化し、片方を直してももう片方が古いまま残る。

責務を一つに保てば、各データは「自分が何であるか」が常に明確で、
将来どれだけ機能が増えても判断がぶれない。

---

## 3. Identity Principle（憲法第二条）

> **すべてのデータは恒久的な resourceId（UUID）で識別される。**
> **表示用の displayId は別物であり、必要なときにのみ付与される。**

Identity は2種類しか作らない。

### ① Resource ID

そのデータ自身を識別する。**生成した瞬間に機械が振り、永続・不変・全データの真のキー** となる。

| データ | resourceId（内部・UUID） | displayId（表示・任意） |
|---|---|---|
| Board | `550e8400-e29b-...` | `ST-000123`（認定時のみ） |
| Job | UUID | `JOB-...` |
| Replay | UUID | `REP-...` |
| Save | UUID | `SAVE-...` |

### ② Reference

他のデータを参照するだけ。所有はしない（第三条を参照）。

```
Replay → BoardID
Save   → BoardID, ReplayID(optional)
Job    → 生成した Board群（親子関係）
```

### resourceId と displayId を分ける理由

- **ユーザーは displayId（ST-000123）しか見ない。**
- **システムは resourceId（UUID）しか見ない。**

将来サーバー・クラウド同期・コミュニティ投稿になると、連番だけでは衝突管理が破綻する。
UUID をサーバー導入前から振っておけば、同期した瞬間に衝突問題が存在しないことになる。

そして **displayId（ST番号）は誰が採番するのか** という問いには、設計上の答えがある：

- **resourceId（UUID）** … 生成した瞬間に機械が振る。永続・不変。
- **displayId（ST-xxx）** … **認定時に curator（将来はサーバー）が振る。** カタログ番号・表示専用。

ID を生成時でなく **認定時** に振るのは、生成アルゴリズムが将来変わっても
公式ライブラリの番号体系が汚染されないようにするためである（→ 第7章 却下案を参照）。

---

## 4. Reference Principle（憲法第三条）

> **データは所有しない。参照する。**

Replay は Board をコピーしない。BoardID（resourceId）だけを参照する。
Save は Replay 全体を持たない。必要なら ID だけを持つ。

### なぜか

- **データサイズが肥大化しない。** 8時間バッチで盤面が増えても、参照は ID 一個分。
- **真実が一箇所にしかない（single source of truth）。** 盤面を直すと、それを参照する
  すべての Replay / Save が自動的に最新の盤面を指す。コピーがないので不整合が起きない。

---

## 5. Data Separation Principle（憲法第四条）

> **仕様の能力と、個体の状態を、同じ場所に書いてはならない。**

「フォーマットがリプレイを扱える」と「この Board にリプレイがある」は **まったく別の話** である。

| 概念 | 何が語るか | 例 |
|---|---|---|
| **仕様の能力**（バージョンレベル） | `formatVersion` が語る | format v1 はリプレイ対応 |
| **個体の状態**（インスタンスレベル） | 各ブロックの存在と中身が語る | `verification.level: 2`、replayブロックの有無 |

この2つを「features」のような一つのまとめ箱に入れてはならない。
混ぜた瞬間に「`replay: false` は非対応？未生成？検証失敗？」という曖昧さが必ず再発する。
**仕様の能力はバージョン番号が語り、個体の状態は各ブロックの存在と中身が語る。**

---

## 6. Evolution Principle（憲法第五条）

> **仕様は変更できる。ただし既存データは壊さない。**

これが `formatVersion` が存在する理由である。

- 新しい仕様が出ても、古いデータは古い `formatVersion` のまま読める。
- 読み手は version を見て、自分が解釈できる形式かを判断する。
- 「古い Board Format v1 だが L3 検証済み」のような状態も、version と各ブロックの
  組み合わせで素直に表現できる。

---

## 7. Immutability Principle（憲法第六条）

> **Board は生成された瞬間から内容が変わらない。事実は不変であり、評価は外から積み重なる。**

Board は **読み取り専用データ** である。一度生成された盤面（resourceId・盤面配置・hash）は、
その後どれだけ時間が経っても、ソルバーが何世代進化しても、**1bit も変わらない。**

### 事実と評価を分ける

| 概念 | データ | 性質 | 例 |
|---|---|---|---|
| **事実（fact）** | Board | 不変。生成時に確定 | この盤面の地雷配置はこうである |
| **評価（evaluation）** | Verification | 後から付く・複数あり得る | この盤面は solver v2 で L2 と判定された |

「この盤面が L2 を満たすか」は **盤面そのものの属性ではなく、盤面に対する外部評価** である。
だから Verification は Board の中に書き込むのではなく、**Board を参照する独立データ** とする。

```
Board                         Verification
─────────────                 ─────────────
identity.resourceId   ◀────── boardRef          （Board を UUID で参照するだけ）
board.hash                    solverVersion
board.mineMap                 level
meta                          verifiedAt / verifiedBy
                              verificationHash    （証明。Board情報はコピーしない）
```

### なぜ Board に verification を持たせないのか

将来 Solver v2 / v3 / Community / Manual Review が登場すると、**評価だけが更新される。**
もし Verification が Board の内部フィールドなら、評価を足すたびに Board を書き換えることになり、
Immutability が崩れ、hash が変わり、「同じ盤面」の同一性が失われる。

Verification を独立させれば：

- **Board の hash は永遠に同じ。** 事実は変わらないのだから当然そうあるべき。
- **一つの Board に複数の Verification がぶら下がる**（solver v2 で L2、後に v3 で L3、community で確認…）。
  評価は append されるだけで、事実は一切汚れない。
- `L2 → 新Solver → L3` という昇格が、Board を一切触らずに表現できる。Git でも DB でも JSON でも扱いやすい。

> **証明は持つが、コピーはしない:** Verification は Board の情報（boardHash 等）を **保存しない。**
> 検証時に Board から boardHash を都度計算し、`verificationHash = SHA256(boardHash + solverVersion + level)`
> という **証明だけ** を保存する。これで「私はこの盤面をこの条件で検証した」と示せるが、Board の
> 事実そのものはコピーされない。`boardRef`(UUID) と `boardHash` を二重に持つと不整合の余地
> （`boardRef→A / boardHash→B`）を自ら作り、Single Source of Truth に逆行するため、これを避ける。

これは Data Responsibility Principle（第一条）と Reference Principle（第三条）を
Board と Verification の境界まで厳密に貫いた結果である。

---

## 8. Traceability Principle（憲法第七条）

> **すべてのデータは、その出自までたどれる。UUID を導入した本当の理由は、一意性ではなく追跡性である。**

参照（第三条）が UUID で行われることで、データは一方向にたどれる鎖になる。

```
Verification ──▶ Board ──▶ Job ──▶ Generator(seed, genVersion)
Replay       ──▶ Board
Save         ──▶ Replay ──▶ Board
```

- どの Verification も、評価した Board → 生成した Job → 生成条件（seed・genVersion）まで遡れる。
- どの Replay / Save も、プレイした盤面まで遡れる。
- バグや不正が見つかったとき、「同じ生成条件・同じ solver で作られたデータ群」を一括で特定できる。

UUID は衝突回避のためだけにあるのではない。**全データが出自を指し示すグラフを構成するため** にある。
これが Provenance（生成メタ）と `parentId`（親参照）を全フォーマットに持たせる理由でもある。

### これにより Board Factory は本当に「Factory」になる

追跡可能な鎖が通ったことで、「盤面生成ツール」は製造ラインになる：

```
Generator ──▶ Job ──▶ Board ──▶ Verification ──▶ Library
（生成器）   （工程）  （製品）   （検品）        （倉庫）
```

各段階が前段を UUID で指し、製品（Board）の出自と検品履歴（Verification）が永久に追える。
これが名前通りの **Factory** である。

---

## 9. Versioning

- すべてのデータは `formatVersion`（整数）を持つ。
- 共通型（Provenance / Identity）は `10-StellerDataSpec.md` に **一度だけ** 定義し、
  各フォーマットはそれを **参照する**。各仕様書に定義をコピペしない（コピペは必ずいつかズレる）。
- 仕様は v0.9（ドラフト）→ 実測 → v1.0（凍結）の手順で確定する。
- 破壊的変更は version を上げ、読み手側に移行ロジックを持たせる。既存データは決して壊さない。

### Provenance（共通メタデータ）

Board・Replay・Save・Job すべてに、誰が・いつ・何で作ったかを残す。

```
Provenance { createdBy, createdAt, createdWith, toolVersion }
```

これにより、認定後にバグが見つかっても「同条件で作られたデータを一括で再検証」できる。
ST 付与後も生成元の LOCAL-id / Seed / genVersion を残す（provenance）ことで、
盤面の出自を末永く追跡できる。

---

## 10. 却下した設計

「なぜそうしなかったか」を残すことで、半年後・数年後に同じ議論を繰り返さずに済む。

### ✗ 生成時に ST 番号を付与する案

生成アルゴリズムが将来変われば、同じ ST 番号の盤面でも中身の素性が変わってしまう。
ST は **公式ライブラリに登録した瞬間** にのみ付与する。生成段階は LOCAL-id（UUID）で十分。

### ✗ Board にランキング（bestTime 等）を持たせる案

第一条（Data Responsibility）違反。Board が盤面とランキングの二重責務を持ち、
どのベストタイムが正なのか不明になる。ランキングは独立フォーマットとして Board を参照する。

### ✗ Replay / Save に Board 全体を埋め込む案

第三条（Reference）違反。盤面定義が二重化し、データが肥大化し、不整合が生まれる。
参照は BoardID のみ。

### ✗ Board の中に verification フィールドを持たせる案

第一条（Responsibility）・第六条（Immutability）違反。評価を足すたびに Board を書き換えることになり、
hash が変わって「同じ盤面」の同一性が壊れる。Verification は Board を **参照する独立データ** とし、
Board には verification の枠すら持たせない。

### ✗ Feature Flags / Capabilities というまとめ箱を作る案

「Feature Flag」は業界で「実行時のON/OFFトグル」を指す確立した用語であり、
データ仕様に流用すると混乱を招く。さらに、その箱は仕様レベルの能力と
インスタンスレベルの状態を混在させてしまう（第五条参照）。
能力は `formatVersion` が、状態は各ブロックが語る。まとめ箱は作らない。

---

## 11. Non Goals

設計書が肥大化する最大の原因は「何でもここに書こう」とすることである。
この文書（および Steller Data Specification 文書群）は、**データの構造と思想のみ** を規定する。
以下は **意図的に規定しない**。これらは別文書で定義する。

- **ネットワーク通信を規定しない** — 同期プロトコル・API・転送形式は別文書。
- **UI を規定しない** — 画面・操作・見た目はゲーム実装の領域。
- **ゲームルールを規定しない** — 勝敗条件・スコア計算・難易度はゲーム実装の領域。
- **ソルバーアルゴリズムを規定しない** — solver の内部実装は `solver.js` とその設計書の領域。
  （データ仕様は solver の **結果** を `verification` として記録するだけで、解き方そのものには踏み込まない。）

最初に「何を書かないか」を宣言しておくことで、10年後でも読みやすい文書として保てる。

---

## 付録：文書構成

```
docs/
├── 00-Architecture.md     ← この文書（思想・なぜ）
├── 10-StellerDataSpec.md  ← 共通型（Provenance / Identity / Versioning 規約）
└── 20-BoardFormat.md      ← Board の具体仕様（board / solver / verification / meta）
```

各論を書くとき、判断に迷ったら必ずこの文書の五原則に立ち返る。

1. **Data Responsibility**（第一条）— 一データ一責務
2. **Immutability**（第六条）— Board は不変。事実は変わらず、評価は外から積み重なる
3. **Identity**（第二条）— UUID が真のキー、displayId は表示専用・認定時採番
4. **Reference**（第三条）— 所有しない、参照する
5. **Traceability**（第七条）— すべてのデータは出自までたどれる。UUID の目的は追跡性
6. **Data Separation**（第四条）— 仕様の能力と個体の状態を混ぜない
7. **Evolution**（第五条）— 既存データを壊さない

> 条文番号は制定順、サマリーは思想の近さ順（Responsibility と Immutability は「事実 vs 評価」の対、
> Identity・Reference・Traceability は UUID を軸にした三点セット）。
