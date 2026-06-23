# Stellar Delete 開発引き継ぎ書 兼 仕様書 v3

**対象範囲:** タイトル / SIMPLEモード / STORYモード / ノベルパート / プレイ画面 / 開発用ツール
**作成日:** 2026年6月20日
**今後の方針:** ローカル開発完了後、GitHubへ移行 → APK化（Android）を目標とする。Steam化（Electron想定）も将来検討中。

---

## 1. ファイル構成（最新版）

```
📁 project-root/
├── index.html                 タイトル＋SIMPLE/STORYセレクト＋クレジット
├── sphere-minesweeper.html    ゲーム本体
├── 📁 data/
│   ├── stages.json            ステージ表示用データ（index.html用・既存のまま）
│   ├── stage-params.json      ステージのゲーム設定（novelAfterClear/bgm/background追加）
│   └── credits.json           クレジット表示用データ（既存のまま）
├── 📁 characters/              キャラクター定義・画像（既存のまま）
├── 📁 stages/                  ステージサムネイル（既存のまま）
├── 📁 images/
│   ├── mine.png
│   └── 📁 stage-bg/            ステージ専用背景画像（新設・未使用）
├── 📁 sounds/                  ゲーム本体SE/BGM ＋ ステージ専用BGM ＋ ノベル用BGMを共有
├── 📁 title/                   タイトル背景（既存のまま）
└── 📁 novel/                   ノベルパート一式
    ├── novel01.html〜novel10.html
    ├── 📁 js/
    │   ├── novel.js            エンジン本体（nextUrl対応・AUTO機能追加）
    │   └── script01.js〜script10.js
    ├── 📁 css/style.css
    ├── 📁 images/
    ├── 📁 bgm/                  ※bgmPathは ../sounds/ に変更済みのため実質未使用
    └── 📁 se/
```

**開発用ツール（サイトには含めない・別管理）**

| ツール | 用途 |
|---|---|
| `stellar-delete-flow-map.html` | 画面遷移フロー可視化（ノードエディタ）。STORY全体のチェーンを可視化・管理 |
| `stellar-delete-stage-params-editor.html` | `stage-params.json`編集（全フィールド対応） |
| `script_editor.html` | ノベルシナリオ編集・`scriptNN.js`書き出し |

---

## 2. 画面遷移

### SIMPLEモード
```
タイトル（SIMPLEボタン）
  → ステージセレクト（全ステージ選択可）
  → ゲーム
  → クリア（RESCUE SUCCESS: STAGE / TITLE）
    または ゲームオーバー（ur GONE.: CHECK / RETRY / STAGE SELECT / TITLE）
```

### STORYモード
```
タイトル（STORYボタン）
  → novel01.html（オープニング）
  → index.html?select=1&storyStage=1（ステージ1固定セレクト、他ステージ非表示）
  → ステージ1プレイ（sphere-minesweeper.html?stage=1&mode=story）
  → クリア（RESCUE SUCCESS: NEXT / TITLE）
  → novel02.html（Stage1クリア後）
  → storyStage=2 → ステージ2 → … 以降ステージ8まで同パターン
  → novel09.html（Stage8クリア後）
  → index.html?select=1&storyStage=9
  → ステージ9プレイ（?stage=9&mode=story）
  → クリア → novel10.html（エンディング） → タイトルへ
```

- `mode=story` は、`index.html`の固定セレクト画面で「START」を押した時のみ付与される（`isStoryFixedSelect`判定）
- ゲームオーバー画面（ur GONE.）のボタンはSIMPLE/STORYで出し分けない（常にCHECK/RETRY/STAGE SELECT/TITLEの4つ）
- クリア画面（RESCUE SUCCESS）のみ`mode=story`の有無で表示ボタンが変わる

---

## 3. データファイル

### `stage-params.json`（拡張フィールド）

| フィールド | 型 | 内容 |
|---|---|---|
| `id`,`diff`,`mines`/`density`,`charId`,`logicGuarantee`,`boardColor`,`maxHints`,`grid_col`/`row`/`total`,`timeLimitMode`/`timeLimit`,`loopMode`/`loopCount`,`exMode` | （既存） | これまで通り |
| `novelAfterClear` | string | クリア後の遷移先ノベルHTML。`mode=story`の時のみ使用（クリア画面が`NEXT`ボタンになる） |
| `bgm` | string | ステージ専用BGM（`sounds/`内のファイル名）。設定時はクリアジングルへの切替をスキップし、そのまま継続再生 |
| `background` | string | ステージ専用背景画像（`images/stage-bg/`内のファイル名）。現状未使用（全ステージ空欄） |

**現在の設定**：`id:9`のみ`"bgm": "bgm01.mp3"`を設定（ステージ9〜エンディングのクライマックス曲）。`novelAfterClear`は全9ステージに設定済み（`novel02.html`〜`novel10.html`）。

---

## 4. ノベルパート

### エンジン（`novel.js`）の主な拡張

| 機能 | 内容 |
|---|---|
| `nextUrl` | `NovelEngine.init({...nextUrl:'...'})`で指定。END到達時にEND画面を出さず自動遷移する |
| AUTO機能 | 画面右上のAUTOトグルボタン。ONにすると1行読み終えてから1秒後に自動で次へ。OFF/ONはページをまたいで引き継がない（画面ごとに必ずOFFスタート） |
| `bgmPath` | `'bgm/'` → `'../sounds/'` に変更済み（ゲーム本体とBGMを共有するため） |
| `bg_scroll`の`loop` | CSSタイル方式ではなく、表示範囲の端で位置を折り返す方式に変更。`down`方向は最上部到達時、`loop`指定に関わらず停止する仕様（既存仕様を踏襲） |

### `novel01〜10.html` の役割

| ファイル | 内容 | `nextUrl` |
|---|---|---|
| `novel01.html` | オープニング（STORYボタンの入口） | `index.html?select=1&storyStage=1` |
| `novel02.html`〜`novel09.html` | Stage(N-1)クリア後 | `index.html?select=1&storyStage=N` |
| `novel10.html` | エンディング | `index.html` |

### 登場キャラクター・あらすじ

- **アリス**：主人公
- **フラット**：案内役。ステージ1で同行を断り「僕はここにいないから、どこへも行けない」と発言。ステージ9で星の傷だらけの姿で再会し、最後は崩壊・消滅する
- 各ステージのヒロイン：ルージュ（鬼骨）／カラス（密林）／ダーティー（幻夢）／レディ・レディ（砂神）／イロハ（暗闇）／アビス（魔海）／ゼノ（白銀）／ヨミ（冥府、正体はスペードの女王）
- テーマ：「不思議の国のアリス」モチーフ＋星が消滅していく世界観。フラットの正体は最終的に示唆される（「迷子」という自己紹介で締める）

### `script_editor.html`（シナリオ編集ツール）

- ノベルプロジェクト（JSON）の編集・`scriptNN.js`書き出し用
- 「Stellar Delete用」エクスポート：ノベル番号を選ぶと`nextUrl`を自動付与し`scriptNN.js`としてダウンロード
- プロジェクトJSON保存時にノベル番号も記録、読込時に自動復元（`nextUrl`消失事故の再発防止策）

⚠️ **過去に発生した事故**：「Stellar Delete用」エクスポート機能が、別の修正依頼の際にアップロードされた**古いローカルファイル**をベースに編集してしまったことで一時的に消失。今後ファイルの修正を依頼する際は、**必ず直近で受け取った最新版を使うこと**（ローカルでの手動編集との運用ルールを決めておくと安全）。

---

## 5. UI構成（全面刷新）

### 上部UI
旧来の横長バー（背景帯）を廃止し、要素を個別配置する方式に変更。

| 要素 | 位置 |
|---|---|
| RESCUE PROGRESS | 左上（`top:16px`）。バー幅を30%短縮（168px） |
| 設定アイコン⚙️＋音声アイコン🔊 | 中央上。`left:max(260px, 50%)`でRESCUEバーとの衝突を回避（狭いスマホ画面対応） |
| タイマー | 右上。1.5倍サイズ |
| モード切替アイコン（⛏） | タイマーの下（`top:78px`） |

### DEBUGメニュー
上部の常設DEBUGボタンを廃止。設定アイコン→PAUSEDメニュー内「DEBUG」ボタン→タイル状グリッドメニューを開く形に変更。全12項目（確率表示・CLEAR・盤面色・盤面・論理保証・制限時間・周回モード・EXモード・爆弾密度・リスタート等）をタイルで表示。

### タイマー演出（「不思議の国タイマー」）
画像不要のテキストベース演出。桁ごとに歪んだ回転・スケールスタイルを適用し、千の位の更新時はやや強めの演出（タイマー枠が発光）。秒数をそのまま表示（`MM:SS`変換なし、最大9999秒）。既存ゲームの`elapsed`変数に接続しているだけなので、1手目開始・設定メニュー中継続・リスタートで0に戻る、という既存仕様にそのまま乗っている。

### クリア画面（RESCUE SUCCESS）
旧：「CONTINUE」ボタン1つ→別の`#message`画面を経由。
新：RESCUE SUCCESS画面に直接、状況別ボタンを表示（`#message`画面を経由しない）。

| 状況 | ボタン |
|---|---|
| STORY（`mode=story`かつ`novelAfterClear`あり） | NEXT ＋ TITLE |
| SIMPLE（それ以外のステージモード） | STAGE ＋ TITLE |
| ステージ指定なし（デバッグ等） | RETRYのみ |

ボタンは横並び・同幅（170px）に統一。

### ゲームオーバー画面（「ur GONE.」）
旧：「💥ゲームオーバー」＋「もう一度」のみ。
新：演出付きステージド表示に全面刷新。

```
STEP1: 地雷ヒット／時間切れ → 入力即停止 ＋ 鐘SE①
STEP2: 1秒後 → 未公開セル全公開（ミスしたセルは赤くパルスハイライト）＋ 鐘SE②
STEP3: 1秒後 → 「ur GONE.」フェードイン ＋ 鐘SE③ → 0.3秒後サブテキスト・ボタン表示
```

- タイトルは英字のみ「ur GONE.」（小文字"ur"＋全角"GONE"）、赤〜ピンク系ネオン発光
- サブテキストは「あなたは消滅してしまった！」固定（原因（地雷／旗ミス／時間切れ）による文言の出し分けは廃止し統一）
- ボタンは常時4つ：**CHECK**（ダイアログを閉じて盤面確認モードへ。タップで再表示。掘削・旗操作は`gameState==='lose'`で既にブロック済み、カメラ回転・ズームは可能）／**RETRY**／**STAGE SELECT**／**TITLE**
- ミスしたセルのハイライトは`hintTarget`と同じ仕組み（`animate()`ループ内パルス発光）を流用。リスタートまで継続表示（CHECKモード中も消えない）
- 鐘SE：`sounds/EFE_06_bell1.mp3`〜`EFE_08_bell3.mp3`（**素材未準備**。無くてもエラーにはならず無音で動作）

---

## 6. BGM関連の挙動まとめ

- ゲーム本編BGMは`stage-params.json`の`bgm`で上書き可能（デフォルト`SND_02_play.mp3`）
- `bgm`設定済みステージは、クリア時にジングル（`SND_03_clear.mp3`）へ切り替えず、そのまま継続再生
- 1手目クリック前でも、**ページへの最初の操作（クリック/タップ）でBGM開始**するよう変更済み（novel→ゲーム遷移時の「頭出し感」を軽減する狙い）
- `stage-params.json`取得（非同期fetch）より早く操作された場合の競合にも対処済み（デフォルト曲が鳴り始めていたら、ステージ固有BGMへの差し替え時に自動で再生継続）
- ステージ9〜エンディングを見越して、`storyStage=9`のセレクト画面限定でクライマックス曲（`bgm01.mp3`）に差し替える仕組みを`index.html`に実装済み。**ただし実際には`EFE_04_select.mp3`が鳴っているように見えるという報告があり、原因未特定のまま保留中**（優先度低、現状は`novel09`→ステージセレクト→プレイ画面、という通常ルートに戻して運用）
- novel→ゲーム間の完全シームレスなBGM継続は、複数ページ構成である以上**技術的に困難**と判断。`sessionStorage`での再生位置引き継ぎ案も検討したが、今回は見送り

---

## 7. 既知の注意点（更新）

1. CDN依存（Three.js・Google Fonts）→ ローカルサーバー必須（`file://`直接オープン不可）
2. ブラウザキャッシュ → `Ctrl+Shift+R`で強制リロード推奨
3. `stages.json`と`stage-params.json`の手動同期が必要
4. `diff`・`logicGuarantee`の型に注意（前者は英数字キー、後者はboolean必須）
5. `charId`の範囲：`001`〜`009`まで拡張運用中
6. **ファイル再アップロード時の事故に注意**：修正依頼の際、古いローカルファイルをアップロードしてそれをベースに編集すると、過去の修正が消える事故が起きる（`script_editor.html`の「Stellar Delete用」機能、`script09.js`の`nextUrl`で実際に発生）。依頼時は必ず最新版を使うこと
7. **`window.close()`の制限**：URLを直接開いたタブには効かない（ブラウザ仕様）。Electron化後は正常動作見込み。現状はフォールバックの案内画面を実装済み
8. **iPhoneのSafariはページ全体のフルスクリーンAPI非対応**：Android等は動作。iPhoneでは静かに失敗するだけでエラーにはならない
9. **`bg_scroll`の`loop`**：CSSタイル方式ではなく位置折り返し方式。`down`方向は最上部到達で`loop`指定に関わらず停止する仕様
10. **`locked`（ステージロック）パラメータ**：`stages.json`の項目として存在するが、表示・制御ロジックは未実装のまま

---

## 8. 未着手・今後の検討事項

| 項目 | 状況 |
|---|---|
| `novel-game-final`の素材一式（`css/style.css`・`images`・`bgm`・`se`） | 配置待ち |
| `locked`（ステージロック）の実装 | 未着手 |
| `storyStage=9`のクライマックスBGM不具合の調査（`EFE_04_select.mp3`が鳴る件） | 保留中（優先度低） |
| `sessionStorage`によるBGM再生位置引き継ぎ | 見送り中（将来再検討の余地あり） |
| 完全シームレスBGM（iframeシェル構成） | Electron化後に検討 |
| 鐘SE（`EFE_06`〜`08`）の素材準備 | 未準備 |
| **GitHubへの移行** | 次のフェーズ |
| **APK化**（Capacitor/Cordova等を想定） | 目標。配信方式を`https://localhost`相当のスキームにする必要あり、`file://`直読みは非推奨 |
| Steam化（Electron想定） | 将来検討 |
