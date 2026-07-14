# STORY MODE 2 ステージ個別設定 — 作業指示書（Sonnet 5向け）

作成: 2026-07-14 / ブランチ: `feature/story2-novel` / 前任: Fable 5セッション

## 1. 目的と現在地

STORY MODE 2（stage id:22〜30）の各ステージを、**ユーザーの指示で1ステージずつ**設定していく。
ユーザーが「stageN ＋ 仕様リスト」の形式で指示を出すので、それを反映→dev serverで検証→報告する。
ステージ番号とidの対応: **S2のステージN = id (N+21)**（例: ステージ7 = id:28）。

### 設定済み（このセッションで完了）

| S2ステージ | id | 盤面 | 地雷 | 色 | 制限時間 | 特殊ルール |
|---|---|---|---|---|---|---|
| 2 | 23 | s1 (16×8) | 12 | 濃ピンク #dd0066 | 90秒 | 旗禁止(noflag) |
| 3 | 24 | s3 (32×14) | 90 | 薄グレー #cccccc | 180秒 | ORACLE 0回(maxHints:0) |
| 4 | 25 | x1 (12×7) | 10 | 緑グラデ5色 | 60秒 | 周回5回(loopColors) |
| 5 | 26 | m3 (56×26) | 300 | 黄 #cccc00 | 400秒 | 中断不可(suspendDisabled) |
| 6 | 27 | h1 (64×30) | 461 | 薄紫 #9966cc | 660秒 | Factory盤面(boardSource: data/board/30x64_24.json)、告知文言「認証済み盤面」 |
| 7 | 28 | h2 (72×34) | 563 | 黒 #000000 | 900秒 | Factory盤面(boardSource: data/board/34x72_23.json)、告知文言「認証済み盤面」 |
| 8 | 29 | x1 (12×7) | 10 | 濃オレンジ #cc5500 | 10秒 | 特になし（超短時間チャレンジ） |
| 9 | 30 | ex2 (144×72) | 2074 | 薄黄#ffff99+薄青#99ccff | 制限時間なし | Factory盤面(boardSource: data/board/72x144_20.json、id11と同一盤面を色違いで流用)、進捗80%でBGM切替(bgmSwitch) |
| 1 | 22 | ex2 (144×72) | 2074 | 薄黄#ffff99+薄青#99ccff | 60秒 | **負けイベント**(loseEvent:true)。操作完全不可・時間切れで「無理げー」カットイン→自動でnovel12.htmlへ遷移 |

### ステージ1〜9、全て設定完了（2026-07-14）

全ステージ共通: **背景とBGMは「後で設定」**と言われている（bgm:""/background:"img_bg01.jpg"のまま触らない）。
「認証済み盤面」告知文言はstage6/7で共通化済み（今後のFactory盤面ステージも特に指示が無ければ踏襲）。

## 8. 「負けイベント」ステージの実装（stage1/id22、新機能）

`loseEvent:true` を立てると以下が有効になる（sphere-minesweeper.html）:
- **操作完全ロック**: `digCell`/`flagCell`/`handleCellAction`の先頭で`window._stageLoseEvent`ガード。
  加えて`applyLoseEventLock()`（新規、`_setGameIconsBlocked`の負けイベント版）がORACLE/FOCUS/GUARD/
  JUDGE/掘削旗切替/**CONFIG(設定)**/**HELP**を`pointerEvents:none`+`opacity:0.25`でロック
  （**audio-btn(ミュート)のみ除外**）。`restartGame()`内の`restoreFloatButtons()`が一部を解除して
  しまうため、その直後に`applyLoseEventLock()`を再度呼んで打ち消す必要があった（RETRY含め毎回発生）
- **自動タイマー開始**: `_cutinStageStart()`のイントロカットイン（stage_start）完了を待ってから
  `_startLoseEventCountdown()`（新規）で`gameState='playing'; startTimer();`のみ実行。
  盤面は一切openしない（クリック起点の`handleCellAction`の'idle'分岐を経由しない）
- **タイムアップ時の分岐**: `triggerGameOverSequence()`の先頭で`window._stageLoseEvent`なら
  `triggerLoseEventEnding()`（新規）に分岐し、通常のGAME OVERダイアログ（鐘演出+#message）を
  スキップ。`cutinNotify('stage_over')`で新規カットインイベントを発火→完了後
  `window.location.href = window._novelAfterClear`で自動遷移
- **新トリガー種別`stage_over`**: `js/cutin-dialogue.js`の`_match()`は元々未知typeを型一致のみで
  許可するフォールバックがあるため追加コード不要。`_fire()`の`clearPending()`特例に
  `stage_clear`と並べて追加のみ
- 回帰確認済み：`loseEvent`未指定の通常ステージ（stage23）は初手クリックで従来通り開始することを確認

## 2. 1ステージあたりの標準ワークフロー

1. **矛盾チェック**: 指示内で盤面設定とカットイン文言の数値が食い違ったら、実装前にAskUserQuestionで確認する
   （実例: stage5で「制限時間60秒」と「カットイン: 制限時間：400秒」が矛盾 → 確認したら400秒が正）
2. **data/stage-params.json** の該当idを編集（実効値。下記§3のフィールド一覧参照）
3. **data/stages.json** の同idの `grid_col`/`grid_row`/`mines` を同期
   （こちらは**ステージ選択カードの表示に実際に使われる**。stage-params側のgrid_*/totalは参考値）
4. **data/cutin/stageNN.json** を作成/編集（§4の形式）。stage-params側に `"cutin": "stageNN"` を追加
5. **検証**: `preview_start {name:"stellar-delete"}` → `sphere-minesweeper.html?stage=NN&mode=story2` を開き、
   `javascript_tool` で実効値を確認（COLS/ROWS/_stageMines/_boardPalette/timeLimitMode/_customTimeLimit/
   gameRule/maxHints/loopCount/_stageSuspendDisabled/_cutinSet など該当項目）＋ cutin本文
   （`#cutin-text` のinnerHTML と `#cutin-name` のdisplay:none）を確認
6. **回帰確認**: コード変更（sphere-minesweeper.html等）をした場合のみ、既存ステージ（23〜27のどれか＋
   必要ならstage9）で挙動が変わっていないことを確認
7. `preview_stop` で必ずサーバーを止める（音を鳴らしたら止める）
8. ユーザーへ報告（設定内容・追加/修正したコード・検証結果）。**コミットは指示があったときだけ**

## 3. stage-params.json フィールド早見表（ゲームが実際に読むもの）

- `diff`: 盤面サイズの**唯一の真実源**。DIFF_PRESETS（sphere-minesweeper.html 802行付近）
  s1=16×8 / s2=24×12 / s3=32×14 / m1=40×18 / m2=48×22 / m3=56×26 / h1=64×30 / h2=72×34 / x1=12×7 / ex1,ex2=144×72
- `mines`: 地雷数直接指定（densityより優先）
- `boardPalette`: ["#色"] 単色 or ["西","東"] 2色。**2色分割は中央半分/両端固定**（帯幅指定は不可・保留中の懸案）
- `maxHints`: ORACLE回数。**0=使用不可**（このセッションでガード修正済み。0でゲージ空＋常時グレーアウト＋ミス1回で即ゲームオーバー）
- `timeLimitMode`+`timeLimit`: 制限時間（秒）
- `loopMode`+`loopCount`+`loopColors`: 周回。`loopColors`は周ごとの盤面色配列（このセッションで新設。未指定なら既定の虹色配列）
- `gameRule`: "noflag"で旗禁止
- `suspendDisabled`: true で設定メニューの「中断」をグレーアウト＋機能ブロック（このセッションで新設）
- `boardSource`: "data/board/XX.json" でFactory盤面（seedプール）。dims/mineCountは盤面ファイルのparamsが正。
  最初のクリックが盤面ファイルの`params.start`に差し替えられ自動開放、「✅ FACTORY」表示（既存機能）。
  このとき `logicGuarantee` は false にする（生成時保証は使わないため）
- `cutin`: "stageNN" で data/cutin/stageNN.json をロード
- `bgmSwitch`: `{ "at": 0〜1, "file": "ファイル名" }` でRESCUE PROGRESS（`charRevealRatio`）が
  `at`に達した瞬間に`switchBGM()`で曲を差し替える（このセッションで新設。id30で使用）。
  RETRYで元曲(`stage.bgm`)に戻り再発火可能になる。`at`は「進捗残りX%」なら`1-X/100`で計算
  （例: 残り20%→at:0.8）
- `novelAfterClear`: 触らない（配線済み）。`charId`: 触らない

## 4. 特殊ルール告知カットインの形式（確定仕様）

```json
{
  "se": {},
  "characters": {},
  "events": [
    { "id": "stage_open", "trigger": { "type": "stage_start" }, "once": true,
      "lines": [
        { "text": "【特殊ルール】\n○○○\n制限時間：NN秒" } ] }
  ]
}
```

- **speakerを付けない**（js/cutin.jsが名前欄をdisplay:noneにする＝ORACLE表示なし。このセッションで対応済み）
- **全行を1つのline内に\nで結合**（1回のウィンドウで一括表示・左揃え・画面中央）
- 既存のあいさつ台本が入っていたら**削除して特殊ルールのみ**にする（ユーザー確定方針）
- stage_start/stage_clearのみのセットはランキング対象のまま（time/open_rate/mines_removed/manualを入れると自動で対象外になる）

## 5. 既知の罠（このセッションで実際に踏んだもの）

1. **プレビューのキャッシュが強烈**: js/dataを編集しても再ナビゲートで古いファイルが返ることがある。
   検証時はURLに `&_nc=適当な文字列` を付けてキャッシュバイパスする。`<script src>`にクエリを足す一時改変は最後に必ず戻す
2. **プレビューペインではrAFが回らない**（document.hidden=true）: animate()依存の挙動やscreenshotは検証不可。
   `javascript_tool` で関数を直接呼ぶ・状態を直接読む方式で検証する
3. **トップレベルconst/letは`window.X`に生えない**: 存在チェックは `typeof X !== 'undefined'` か裸の識別子で
4. **stages.jsonのgrid_col/grid_row/minesは表示に使われる**（index.htmlのステージカード）。stage-params側と両方更新する
5. **git mv + 編集後は再度git add**（編集がコミットから漏れた前科あり）
6. **falsyガードに注意**: `if(!window._stageMaxHints)` は0を素通りさせる。0が有効値のフィールドは `== null` で判定

## 6. 運用ルール（ユーザーとの取り決め・恒久）

- **push以外のgit操作は許可不要**（commit/branch/merge可）。**pushは絶対にしない**（ユーザーが実行）
- プレビューサーバー起動は許可不要。**検証後は必ず止める**（音も）
- ユーザーの指示にない項目（背景/BGM等）は勝手に設定しない
- 技術的に実現不可能な指示（例: 「中央3列だけ黒」）は実装前に率直に伝えて方針を確認する

## 7. 現在の未コミット変更（引き継ぎ時点）

```
M data/cutin/stage23.json     … 特殊ルール1行化
M data/stage-params.json      … id23-27設定
M data/stages.json            … id23-27表示値同期
M js/cutin.js                 … speaker無し行の名前欄非表示
M sphere-minesweeper.html     … maxHints:0対応3箇所 / loopColors / suspendDisabled /
                                 ズームゲージめり込み修正(getSpherePxRadius+syncZoomDependentUI)
?? data/board/30x64_24.json   … stage6用Factory盤面（ユーザー作成）
?? data/board/34x72_23.json   … 未使用Factory盤面（ユーザー作成・stage7/8用？）
?? data/cutin/stage24-27.json … 特殊ルール台本
?? tool/board/boardhunter_result/boardhunter_ST8-34x72-23_*.json … Hunter結果（触らない）
```

sphere-minesweeper.htmlの変更詳細（ズームゲージ修正）: 制限時間ゲージがズームインでめり込む原因は
同期漏れではなく**シルエット半径の式**（R/d一次近似はd=2.0で51%過小）。`getSpherePxRadius()`に
正式（tanθ=(R/d)/√(1-(R/d)²)）を実装し、`syncZoomDependentUI()`でcamera.z変化フレームのみDOM更新。
詳細はメモリ `feedback_dev.md` の該当節参照。
