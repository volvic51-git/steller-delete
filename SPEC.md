# Stellar Delete — 仕様書 V1.1
> 作成日: 2026-06-26　最終更新: 2026-06-26　対象ブランチ: master

---

## 1. プロジェクト概要

- **ジャンル**: ブラウザ動作の球面マインスイーパー＋ノベルパート
- **技術スタック**: HTML / CSS / JavaScript（フレームワークなし）、Three.js（球面描画）
- **公開先**: GitHub Pages（`volvic51-git.github.io/steller-delete/`）
- **バージョン**: V1.0（このドキュメント作成時点）

---

## 2. ファイル構成

```
./
├── index.html                  # タイトル・ステージ選択・CREDIT・セーブ管理
├── sphere-minesweeper.html     # ゲーム本体（球面マインスイーパー）
├── manual.html                 # 操作説明（クリッカブル画像ベース）
├── endrole_release.html        # エンディングロール
├── SPEC.md                     # 本仕様書
├── assets/
│   ├── images/
│   │   ├── img_title.jpg       # タイトル背景
│   │   ├── img_bg01.jpg        # ゲーム内背景
│   │   ├── img_manual.jpg      # manual.html 用画像
│   │   ├── mine.png            # 地雷アイコン
│   │   ├── back14.jpg          # エンディング最終背景
│   │   ├── etc/favicon.ico
│   │   ├── stages/
│   │   │   └── st01.png〜st09.png   # ステージ選択カード画像
│   │   └── characters/
│   │       ├── 001.png〜009.png
│   │       └── characters.json
│   └── audio/
│       ├── SND_01_title.mp3〜SND_06_ITSD.mp3   # BGM
│       └── EFE_01_popen.mp3〜EFE_08_bell3.mp3  # SE
├── data/
│   └── stages.json             # ステージ定義（9ステージ）
├── novel/
│   ├── novel01.html〜novel10.html
│   ├── images/                 # NovelEngine専用（変更不可）
│   ├── se/                     # NovelEngine専用（変更不可）
│   ├── css/style.css
│   ├── js/
│   │   ├── novel.js            # NovelEngine本体
│   │   └── script01.js〜script10.js
│   └── json/
│       └── novel_project_01.json〜novel_project_10.json
└── tool/
    ├── manual-editor.html              # manual.html 生成ツール
    ├── novel_editor.html               # scriptNN.js / novelNN.html 生成ツール
    ├── debug_endrole.html              # endrole_release.html 生成ツール
    ├── stellar-delete-flow-map.html    # フロー図
    └── stellar-delete-stage-params-editor.html
```

---

## 3. ゲームフロー

```
index.html（タイトル）
  ├── [STAGE SELECT] → ステージ選択カルーセル → sphere-minesweeper.html?stage=N
  ├── [STORY]        → novel/novel01.html〜novel10.html
  ├── [MANUAL]       → manual.html
  ├── [CREDIT]       → CREDITモーダル（スクロールアニメ）
  └── [EXIT]         → ブラウザを閉じる確認

sphere-minesweeper.html
  ├── クリア → クリア画面（タイム・ランキング表示）→ index.html or ステージ選択
  └── novel10クリア後 → endrole_release.html → index.html

novel/novelNN.html
  ├── novel01 → index.html（OPENING）
  ├── novel02〜09 → index.html?select=1&storyStage=N（ステージN解放・選択画面へ）
  └── novel10 → endrole_release.html（ENDING）
```

---

## 4. ステージ定義（data/stages.json）

| ID | 名前 | 難易度 | グリッド | 地雷数 |
|---|---|---|---|---|
| 1 | 鬼骨の星牢 | 初級 | 16×8 | 12 |
| 2 | 密林の星牢 | 中級 | 24×12 | 45 |
| 3 | 幻夢の星牢 | 上級 | 32×14 | 90 |
| 4 | 砂神の星牢 | 星雲級 | 40×18 | 150 |
| 5 | 暗闇の星牢 | 銀河級 | 48×22 | 220 |
| 6 | 魔海の星牢 | 銀河団級 | 56×26 | 300 |
| 7 | 白銀の星牢 | 超銀河団級 | 64×30 | 400 |
| 8 | 冥府の星牢 | 観測不可能級 | 72×34 | 500 |
| 9 | 消滅の果て | 消滅級 | 12×7 | 10 |

---

## 5. セーブデータ仕様

### localStorage キー一覧

| キー | 内容 |
|---|---|
| `stellarDeleteSave` | `{ unlockedStage: N, unlockedEpisode: N }` |
| `stellarDeleteRanking_stage_N` | タイムランキング配列（後述） |

### stellarDeleteSave

```json
{
  "unlockedStage": 0,
  "unlockedEpisode": 0
}
```

- `unlockedStage`: 解放済み最大ステージID（0=全未解放、1以上=プレイ可能）
- `unlockedEpisode`: 解放済み最大エピソード番号
- ステージID 1 はデフォルトで解放済み（`s.id > unlockedStage` で判定するため ID=1, unlockedStage=0 でも解放）

### セーブリセット

index.html の「セーブリセット」ボタンで `stellarDeleteSave` と全 `stellarDeleteRanking_stage_*` を削除後リロード。

---

## 6. タイムランキング仕様

### ランキングデータ構造

```json
[
  { "time": 21.418, "date": "2026/06/26" },
  ...
]
```

- ステージごとにlocalStorageに最大10件保存
- `time` 単位: 秒（小数点3桁精度 = ms精度）
- ソート: 昇順（タイム小さい順）
- 同タイムの場合: 既存レコードが上位（新規レコードは後ろに追加 → sort stable）

### 計測方法

```js
// ゲーム開始時
window._timerStartMs = performance.now();

// クリア時
const clearTimeSec = Math.round(performance.now() - window._timerStartMs) / 1000;
```

### 表示フォーマット

```js
function formatRankingTime(sec) {
  const ms = Math.round(sec * 1000);
  const intPart = Math.floor(ms / 1000);
  const fracPart = String(ms % 1000).padStart(3, '0');
  return intPart + '.' + fracPart + '秒';
}
// 例: 21.418秒
```

### クリア画面の表示

- `rescue-time`: タイム（`formatRankingTime`形式）
- `rescue-rank`: BEST1達成時 → `👑 NEW RECORD! BEST1 達成！`（金色）、それ以外 → `BEST${rank} 更新！`（シアン）
- 周回モード中はランキング記録・表示しない（`loopMode`フラグで制御）

### ステージ選択画面の表示

- カルーセル中央のステージのBEST1タイムを `BEST  21.418 SEC` 形式で表示
- `#stage-best-time` 要素（STAGE SELECTタイトルと惑星カルーセルの間）
- 記録なしの場合は空文字

---

## 7. sphere-minesweeper.html 主要仕様

### URLパラメータ

| パラメータ | 内容 |
|---|---|
| `stage=N` | ステージID（1〜9） |
| `mode=story` | ストーリーモード（PAUSEメニューのSTORY専用項目が表示） |

### モード

- **掘削モード（dig）**: 通常の掘削
- **旗モード（flag）**: 地雷フラグ設置
- 周回モード開始時、前のモードを引き継ぐ（強制変更なし）

### ヒント機能（ORACLE）

- アイコン: ✨
- ラベル: ORACLE
- 色: `#00ffcc`（ヒントゲージと同色）
- ヒントゲージが満タン時に使用可能
- 使用回数は `hintCount` で管理、クリア画面に `HINTS: N` 表示

### サーチ機能（JUDGE）

- アイコン: 👁️
- ラベル: JUDGE
- デフォルト: **OFF**（`let searchEnabled = false`）
- PAUSEメニュー内のデバッグメニューでON/OFFトグル（ユーザー非公開）
- `refreshSearchAvailability()`: `searchEnabled=false` なら即リターン
- ノベルや画面遷移後も OFF を維持（`restartGame()` 冒頭で `_searchAvailable=false; updateSearchButton()` リセット）

### デバッグメニュー

- PAUSEメニューの 🐞 DEBUG ボタンは `display:none`（V1.0時点でユーザー非公開）
- 機能は残存（`openDebugMenu()` / `closeDebugMenu()` は有効）
- デバッグリセットで `stellarDeleteRanking_*` も削除

### 長押し選択禁止

```css
body { user-select: none; -webkit-user-select: none; }
```

---

## 8. index.html 主要仕様

### ステージ選択カルーセル

- `stageData`: `data/stages.json` からロード
- `currentIdx`: 現在中央のステージインデックス
- `slide(dir)`: アニメーション（460ms）。**インデックス更新と同時に `updateStartBtn()` を呼ぶ**（ラグ防止）
- STARTボタンクリック時に `isLocked` 再確認（二重チェック）

### セーブとアンロック

- `unlockStage(stageId, saveData)`: ステージアンロック
- `unlockEpisode(ep, saveData)`: エピソードアンロック
- `?select=1&storyStage=N`: ノベルクリア後にステージNのみ表示する固定フィルター

### CREDITモーダル

- スクロール: `requestAnimationFrame` + `scrollTop` 駆動（60px/s）
- perspective: 240px、rotateX: 52deg（Star Wars クロール風）
- `padding-top = innerHeight * 0.6`（最初の文字が画面中央から登場）
- `padding-bottom = innerHeight`（最終行が完全スクロールアウトしてから終了）
- 終了: 全スクロール完了 → 2秒フェードアウト → モーダル自動クローズ
- クレジットデータ: `credits.json`、`▲` で改行

### 長押し選択禁止

```css
html, body { user-select: none; -webkit-user-select: none; }
```

---

## 9. endrole_release.html 仕様

### フェーズ構成

| フェーズ | 内容 | タイミング |
|---|---|---|
| phase1 | 歌詞タイプライター表示 | ページロード直後（OUTRO_WAIT=0） |
| phase2 | タイプライター終了後、自動でフェードアウト → back14.jpg表示 | `AUTO_DELAY = 3500 + TEXT_LEN×80 + 2000` ms後 |
| phase3 | back14.jpg を5秒表示 → index.html へ遷移 | back14フェードイン完了後5秒 |

- phase1→2の遷移はタップ/クリック不要（自動）
- LOADINGテキスト: `visibility: hidden`（非表示）
- 長押し選択禁止: `user-select: none; -webkit-user-select: none;`

---

## 10. NovelEngine 仕様

### NovelEngine.init() オプション

```js
NovelEngine.init({
  characters:  CHARACTERS,
  imagePath:   'images/',           // novel/images/ 相対
  bgmPath:     '../assets/audio/', // assets/audio/ 相対
  sePath:      'se/',               // novel/se/ 相対
  typingSpeed: 30,
  clickSE:     'click.wav',
  unlockStageOnComplete: N,         // 1〜9のみ（10はなし）
  nextUrl:     '...',
});
```

### novelNN.html の nextUrl 規則

| N | nextUrl |
|---|---|
| 1 | `../index.html` |
| 2〜9 | `../index.html?select=1&storyStage=N` |
| 10 | `../endrole_release.html` |

### novelNN.html の規則

- `var ts = "1.0"`（固定文字列。`Date.now()` 不使用）
- novel/images/ と novel/se/ は変更不可（NovelEngine内部パス）

### 背景画像（novel/images/）

- `back01〜09.jpg`, `back10.jpg`, `back12.jpg`, `back15.jpg` → .jpg
- `back13.png` → .png（唯一の例外）
- `back11` → 存在しない（`back01.jpg` を代用）

---

## 11. ツール仕様

### tool/novel_editor.html（旧: tool/script_editor.html）

- scriptNN.js と novelNN.html を生成・ダウンロード
- bgmPath 生成値: `'../assets/audio/'`
- `sdNextUrl(n)`: n>=10 → `'../endrole_release.html'`、それ以外 → 通常のindex.html URL
- プロジェクトファイル: `novel/json/novel_project_NN.json`（version:2）

### tool/manual-editor.html

- manual.html を生成するキャンバスベースのリージョンエディタ
- imgPath: `assets/images/img_manual.jpg`
- プロジェクトファイル: `tool/manual-project.json`（version:3）
- **注意**: `loadEditorImg()` は `renderStepList()` を呼ばない。ロード時は必ず `renderStepList(); renderEditForm();` を明示的に呼ぶ。

### tool/debug_endrole.html

- endrole_release.html を生成するツール
- 生成テンプレート内に `user-select: none` 設定済み

---

## 12. 開発上の注意事項

### PowerShellでJSONを書くとき

`Out-File -Encoding utf8` はUTF-8 BOM（EF BB BF）を付加する。`JSON.parse()` が失敗する。

```powershell
# 正しい書き方
[System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($false))
```

### アセットパス規則

| 場所 | パス |
|---|---|
| index.html / sphere-minesweeper.html から | `assets/images/` / `assets/audio/` |
| novelNN.html（BGM） | `../assets/audio/` |
| novelNN.html（画像） | `images/`（novel/images/ 相対、変更不可） |
| novelNN.html（SE） | `se/`（novel/se/ 相対、変更不可） |

### 長押し選択禁止の適用状況

| ファイル | 状態 |
|---|---|
| sphere-minesweeper.html | ✅ body に設定済み |
| index.html | ✅ body に設定済み |
| endrole_release.html | ✅ body に設定済み |
| manual.html | ✅ 設定済み |
| novel/css/style.css | ✅ 設定済み（novelXX.html 全体に適用） |
| tool/*.html | 対象外（開発ツール） |

---

## 13. 既知の設計上の決定事項

- **サーチ機能（JUDGE）はデフォルトOFF**: デバッグ用途のため。ユーザーには非公開。
- **デバッグメニューは表示中（V1.0では非表示 → V1.1で開発用に再表示）**: PAUSEメニューの 🐞 DEBUG ボタン。
- **周回モードでのモード継続**: 次周回開始時に掘削/旗モードを強制変更しない。
- **タイムランキングは周回モードで記録しない**: `loopMode=true` のときランキング処理をスキップ。
- **STARTボタンの二重ロック確認**: スライドアニメ中でもOFF（`updateStartBtn`即時呼び出し）＋クリックハンドラー内でも `isLocked` 確認。
- **CREDITはCSS animationではなくRAFでscrollTop駆動**: リサイズ対応と正確なタイミング制御のため。
- **周回制限時間は回復しない**: 周をまたいでも `remainingTime` を引き継ぐ。`_timerStartMs` を消費済み時間分ずらして整合させる。
- **周回遷移時のゴーストメッシュ除去**: `triggerLoopReplay` で次周初期化前に `cell.animating` 状態のメッシュを `scene` から強制削除。放置すると `scale=0.001` の極小メッシュが □ として残る。

---

## 14. RESCUEバー仕様（周回モード）

`#expose-bar-inner`（充填部）と `#expose-bar-back`（未充填部）の色を `updateLoopBarColors()` で制御。

```js
const LOOP_BAR_COLORS = ['#2962FF','#4F8DFF','#3ED6D6','#46D97A','#A9E34B','#FFD84D','#FF8B5A','#FF5E7E'];
// index 0 = 1番（最終周）、index 7 = 8番（最初の周）
```

- fillIndex (0始まり) = `loopCount - currentLoop`
- backIndex = fillIndex + 1（1周目のみ `transparent`）

**3周の例:**

| 周 | 充填色（fill） | 未充填色（back） |
|---|---|---|
| 1周目 | `#3ED6D6`（3番） | transparent |
| 2周目 | `#4F8DFF`（2番） | `#3ED6D6`（3番） |
| 3周目 | `#2962FF`（1番） | `#4F8DFF`（2番） |

非周回モードでは `#1E5EFF` 固定（CSS デフォルト値）。
