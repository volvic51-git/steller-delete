# Stellar Delete V2 引き継ぎ書

作成日: 2026-06-30 / 最終更新: 2026-07-09
V1完成後、V2開発を進めるためのハンドオフ文書。

---

## ⚠️ 最初に読む：現在のブランチ状態（2026-07-09）

- **`feature/factory-board` は `master` にマージ済み・push済み**（2026-07-09、no-ff、
  コンフリクトなし）。GitHub Pages（master/(root)配信）にも反映済み。
  作業ブランチは今後 `master` から都度切る運用でよい（`feature/factory-board` は役目を終えたので
  削除しても問題ない想定。念のためユーザー判断）。
- 直近まとまった変更（Phase 3 Factory盤面〜stageEX〜盤面2色化）は全て
  **§「2026-07-09 完了した作業」**（下記）参照。
- **git運用**：commit / push はユーザーが行う。**マージはClaudeが実行してよい**（2026-07-09に分担確定。
  ただしマージ前にワーキングツリーがクリーンであることを確認する）。push後の反映はユーザー確認。
- **GitHub Pages は master / (root) から配信**（`volvic51-git.github.io/steller-delete`、push→数分で反映）。
  設定は Settings→Pages「Deploy from a branch = master /(root)」。gh-pagesブランチは無い。
- **設計文書ブランチ `feature/spec-foundation` は未マージのまま**（docs/ はここにしか無い：
  00-Architecture / 10-DataSpec / 20-BoardFormat / V2_GENERATION_ENGINE / 密度CSV）。
  → Board Factory / 生成エンジンの設計を触るときはこのブランチを見る。

> **既知の未処理**
> - `tool/`（単数・既存）と `tools/`（複数）が混在。将来 `tool/` に統一予定。
> - `feature/solver-extraction` に出自不明の `d0a480d「solver.js生成」` コミットあり。
> - spec-foundation側の未push（密度CSV `59c2a28`・タグ `design/data-foundation-v0.9`）。
> - `tool/boadHunter/`（typo）は現状維持でよいとユーザー確認済み（2026-07-09、`tool/`直下からの
>   移動・改名は不要という判断）。

---

## ✅ stageEX2（144×72・地雷率20%）実装完了（2026-07-10）

- `data/board/72x144_20.json`（seed 108件、Board Hunterで収集済み）を使い、stageEXと同じ手順で
  id:11「stageEX2」（表示名「EXTRA STAGE II」/リスト表記「EX2」）をSIMPLE MODE最後尾に実装済み。
- 変更箇所：`data/stages.json`（id:11追加）／`data/stage-params.json`（id:11、
  `boardSource: "data/board/72x144_20.json"`, `diff:"ex2"`, mines:2074）／
  `sphere-minesweeper.html`（`DIFF_PRESETS.ex2`追加、キャラ固定除外条件にid:11を追加）／
  `index.html`（`renderNormalList`フィルタと`noStr`ラベルにid:11対応）。
- **charId/BGM/背景は暫定でstageEXと同一値を流用**（charId:"010", bgm:"SND_07_simpleEX.mp3",
  background:"img_bg02.jpg"）。ユーザーが後日`data/stage-params.json`の該当フィールドを
  書き換えるだけで反映される（JSON設定のみで完結、コード変更不要）。stage画像も暫定で
  `st10.png`を流用（`st11.png`未作成のため）。
- 動作確認済み（dev server）：SIMPLE MODEリスト最後尾に「STAGE EX2」表示、
  `?stage=11&mode=normal`で盤面144×72・mines=2074・`_seedPoolMode=true`・
  BGM/charId/palette全て意図通りに読み込み、盤面描画（黄/紫2色）も正常。
- **今回の実装で判明した重要な罠（stageEX1の実装経験から。stageEX2でも同様に適用）**：
  - `data/board/*.json`は**seedのみ**（mines/hash無し）。ゲーム側で`js/board-gen.js`の
    `generateMineSet`をその場で呼んで再生成する設計（`?boot=factory`のhash検証パイプラインとは別経路）。
  - `getCellPaletteIndex(cell)`の東西分割は**列の中央付近の帯を西、両端の帯を東**にする必要がある
    （円柱ラップなので単純に`col<COLS/2`だと前後半球に分かれてしまい、初期カメラでは片方しか
    画面に見えない。詳細は`sphere-minesweeper.html`のコメント参照）。
  - 2色パレットのステージは`getNumberColor`が常に鮮やかな配色になるよう分岐が必要
    （背景の明度で自動切替すると東西で数字の見た目が揃わない）。

---

## いま何をしているフェーズか

**Phase 3 Factory盤面（stageEX）の実装・merge・バグ修正まで完了（2026-07-09）。
次はstageEX2（144×72/20%）の準備待ち（seed 100件到達待ち）。**

### 2026-07-08 完了した作業（詳細は memory [[project-factory-board]] / [[project-perf-zoomout]]）

**① Phase 3 Factory盤面（計画書 §7.5 の Step 1〜4＋テスト。Step 5=リプレイ整合は予定通り対象外）**
- `js/board-gen.js`：`canonicalBoard()` / `hashBoard()`（SHA-256正規形。キー順
  rows,cols,mineCount,wrap,startCell,mines 固定・**変更禁止**）を追加。Factory出力と
  ゲーム側再検証で同一コードを共用（Q4確定案どおり集約）。
- `tool/board-factory.html`：生成・hashを board-gen.js に一本化（ローカルの
  mulberry32/generateMines/sha256 を削除＝パリティが構造的に保証される）。seed行に
  **「▶ プレイ」ボタン**（Board JSON を `localStorage['steller_factory_board']` に書いて
  `?boot=factory` を新規タブで開く）。genVersion不一致時はピルに赤警告。
- `sphere-minesweeper.html`：
  - `?boot=factory` 起動枝（`_charDataReady.finally` 内）。**mineCount は
    `window._stageMines` 経由で渡す**（restartGame が密度プルダウンから再計算して
    直接代入を上書きする罠がある）。
  - `verifyFactoryBoard()`：genVersion＋hash 再検証。NGは console 警告して通常生成へ
    自動フォールバック（Q5）。検証完了前クリックは `_factoryVerified` ガードで無視。
  - **Judge開始モデル**：idle枝の先頭で分岐。クリック位置は開始合図として無視し、
    `judgeReveal()`→ startCell を dig。**演出の詳細は2026-07-09に大幅改修済み
    （下記④参照。650ms/シアン/bell1は初版の値で現在は変更済み）**。
    **`applyBoardFromFactory` はクリック時に毎回呼ぶ**（RETRYのinitBoardで地雷が消えるため）。
  - 検証済み（dev server）：72×144/1866地雷 seed 3297795212 で Judge起動・RETRY・
    分母8502・hash/genVersion改竄フォールバック すべてOK。

**② 描画性能改善（ズームアウトが重い問題。A/B案実装・C案未着手）**
- 原因: 個別オブジェクト約43,000個による draw call 爆発（ズームアウトで全てが視錐台に入る）。
- **A案**: cage wire 22,112本の個別Line → 不透明度クラス別の LineSegments **5本**に統合。
  裏半球は `cageOccluder`（r=1.5球・colorWrite:false・深度のみ書く）で隠す。
  sphereWire(1.55) は depthWrite:false 必須（cage線が交差部で点欠けする）。
  旧実装のdispose漏れ（リスタート毎に22kオブジェクトVRAMリーク）も修正。
- **B案**: セル枠線 10,368本の子Line → 頂点カラー付き LineSegments **1本**に統合。
  API: `buildCellBorderSegs()`（initBoard末尾）/ `setCellBorderColor(cell,hex)`（同色なら
  再転送しない）/ `hideCellBorder(cell)`（消滅演出開始時に8頂点を原点へ退化）/
  `writeCellBorderGeometry(cell)`（周回出現アニメ完了時）。cageOccluder は renderOrder=0.5
  に移動して cage と枠線の両方を担当。
- **実測**: zoom-out **21,386→5,193 draw call・135→45.6ms**、zoom-in 736→205call・31.8→16.8ms。
  Factory盤面＋通常stage=1 の両経路で描画検証済み。
- **C案（未着手・大改修）**: セル本体10,368 Mesh の InstancedMesh 化＋数字テクスチャアトラス＋
  解析的ピッキング。やる場合は別途計画書を作る（updateCellVisual/演出/raycast全域に影響）。
  効果は数十call・リプレイ全再構築の激速化（REPLAY B案が不要になる可能性）。

**③ 仕様確認（バグではないと確定）**
- 「未開封マスに隣接して数字を挟まず消滅している穴」は**旗で除去した地雷の跡**（V1からの仕様）。
  消滅ロジックの不変条件（消滅する非地雷セルの隣は必ず開封済み）は Factory盤面の正解データで
  機械検証済み・違反0件。気になるなら「除去済みマーカーを残す」等の設計変更は別途。

### 2026-07-09 完了した作業（stageEX本実装＋バグ修正＋盤面2色化）

**④ stageEXをSIMPLE MODEに本実装（内部id:10・表示名「stageEX」/「EXTRA STAGE」）**
- `data/stages.json` / `data/stage-params.json`にid:10追加。`DIFF_PRESETS.ex1`（144×72）。
  `boardSource: "data/board/72x144_18.json"`を見て、`?boot=factory`の localStorage/hash検証
  パイプラインとは**別の新しい起動経路**（seedプール方式）を実装：
  盤面ファイルはseedのみ（mines/hash無し）→ 起動時にランダムに1つseedを選び、
  `js/board-gen.js`の`generateMineSet`をその場で呼んで再生成（自前データなのでhash検証は不要）。
  `window._seedPoolMode`/`window._seedPoolBoard`が目印。
- `index.html`の`renderNormalList`フィルタに`id===10`を追加（stage9のループ専用枠は従来通り除外）。
- SIMPLE MODEのランダムキャラプールを**011〜020（10体固定）→101〜199（実在するIDから動的選出）**に
  拡張（今後のキャラ追加を見込んだ変更）。stageEXのみcharId固定（"010"）の例外。
- `tool/board-merge.html`新規作成：`tool/hunter/`の複数hunterログをcampaignIdごとに集約し、
  seed重複排除＋reporter対応付けをして`data/board/*.json`（seedのみ形式）を出力するツール。

**⑤ バグ修正4件（実プレイで発覆）**
1. **ドラッグ後の誤クリック**：マウスの`dragMoved`判定が「直前イベントとの差分」で閾値判定していたため、
   ゆっくり大きくドラッグすると誤ってクリック扱いされる不具合。`mousedown`位置からの**累積距離**で
   判定するよう修正（タッチ側は元々累積距離で正しかった）。
2. **resume後、キャラの透過が効かない**：`resumeSuspend()`が`calcTotalNonMineCells()`を呼んでおらず
   `totalNonMineCells`が0のままになり、露出率が即100%に張り付いていた。呼び出しを追加。
3. **resume後、BGMがデフォルトに戻る**：`?boot=resume`は`applyStageParam()`を通らないためBGM適用が
   効かなかった。`window._stageBgmFile`を追跡し、suspendの`meta.bgmFile`に保存・復元するよう修正。
4. **Judge演出でカメラが極付近で止まる**：クリック位置に正確に合わせようとX/Y両軸を解く方式にしたところ、
   既存の`rotation.x`クランプ（±0.45π）と衝突して見た目が固まる不具合。**Y軸（左右）のみ動かし、
   X軸（上下の傾き）は現在の値のまま変更しない**方式に変更して解決（`startAutoRotateYOnly`）。

**⑥ Judge演出の現行仕様（650ms/シアン/bell1から変更済み）**
- カメラ移動＋ズームイン：`JUDGE_MOVE_MS=500ms`、`JUDGE_ZOOM_DIST=2.2`
  （144×72だと4.0ではセルが豆粒サイズで見えなかったため大きく寄せる値に変更）。
- ハイライト：`JUDGE_COLOR=0x00ffcc`（シアン系、変更なし）、`JUDGE_REVEAL_MS=1000`（1秒、旧650ms）。
- SE：`playSE('charge')`（`EFE_10_charge.mp3`）。旧`bell1`は`triggerGameOverSequence`の
  ゲームオーバー演出と同じ音で紛らわしかったため専用音に変更。

**⑦ 盤面2色化（東西パレット。計画書 `etc/V2_BOARD_COLOR_PLAN.md`）**
- `window._boardTheme`（単色hex）→ `window._boardPalette`（hex配列）に全面移行。
  `getCellPaletteIndex(cell)`が列位置からパレットindexを返す（将来Factory盤面の
  `cellPaletteMap`と結合する拡張ポイント。呼び出し側は無改修で差し替え可能な設計）。
  `getNumberColor(idx, paletteIndex)`のシグネチャに変更（hex解決を関数内に閉じ込め）。
- **円柱ラップの罠**：単純に`col<COLS/2`で東西を分けると、初期カメラ（無回転）では
  **前後半球の分割**になり片方しか画面に映らない。**列の中央付近の帯を西、両端の帯を東**に
  することで、初期カメラで見て正しく左右に分かれるようにした。
- 2色パレットのステージは`getNumberColor`が常に鮮やかな配色（`NUMBER_COLORS`）になるよう分岐
  （単色ステージは従来通り背景明度で自動切替、2色ステージだけ例外）。
- stageEXの配色：`boardPalette: ["#cccc00", "#440088"]`（西=黄、東=紫）。
- `data/stage-params.json`全10ステージを`boardColor`→`boardPalette`（配列）に移行
  （既存9ステージは単色のまま1要素配列で後方互換）。`etc/stellar-delete-stage-params-editor.html`
  も西/東2色対応に更新。中断・リプレイの保存データも`boardPalette`化（旧`boardTheme`形式を
  読み込み時にフォールバック許容）。

**⑧ merge実施**：`feature/factory-board` → `master`（no-ff・コンフリクトなし・2026-07-09）。
push済み。

### 2026-07-05 完了した作業
- **リプレイUI非表示化**：REPLAYボタン（タイトル）・SAVE REPLAYボタン（クリア/GO画面）・
  REPLAY AUTO SAVEスイッチ（設定メニュー）を非表示。リプレイ機能は性能改善中のため一時無効。
  Factory完成後に再設計予定。
- **MODE SELECT「>」削除**：各パネル右の矢印（&#8250;）を削除。
- **Board Hunter改良**（`tool/boadHunter/index.html`）：メール送信ボタン・リセットボタン・
  発見者名フォーム・22%キャンペーン追加。
- **Board Factory新規作成**（`tool/board-factory.html`）：boardhunter JSON → Board JSON生成ツール。
  mulberry32+SHA-256+solver再検証。
- **Phase 3計画書作成**（`etc/V2_PHASE3_FACTORY_PLAN.md`）：Step 1〜6の詳細設計、確定事項整理済み。
  Step 5（リプレイ整合）はPhase 3対象外と明記。
- **その他**：index.html バージョン表示V1.5・蛍光青・右寄せ。tool/とtools/を`tool/`に統合。
  設定メニューリデザイン。ミュートボタン1.5倍。itch.io ZIP作成（stellar-delete-v1.5.zip）。
  REPLAY B案凍結メモ作成（`etc/REPLAY_B_PLAN_MEMO.md`）。

詳細は memory を参照：
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
Phase 1  js/board-gen.js 一本化（決定論化 / seed記録 / genVersion導入）        ✅ 完了
Phase 2  Judge 開始モデル（単一startCellを開く演出）                          ✅ 完了（2026-07-08）
Phase 3  Factory 盤面の Board JSON 読込（既存生成はフォールバック）           ✅ 完了（2026-07-08）
Phase 4  リプレイ / 中断の再設計（seed+genVersion+params+操作ログ。start1個で再現シンプル）← 次
※ パリティ自動テスト（Hunter/Factory/game の generateMineSet 一致）は未着手のまま
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

## 次セッションの入口（2026-07-09 更新）

0. **まず `git status`**：`master`にマージ・push済みのはず。念のため確認（未コミット変更が
   残っていないか）。

1. **stageEX2（144×72/20%）の進捗確認**：Board Hunterでのseed収集が進んでいるか確認。
   **100件たまっていれば**、上記「🎯 次に来る作業」節の手順で実装に着手。
   たまっていなければ他の作業を進める。

2. **次の開発候補（優先度はユーザー判断）**：
   - **stageEX2実装**（seed 100件到達後。上記節参照）。
   - **C案**（セルInstancedMesh化・大改修）：ズームアウトを60fpsへ。計画書を作ってから。
     リプレイ全再構築も激速化するので Phase 4 の前にやる価値あり（[[project-perf-zoomout]]）。
   - **Phase 4**（リプレイ/中断の再設計・REPLAY UI復活）：Factory盤面の startCell を
     record の start に載せる整合を含む（計画書 §5 Q3 の整合メモ参照）。
   - **盤面お絵描きツール**（`etc/V2_BOARD_COLOR_PLAN.md` §2.3の将来拡張。セルごとの
     `cellPaletteMap`で自由に色を塗れるようにする構想。今の東西2色はこの布石）。
   - **Hunter/Factory/game のパリティ自動テスト**（まだ未着手）。
   - LIMIT MODE（modes.json enabled:false のまま保留中）。

3. **検証の約束事**：dev server 経由（tool/ とルートの localStorage 共有に必須）。
   起動は許可不要、検証後は必ず音を止める＋サーバー停止（[[feedback-preview-audio]]）。
   ⚠️ プレビューのブラウザセッションでHTTPキャッシュが古いまま残ることがある
   （`data/stage-params.json`等の更新が反映されず「id not found」警告が出る）。
   `cache:'no-store'`でのfetchや、URLに`?cb=<timestamp>`を付けての再ナビゲーションで回避可能。

**整理系（いつでも）:** `docs/10-StellerDataSpec.md`のboardHash記述をv1.0へ整合、
V2_HANDOFF.md のルート重複解消（`V2_HANDOFF.md` と `etc/V2_HANDOFF.md` の2つが存在）、
spec-foundation側の未push（密度CSV・ORACLE→Judge・タグ）。
