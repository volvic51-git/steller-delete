# Steller Data Specification — Common Types

**Status:** Draft v0.9
**作成日:** 2026-06-30
**親文書:** [`00-Architecture.md`](00-Architecture.md)（思想・五原則）
**位置づけ:** ステデリ全データが共有する **共通語彙（Common Types）** を定義する。
個別フォーマット（Board / Replay / Save / Ranking / Job）は、この文書の型を
**参照する**。ここに定義をコピペしてはならない（Evolution Principle / コピペは必ずズレる）。

> この文書では Board などの具体構造は定義しない。共通型のみを定義し、
> 個別フォーマットは名前だけ予約する。Board の実構造は [`20-BoardFormat.md`](20-BoardFormat.md)。

---

## 0. この文書の責務（Non Goals 再掲）

- 規定する: **全データ共通の型と語彙**（Identity / Reference / Provenance / Version）。
- 規定しない: 個別フォーマットの中身、ソルバー、UI、通信、ゲームルール。
  → [`00-Architecture.md` §9 Non Goals](00-Architecture.md) を参照。

---

## 1. Version

すべてのデータは先頭に整数 `formatVersion` を持つ。

```jsonc
{
  "formatVersion": 1
  // ... 以降は各フォーマットの定義に従う
}
```

| 規約 | 内容 |
|---|---|
| 型 | 整数（`1`, `2`, ...）。マイナー版を持たせない（データには「読めるか/読めないか」だけが要る）。 |
| 増分 | 破壊的変更時にのみ +1。フィールド **追加** は version を上げない（後方互換のため未知フィールドは無視する）。 |
| 読み手の義務 | 自分が解釈できる最大 version を超えるデータは「未対応」として安全に拒否する。古い version は移行ロジックで読む。 |

> **設計思想（Data Separation）:** 「このフォーマットが何を扱えるか」は `formatVersion` だけが語る。
> 個体が実際に何を持つかは各ブロックの存在で語る。両者を `features` のような箱に混ぜない。

---

## 2. Identity

> Identity Principle（憲法第二条）の具体型。

Identity は2種類しかない。**Resource ID（自分自身）** と **Reference（他者への参照）**。

### 2.1 Resource ID

そのデータ自身を識別する。**生成した瞬間に機械が振り、永続・不変・全データの真のキー。**

```jsonc
"identity": {
  "resourceId": "550e8400-e29b-41d4-a716-446655440000", // UUID v4。必須・不変・真のキー
  "displayId": null,                                     // 表示用。未認定なら null
  "parentId": null                                       // 親データの resourceId（無ければ null）
}
```

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `resourceId` | UUID(string) | ✅ | システムが扱う唯一の真のキー。`crypto.randomUUID()` で生成。生成後は不変。 |
| `displayId` | string \| null | ✅(null可) | 人間が見る番号（例 `ST-000123`）。**認定時にのみ** curator/サーバーが付与。未認定は null。 |
| `parentId` | UUID \| null | ✅(null可) | 親データの `resourceId`。例：Board の親は生成元 Job。無ければ null。 |

#### displayId の採番規約

| ID | 採番者 | タイミング | 性質 |
|---|---|---|---|
| `resourceId`（UUID） | 機械 | 生成した瞬間 | 永続・不変・内部用 |
| `displayId`（ST-xxx 等） | curator（将来サーバー） | **公式ライブラリ登録時** | カタログ番号・表示専用 |

ID を生成時でなく **認定時** に振る理由は [`00-Architecture.md` §8 却下案](00-Architecture.md) を参照。

#### displayId プレフィックス予約

| プレフィックス | 対象 | 備考 |
|---|---|---|
| `ST-` | 公式認定 Board | 例 `ST-000123` |
| `LOCAL-` | 未認定 Board（ファクトリー内部） | UUID と併存。作業用バーコード |
| `VER-` | Verification | 予約のみ |
| `JOB-` | Job | 予約のみ |
| `REP-` | Replay | 予約のみ |
| `SAVE-` | Save | 予約のみ |
| `RULE-` | RuleSet | 予約のみ |

### 2.2 Reference

> Reference Principle（憲法第三条）の具体型。

他のデータを参照するときは、**その resourceId（UUID）のみ** を持つ。対象データの中身を
コピーしてはならない（所有しない、参照する）。

```jsonc
"boardRef": "550e8400-e29b-41d4-a716-446655440000" // 参照先の resourceId。実体はコピーしない
```

規約:

- 参照は常に `resourceId`（UUID）で行う。`displayId` で参照しない（displayId は後付け・可変）。
- optional な参照は `null` を許容する（例：Save の replayRef）。
- 参照先が見つからない場合の挙動（壊れた参照）は各フォーマットの責務で定義する。

---

## 3. Provenance

すべての永続データが持つ共通メタデータ。「誰が・いつ・何で作ったか」を残す。

```jsonc
"provenance": {
  "createdBy":   "factory",                 // 生成主体: "factory" | "game" | "community" | ...
  "createdAt":   "2026-06-30T12:34:56.000Z", // ISO 8601 / UTC
  "createdWith": "board-factory",            // 生成ツール/コンポーネント名
  "toolVersion": "0.9.0"                     // そのツールのバージョン
}
```

| フィールド | 型 | 意味 |
|---|---|---|
| `createdBy` | string | 生成主体の区分。将来 community 投稿などで使い分ける。 |
| `createdAt` | ISO8601(UTC) | 生成時刻。ローカルタイムを書かない（端末差で壊れる）。 |
| `createdWith` | string | 生成したツール/コンポーネント名。 |
| `toolVersion` | string | 上記ツールのバージョン。再現性追跡に使う。 |

> Provenance は Board・Replay・Save・Job すべてに付く。各フォーマットはこの型を **参照** し、
> 必要なら自分の領域に追加メタ（例：Board の `seed` / `genVersion`）を **別ブロックで** 持つ。
> Provenance 自体を拡張・コピー改変しない。

---

## 4. 予約（構造は未定義）

以下のフォーマットは **名前と displayId プレフィックスのみ予約** する。
構造は、それぞれの機能を実装する段階で別文書として定義する（Architecture の方針：
Board を先に完成させ、その後 Save → Replay の順で実装・仕様化する）。

| フォーマット | 文書（予定） | 責務（一行） | 状態 |
|---|---|---|---|
| Board | [`20-BoardFormat.md`](20-BoardFormat.md) | 盤面（事実）を表現する | 次に着手 |
| Verification | `30-VerificationFormat.md`（予定） | 盤面への評価を表現する（Board を参照） | 予約のみ |
| Save | `40-SaveFormat.md`（予定） | 中断中のゲーム状態を表現する | 予約のみ |
| Replay | `50-ReplayFormat.md`（予定） | プレイ操作列を表現する | 予約のみ |
| Job | `60-JobFormat.md`（予定） | 生成過程を表現する | 予約のみ |
| Ranking | `70-RankingFormat.md`（予定） | クリア記録を表現する | 予約のみ |
| RuleSet | `80-RuleSetFormat.md`（予定） | 隣接定義・初手保証方式・勝利条件などゲームルールを表現する | 予約のみ |

> **Board は RuleSet を知らない。** 円柱/トーラス/矩形などの隣接の解釈、初手保証の方式、勝利条件は
> すべて RuleSet の責務。同じ Board を異なる RuleSet で遊べる（Board は再利用可能な盤面資産）。

> **Board と Verification は別フォーマット**（Immutability Principle / 憲法第六条）。
> Board は不変の事実、Verification は後から積み重なる評価。Board には verification の枠を持たせず、
> Verification 側が `boardRef`（resourceId）+ `boardHash` で Board を参照する。

> 今これらの構造を先に作らない理由：Replay/Save まで先に仕様化すると、実装で見えてくる
> 「より良い案」を潰してしまう。共通語彙（この文書）が揃っていれば、後から同じ原則・同じ型で
> 自然に拡張できる。

---

## 付録：共通型サマリー

```
formatVersion : int                       // 仕様の能力はこれだけが語る
identity {
  resourceId : UUID                       // 真のキー・不変
  displayId  : string | null              // 表示専用・認定時採番
  parentId   : UUID | null                // 親への参照
}
<*>Ref        : UUID                       // 他データへの参照（実体はコピーしない）
provenance {
  createdBy, createdAt, createdWith, toolVersion
}
```

すべての個別フォーマットは、この語彙の上に構築される。
