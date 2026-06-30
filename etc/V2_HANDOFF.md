# Stellar Delete V2 引き継ぎ書

作成日: 2026-06-30  
V1完成後、V2開発を開始するためのハンドオフ文書。

---

## V1 状態（完成済み）

### 完了した主な機能
- ステージ1〜9（9はループモード）全クリアタイム記録・ランキング表示
- ループモード: 1周目開始〜最終周クリアまでの合計タイムを `_loopTotalStartMs` で記録
- HELP モーダル（絵文字・名前・役割テーブル）
- CONFIG メニュー（RESTART / HELP / STAGE SELECT / TITLE / BACK）
- タブ二重起動防止（`js/tab-guard.js`、BroadcastChannel + sessionStorage）
- STORY アコーディオン（未開放非表示、外側タップで閉じる）
- DELETE ボタン（長押し800ms → ランキングのみ初期化の隠しコマンド）
- itch.io 公開済み

### itch.io 公開に関する注意
- zip は必ず `System.IO.Compression` で作成（`Compress-Archive` はパス区切りが `\` になりitch.ioで全リソース404になる）

---

## V2 開発方針

### フェーズ1: 事前盤面生成（次セッションから開始）

**目的:** 大きな盤面（特にステージ9/ループモード）で確率保証が難しい問題を解消する。  
プレイ時に盤面生成するのではなく、**事前に生成したJSONファイルを読み込んでプレイする。**

**設計概要:**
```
tool/board-generator.html  ← 盤面生成ツール（新規作成）
  ↓ 生成
data/boards/stage9/board_001.json, board_002.json ...
  ↓ プレイ時
sphere-minesweeper.html でランダムに1つ読み込む
```

**JSONフォーマット案:**
```json
{
  "id": "stage9_001",
  "stage": 9,
  "rows": 20,
  "cols": 30,
  "mines": [{"r": 0, "c": 5}, ...],
  "seed": 1234567890,
  "generatedAt": "2026-06-30T00:00:00Z"
}
```

**生成ツール仕様（`tool/board-generator.html`）:**
- ステージ選択（1〜9）
- 生成枚数入力（例: 50枚）
- 確率保証チェック（初手安全・解法チェック）付きで生成
- JSONを1ファイルまたはまとめてダウンロード
- 進捗表示（生成中はプログレスバー）

**sphere-minesweeper.html 側の変更:**
- 起動時に `data/boards/stageN/` をfetchして一覧取得
- ランダムに1枚選んでJSONで盤面初期化
- 既存の盤面生成ロジック（`generateBoard()`）は残す（フォールバック用）

### フェーズ2: リプレイ機能

フェーズ1完了後に実装。  
**仕組み:** プレイ中の操作ログ（開くセル、フラグ操作、タイムスタンプ）を記録し、盤面IDとセットでlocalStorageに保存。再生時は同じ盤面JSONを読んで操作を再現。

**必要な追加フィールド:**
```json
{
  "boardId": "stage9_001",
  "actions": [
    {"type": "open", "r": 5, "c": 10, "t": 1234},
    {"type": "flag", "r": 3, "c": 7, "t": 2500}
  ],
  "clearTime": 183.4
}
```

### フェーズ3: 中断・再開機能

リプレイ機能が完成すれば実装は容易。  
途中状態 = 途中までの操作ログを保存し、再開時に盤面を復元してから残りのログを適用。

---

## Capacitor / Android APK 化

V2完了後に着手予定。分析結果は [`etc/CAPACITOR_ANALYSIS.md`](CAPACITOR_ANALYSIS.md) に記載。

**主要課題:**
1. マルチページ→SPA化（最大工数）
2. Three.js CDN → ローカル同梱
3. Google Fonts CDN → ローカル同梱
4. Androidバックボタン対応

**ユーザー側の事前準備:**
- Node.js インストール（Capacitor CLI に必要）
- Android Studio インストール（APKビルドに必要）

---

## プロジェクト構成（V1完成時点）

```
ver9_20_Git/
├── index.html              # タイトル・ステージ選択
├── sphere-minesweeper.html # プレイ画面（メイン）
├── endrole_release.html    # エンドロール
├── novel/
│   ├── novel01.html 〜 novel10.html
│   └── js/novel.js         # NovelEngine
├── js/
│   └── tab-guard.js        # タブ二重起動防止
├── assets/
│   ├── audio/              # BGM・SE
│   ├── images/             # 画像
│   └── fonts/              # フォント（ローカル）
├── data/                   # （V2で boards/ を追加予定）
├── tool/
│   ├── manual-editor.html
│   └── novel_editor.html
└── etc/
    ├── V2_HANDOFF.md       # この文書
    └── CAPACITOR_ANALYSIS.md
```

---

## 次セッションでやること

1. `tool/board-generator.html` を新規作成（事前盤面生成ツール）
2. `data/boards/` ディレクトリ構成を決定
3. 生成ツールで盤面を生成・動作確認
4. `sphere-minesweeper.html` を改修して盤面JSONを読み込む処理を追加

---

## 参考: V1の重要な実装メモ

### ループモード cleartime
```js
// startTimer() 内
window._timerStartMs = timeLimitMode && loopMode && currentLoop > 1
  ? performance.now() - (totalTime - remainingTime) * 1000
  : performance.now();
if(currentLoop === 1) window._loopTotalStartMs = performance.now();

// showRescueScreen() 内
const clearTimeSec = loopMode && window._loopTotalStartMs
  ? Math.round(performance.now() - window._loopTotalStartMs) / 1000
  : window._timerStartMs
    ? Math.round(performance.now() - window._timerStartMs) / 1000
    : elapsed;
```

### ゲームオーバー時フラグ絵文字バグ対処
```js
// triggerGameOverSequence() 内
gameOverMistakeCell = mistakeCell || null;
if(gameOverMistakeCell && !gameOverMistakeCell.isMine){
  gameOverMistakeCell.hasFlag = false;
  gameOverMistakeCell.isOpen = true;
  updateCellVisual(gameOverMistakeCell);
}
```
