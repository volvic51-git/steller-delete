# Stellar Delete V2 引き継ぎ書

作成日: 2026-06-30 / 最終更新: 2026-07-04
V1完成後、V2開発を進めるためのハンドオフ文書。

---

## ⚠️ 最初に読む：現在のブランチ状態（2026-07-04）

- **実装は全て `master` に集約済み**。V2エンジン（リプレイ/中断）＋その後のUI大改修
  （MODE SELECT / SIMPLE MODE / STORY再編 / RECORDS / お気に入り / タイムゾーン修正）は
  master にマージ・push済み。旧 `feature/solver-extraction` は master にマージ済み（no-ff）。
- **GitHub Pages は master / (root) から配信**（`volvic51-git.github.io/steller-delete`、push→数分で反映）。
  設定は Settings→Pages「Deploy from a branch = master /(root)」。gh-pagesブランチは無い。
- **設計文書ブランチ `feature/spec-foundation` は未マージのまま**（docs/ はここにしか無い：
  00-Architecture / 10-DataSpec / 20-BoardFormat / V2_GENERATION_ENGINE / 密度CSV）。
  → Board Factory / 生成エンジンの設計を触るときはこのブランチを見る。
- **⚠️ 引っ越し時の注意**：ローカル作業ツリーに**未コミットの変更が残っている場合あり**
  （直近のUI微修正 = index.html / sphere-minesweeper.html）。新チャットの最初に
  `git status` を見て commit + push すること。「Pagesが更新されない」の原因は大抵これかキャッシュ。

> **既知の未処理**
> - `tool/`（単数・既存）と `tools/`（複数）が混在。将来 `tool/` に統一予定。
> - `feature/solver-extraction` に出自不明の `d0a480d「solver.js生成」` コミットあり。
> - spec-foundation側の未push（密度CSV `59c2a28`・タグ `design/data-foundation-v0.9`）。

---

## いま何をしているフェーズか

**V2エンジン（リプレイ/中断）は完成・masterマージ済み。** 以降は「遊び方（モード構成）」のUI大改修フェーズ。
2026-07-03〜04 でタイトル導線を再編：PLAY→MODE SELECT ハブを新設し STORY/SIMPLE/LIMIT を配置。
実機（スマホ/GitHub Pages）で確認しながら細かな表示調整を継続中。

詳細は下記「2026-07-03〜04 実装サマリ」と memory を参照。memory が一次情報：
[[project-mode-select]] / [[project-replay-suspend]] / [[feedback-dev]] / [[feedback-preview-audio]] / [[project-overview]]

---

## 2026-07-03〜04 実装サマリ（memory に詳細。ここは索引）

**モード選択ハブ（[[project-mode-select]]）**
- タイトル：「PLAY」追加。旧「STORY」アコーディオン・「TOUR」（旧SIMPLE）・「AUCTION」は `display:none`。
- PLAY → **MODE SELECT**（上部見出し「PLAY MODE SELECT」、`data/modes.json` 駆動＝ラベル/説明/画像/color/enabled）。
  カード：STORY / SIMPLE / LIMIT(enabled:false=グレーアウト)。表示色は全て青(blue)に統一。ユーザーがJSON編集で変更可。
- **STORY MODE 画面**：旧アコーディオンの EPISODES をリスト表示。キャラ画像 `characters/000〜009.png`
  （=エピソードindex順、EP.0→000）、白字ラベル、行タップで該当 novel へ。`?story=1` で直接オープン。
- **SIMPLE MODE 画面**（旧NORMAL。**内部id/URLは `normal` のまま**、表示名だけ「SIMPLE MODE」）：
  stages.json の stage01-08 をリスト表示（惑星画像/名前/○×○/CELLS/星傷/BEST TIME、未クリア「-」）。
  `?normal=1` で直接オープン。キャラは **011〜020 からランダム**（applyStageParamでページ読込時に確定、
  RETRYは同一、replay/resumeは記録charIdを復元。characters.jsonに011-020のデータ要）。
- フッターは全画面「MODE SELECT / TITLE」で**等幅グリッド統一**（`.screen-footer` を grid-auto-columns:1fr）。
  ステージ/エピソード行**右端の「>」矢印は削除**。
- 戻り導線：novel→固定カルーセルのBACK（ラベルを「EPISODE」に）／プレイ中設定「EPISODE」／クリア画面
  「EPISODE」＝全て `?story=1`（STORY時のみ）。クリア画面のEPISODEボタンはNEXTと同じ**紫**。

**RECORDS（自己ベスト上位10表示）**：SIMPLE各行の🏆→ステージ別TOP10モーダル（順位/タイム/日時、
  top1-3金銀銅、記録なし表示）。ランキングは `stellarDeleteRanking_stage_N`（STORY/TOURと共有）。
  モーダルは z-index=400（オーバーレイ300より上。＝トロフィー押下でモーダルが裏に隠れるバグは修正済み）。

**REPLAY お気に入り（[[project-replay-suspend]]）**：一覧に★トグル＋🗑削除。★は自動プルーニング
  （REPLAY_MAX=20）から**除外して常に保持**、非★のみ最新20件。★を先頭ソート。★/🗑は枠なしアイコン。
  スクロールバーを宇宙ブルー配色に（index.html全体：webkit＋Firefox）。

**日時タイムゾーン修正（[[feedback-dev]]）**：保存はISO(UTC)のまま、表示だけ端末ローカルに整形する原則に統一。
  index.htmlに `fmtLocalDateTime()`。ランキングレコードに `ts`(ISO UTC)追加（旧`date`は後方互換）。

**プレビュー検証の運用（[[feedback-preview-audio]]）**：dev server起動は許可不要、検証後は必ず音停止＋停止。

**別トラック（未着手・保留中）:** 盤面密度の実測（etc/V2_board_density_data.csv）→ BoardFormat v1.0凍結
→ Board Factory 本体。UI改修が一段落したら戻る（spec-foundationブランチ）。

---

## ✅ 実機フィードバック3件（2026-07-02）＝完了・masterマージ済み（履歴として保存）

GitHub Pages 実機テストで確認された3件。すべて実装・実機確認・マージ済み。以下は経緯の記録。
（リプレイstep UI／消滅音の多重再生ちらつき等の詳細は memory [[project-replay-suspend]] が一次情報）

1. **resume で背景が出ない** → ローカルでは再現せず（コードは正しく動作）
   - `?stage=1`で開始→suspend→`index.html`のRESUMEボタン→`?boot=resume`の完全な実ナビゲーションで
     再テストしたが、`canvas-container.style.backgroundImage`は正しく復元された。
   - 結論：`saveSuspend`/`resumeSuspend`/`applyCanvasBackground`のロジック自体に問題は無い。
     実機で見えた不具合は、**`meta.bg`フィールド追加（コミット35b99a1）より前に保存された
     古いsuspendデータ**（`meta.bg`が`undefined`）が原因だった可能性が高い。
   - **次アクション**: 実機で再度 中断→即再開 のフローを新規に試して確認。まだ直らなければ再調査。

2. **resume クリア画面に「TITLE」ボタンが無い** → 修正済み（実機フィードバックで3回再修正）
   - `updateRescueButtons()`の最終形（実機確認込みで確定）：
     - STORY（`?stage=N&mode=story` **または** STORYを中断→resume）：SAVE REPLAY + NEXT + TITLE
     - それ以外全部（SIMPLE通常/resume・デバッグ・SIMPLEを中断→resume）：SAVE REPLAY + RETRY + STAGE
   - `?boot=resume`はURLに`mode=story`を持てない（stage/modeパラメータ自体が無い）ため、
     resumeがSTORYだったかどうかはURLからは判定不可。**suspendデータに`meta.isStoryMode`と
     `meta.novelAfterClear`を追加**し、`resumeSuspend()`が`window._resumeStoryMode`
     （新規グローバル）と`window._novelAfterClear`を復元。`updateRescueButtons()`は
     `isStoryMode = (URLのmode=story) || window._resumeStoryMode`で判定。
     `window._resumeStoryMode`は`restartGame()`でfalseにリセット（RETRY等で次のゲームへ持ち越さない）。
   - 経緯：一次修正でresume枝にTITLEを追加→実機で「STAGEの方が自然」とフィードバック→
     resume枝をRETRY+STAGEに変更→「通常SIMPLEクリアも同じに」でSIMPLE枝も統一→
     「STORY＋resumeはNEXT+TITLEにしたい」で上記のフラグ復元方式を追加。

3. **replay のカメラ追従が弱い → 1手ずつ進む/戻る UI** → 実装済み（さらに予告→確定の2段階に細分化）
   - `startReplay`のsetTimeout自動再生を廃止し、`replaySubStepTo(pos)`ベースの手動ステップに変更。
   - **1手 = 2サブステップ**：奇数pos=次の一手を予告（カメラ移動＋掘削は緑/旗立ては赤でハイライト、
     盤面はまだ変えない）／偶数pos=それまでの手を確定適用（実際にdigCell/flagCellを呼ぶ。カメラは
     直前の予告で既に向いているので動かさない）。`pos`の範囲は`0..actions.length*2`。
   - 新規/変更関数：`replaySubStepTo(pos)`（身元から毎回全再構築→committedCount=floor(pos/2)手ぶん
     即時再適用→奇数posならstartAutoRotate+showReplayPreviewHighlight）、`showReplayPreviewHighlight(cell,colorHex)`
     （cell.mesh.material.emissiveを静的に緑/赤へ。パルス無し）、`replayStepNext/Prev`（pos±1）、
     `updateReplayStepUI()`（ラベルは`確定数 / 総手数`＋予告中は「(掘削予告)」「(旗立て予告)」を併記、
     ラベル文字色も緑/赤に）。
   - `_replayMode`はセッション中ずっとtrueを維持する方式（旧実装は各アクション後にfalseへ戻していたため、
     ステップUIで終盤にジャンプするとdigCell内の非同期checkWin/triggerGameOverSequence〈300-400ms遅延〉が
     `_replayMode=false`後に発火し、自動保存ガードが効かず誤ってsaveReplayされる恐れがあった）。
   - UI：`#replay-controls`（画面下部中央固定、«前へ / 次へ / カウンタ）。`_isReplaySession`中のみ表示、
     `stopReplay()`（=`restartGame()`経由）で非表示に戻る。
   - **追加修正（実機フィードバック）**：クリックのたびに「消滅済みのセルが復活してまた消滅する」
     ちらつきが発生。原因は`replaySubStepTo`が毎回盤面を全部作り直す設計（過去の手をdigCell/flagCellで
     再実行）のため、0セル消滅演出の遅延（scheduleVanishの80ms＋千鳥ずらしi*8ms、地雷除去/爆発後の
     カスケード確定の400ms）がある間、本来もう消えているはずのセルが一瞬「開いたまま」でレンダリングされていた。
     修正：`replayTimeout(fn,delay)`ヘルパーを追加し、`_replayInstant`フラグがtrueの間は`setTimeout`を
     使わず即時実行するように、digCell/openCell経由のscheduleVanish/removeMine/flagCellの該当setTimeoutを
     置換。`replaySubStepTo`の確定済み手再適用ループ（と`resumeSuspend`の即時再適用ループ）を
     `_replayInstant=true`で囲むことで、盤面再構築が完全に同期的に最終状態まで確定するようにした。
   - **さらに追加修正（1回目では直らず）**：本当の原因は「消滅アニメーションそのものが毎回再生される」こと。
     `replaySubStepTo`はクリックのたびに`initBoard()`で全セルのメッシュを作り直すため、消滅済みセルも
     `triggerVanishAnimation`/`triggerRemovalAnimation`で新メッシュがscene直下へ再ペアレントされフェードアウト
     演出を再生していた（＝「復活→再度消滅」ちらつき）。修正：`removeMeshInstant(cell)`ヘルパーを追加し、
     `triggerVanishAnimation`/`triggerRemovalAnimation`の冒頭で`_replayInstant`ならメッシュを即boardGroup/scene
     から除去・null化して`return`（演出・パーティクルなし）。
   - **さらに追加修正（今度は演出が消えすぎた）**：修正2は再構築ループ全体を`_replayInstant=true`で囲んで
     いたため「いま確定した一手」の消滅演出まで消えていた。要件は「過去の手の再構築は即時／いま確定した
     一手だけは演出あり」。修正：`replaySubStepTo`の確定フェーズ（偶数pos）でのみ、ループ最後の一手
     （`i===committedCount-1`）だけ`_replayInstant=false`にして演出付きで適用（`animateLast`フラグ）。
     予告フェーズ（奇数pos）は全手を即時（既に見た手を再演出しない）。演出付き一手が張るsetTimeoutは
     `_replayAnimTimers`に追跡し、次ステップ再構築の冒頭で全clear（rapid Next/Prevで演出が重ならない）。
     検証：確定ステップで当該手の消滅セルのみanimating>0（過去の手はscene無スパイクで即時）、プレビュー
     ステップはanimating最大0、連打ジャンプでも最終removed一致・残留なし。

---

## 今セッションで確定した設計（要点）

詳細は各文書。ここは索引。

### データアーキテクチャ憲法（`docs/00-Architecture.md`）七原則
1. Data Responsibility（一データ一責務）
2. Identity（UUIDが真のキー、displayIdは表示専用・認定時採番）
3. Reference（所有せず参照）
4. Data Separation（仕様の能力と個体の状態を混ぜない）
5. Traceability（出自までたどれる。UUIDの目的は追跡性）
6. Immutability（Boardは不変・事実／評価は外付け）
7. Evolution（既存データを壊さない）
+ Non Goals（通信/UI/ゲームルール/ソルバー実装は規定しない）

### データ仕様
- `docs/10-StellerDataSpec.md`：共通型（Version / Identity / Reference / Provenance）。
  Board/Verification/Save/Replay/Job/Ranking/RuleSet は名前のみ予約
- `docs/20-BoardFormat.md`（v0.9）：Board は事実のみ。`identity/board/meta` で構成。
  verification も予約フィールドも持たない。`board.hash` は正規形のSHA-256（完全一致のみ）

### 開始モデル・生成エンジン入替（`etc/V2_GENERATION_ENGINE.md`）
- **ゴール：Factory盤面（事前生成・検証済み）で遊ぶ（段階B）まで見据える**
- **開始は single startCell + Judge**：盤面は事前生成・不変、開始セルは正確に1個。
  ユーザーはどこを押してもよいが、Judgeが唯一のstartCellを開く（クリックは開始合図）
  ※ Judge は Factory盤面の初手を開く機能。既存のヒント機能 ORACLE とは別物。
- **なぜ「好きな場所で初手安全」を捨てるか**：不変盤面では初手安全のための地雷移動が
  できない（hash/verification が無効化＝Immutability違反）
- **生成器を js/board-gen.js に一本化**（ゲーム=Hunter=Factory のパリティをテストで固定）

### 生成方式の振り分け（Border）
- 振り分けは **「保証あり」経路の中だけ**（保証なしは常にリアルタイムでOK）
- 判断軸は **密度**（＝リトライ上限内・許容時間内に保証盤面が出せるか）
- **Factoryに振られた瞬間、開始が Judge 方式に変わる**（リアルタイムは従来の初手安全）

### 実測でわかったこと（要・追試）
- 72×144：密度 **18%→成功率約10%**（リアルタイム保証で可）、**20%→約0.3%**（Factory必須）
- **保証なしのリアルタイム生成コストは誤差**（72×144でも生成+近傍計算 平均5.25ms、1フレーム内）
- 重いのは「保証（isSolvable）を何百回も回す」部分だけ
- データ収集用テンプレ：`etc/V2_board_density_data.csv`（列説明は同名 `_README.md`）

---

## 実装ロードマップ（`etc/V2_GENERATION_ENGINE.md §3` に詳細）

```
Phase 1  js/board-gen.js 一本化（決定論化 / seed記録 / genVersion導入 / パリティテスト）
Phase 2  Judge 開始モデル（単一startCellを開く演出）
Phase 3  Factory 盤面の Board JSON 読込（＝ゴール。既存生成はフォールバック）
Phase 4  リプレイ / 中断（seed+genVersion+params+操作ログ。startが1個なので再現がシンプル）
```

### 実装着手前に詰める未決（`V2_GENERATION_ENGINE.md §5`）
- `js/board-gen.js` の API（引数・返り値）
- `placeMines` 改修の具体範囲（呼び出し3箇所：初手/保証リトライ/デバッグ）
- Judge 開始演出の具体（visual/SE/物語フック）
- Board JSON の供給方法（data/boards同梱 / seedから都度生成 / Hunter由来の採用フロー）
- `asyncEnsureSolvable` の300回上限を密度実測に合わせて見直すか
- `verification.level=2` の厳密な合格定義（solver実測とセットで確定）

---

## すでに出来ている実装物（feature/solver-extraction）

- **`js/solver.js`**：`runSolver`（制約伝播+CSP）と `isSolvable`（完全シミュレーション）を
  純関数化。隣接ルールは `wrapCols/wrapRows` 引数。`computeNeighborMines` ユーティリティ付き。
  ゲーム側 `runSolver()/isSolvable()` は薄いアダプタ（`cellAt:(r,c)=>board[r][c]`）に変更済み
- **`tools/board-benchmark.html`**：seed再現つき実測ベンチ。盤面サイズ/密度別の保証成功率・
  solver時間を計測、CSV/JSON出力、サンプルBoard JSON（sha256付き）出力
- **`dist/board-hunter/`**：公開用（itch別公開）。全ユーザー共通キャンペーンで探索し、
  **seedのみ返す**（開発者が再生成して再検証 = trust but verify）。640×480に最適化済み

---

## V1 状態（完成済み・itch.io公開済み）

- ステージ1〜9（9はループ）全クリアタイム記録・ランキング
- HELP / CONFIG メニュー、タブ二重起動防止（`js/tab-guard.js`）、STORYアコーディオン、
  DELETEボタン（長押し800msでランキング初期化）
- **itch.io zip は必ず `System.IO.Compression` で作成**（`Compress-Archive` はパス区切り `\` で全404）

### V1盤面は seed 再現できない（重要）
- 現状 `placeMines` は `Math.random()` 直使用・seedなし。プレイ盤面は再現不可
- 再現性は新ツール（mulberry32）側にのみ存在。ゲーム側の決定論化が Phase 1

---

## Capacitor / Android APK 化（V2後）

分析：[`etc/CAPACITOR_ANALYSIS.md`](CAPACITOR_ANALYSIS.md)
主要課題：SPA化 / Three.js・Google Fonts のローカル同梱 / Androidバックボタン
事前準備：Node.js, Android Studio

---

## 参考：V1の重要な実装メモ

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

---

## 次セッション（引っ越し先）の入口

0. **まず `git status`**：未コミットの index.html / sphere-minesweeper.html があれば commit + push。
   （直近作業＝クリア画面EPISODEボタンの紫化・novel後カルーセルBACKの「EPISODE」ラベル化 等）。
   「Pagesが更新されない」の原因は大抵これ（未push）かCDN/ブラウザキャッシュ。
1. 作業対象は基本 **master 上の index.html / sphere-minesweeper.html / data/*.json**。
   モード/画面まわりは memory [[project-mode-select]]、リプレイ/中断/お気に入りは [[project-replay-suspend]] が一次情報。
2. **検証運用**：dev server（`.claude/launch.json` の `static`）は許可不要で起動可。検証後は
   **必ず音を止める＋サーバー停止**（[[feedback-preview-audio]]）。index.htmlはパーティクル常時描画で
   `preview_screenshot` がtimeoutしやすい→ `preview_eval`＋`btn.click()` 合成クリックで検証（preview_clickは
   タイトル入場アニメと干渉して不発のことがある）。
3. **未実装/保留（モード系）**：LIMIT MODE（modes.jsonでenabled:false、画面はSIMPLE同型でグレーアウト予定）。
   周回モードもここに乗せる想定。index.htmlが複雑化したら story-select等への分離を検討（[[project-overview]]）。

**別トラック（生成エンジン。UI改修が一段落したら / spec-foundationブランチ）:**
1. 盤面密度データ集計（`etc/V2_board_density_data.csv`）→ しきい値文章化
2. `docs/20-BoardFormat.md` を v1.0 に凍結 → Board Factory 本体（Judge開始モデル / Board JSON読込）

**整理系（いつでも）:** `tool/`/`tools/` 統一、`docs/10-StellerDataSpec.md`のboardHash記述をv1.0へ整合、
V2_HANDOFF.md のルート重複解消（`V2_HANDOFF.md` と `etc/V2_HANDOFF.md` の2つが存在）、
spec-foundation側の未push（密度CSV・ORACLE→Judge・タグ）。
