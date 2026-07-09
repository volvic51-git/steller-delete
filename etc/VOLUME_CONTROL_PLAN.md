# Stellar Delete — 音量調整機能 調査・実装計画書

> 作成日: 2026-07-10　ステータス: **V1.0 実装済み（2026-07-10）**
> タイトル画面に「SOUND」ボタンを追加（RESUME/REPLAY/AUCTIONの下、CREDITの上）。BGM/SEスライダーから音量調整可能。
> 実装ファイル: `js/audio-settings.js`（新規）、`index.html`、`sphere-minesweeper.html`、`novel/js/novel.js`＋`novel/novel01〜10.html`、`endrole_release.html`
> 設定項目が増えた場合は「SOUND」ボタンを「CONFIG」に改称する想定（ユーザー指示）。

---

## 1. 音声再生箇所の棚卸し

### 1-1. `sphere-minesweeper.html`（メインゲーム画面）
`SND` オブジェクトに12個の `new Audio(...)` を保持（846-857行目）。

| キー | 種別 | 用途 | 初期音量 |
|---|---|---|---|
| `bgm` | **BGM** | プレイ中BGM（loop） | 0.55 |
| `clear` | SE扱い | ステージクリアジングル（非loop） | 0.8 |
| `flag` | SE | フラグ設置 | 0.75 |
| `destroy` | SE | 破壊 | 0.4 |
| `popen` | SE | セルオープン | 0.6 |
| `beep` | SE | ビープ | 0.5 |
| `bell1`/`bell2`/`bell3` | SE | ベル各種 | 0.6〜0.7 |
| `damage` | SE | ダメージ | 0.8 |
| `pin` | SE | ピン | 0.7 |
| `charge` | SE | チャージ | 0.7 |

- 汎用再生ヘルパーが1箇所（877-878行目付近）：`s.volume=SND[key].volume; s.play()`
- それとは別に `SND.bgm`/`SND.clear`/`SND.beep`/`SND.damage`/`SND.pin` への直接 `.play()`/`.pause()`/`.currentTime=0` 呼び出しが約15箇所に散在（889-4671行目）

### 1-2. `index.html`（タイトル・ステージ選択画面）
`<audio>` タグ3つ（1200-1202行目）。

| id | 種別 | 用途 |
|---|---|---|
| `snd-title` | **BGM** | タイトル画面BGM（loop） |
| `snd-stage` | **BGM** | ステージ選択画面BGM（loop） |
| `efe-select` | SE | ボタン選択音 |

再生箇所は1535-1547行目付近に集中。音量は `.play()` 直前に都度 `element.volume = 0.7` 等で設定。

### 1-3. `novel/js/novel.js`（ノベルパート共通エンジン）
`novel01.html`〜`novel10.html` の全10章が共通で読み込むモジュール。**この1ファイルを直せば全ノベル章に波及する。**

- `playBGM(filename, loop)` — 呼び出しの都度 `new Audio(...)` を生成、`volume = 0.6` 固定（1109-1118行目）
- `fadeOutBGM(duration)` — `setInterval` でボリュームを線形に0まで下げてフェードアウト（1128-1144行目）
- `_playSE(filename)` — 呼び出しの都度 `new Audio(...)` を生成、`volume = 0.8` 固定（1146-1153行目）

### 1-4. `endrole_release.html`（エンドロール）
`<audio id="ed-audio" src="assets/audio/insideTSD.mp3">`（308行目）。スクロール位置に応じて `play()`/`pause()`、クリックでの自動再生解除リスナーあり（455, 637-692行目）。BGMのみ、SEなし。

### 1-5. `manual/scenario-engine.js`, `manual/game-bridge.js`（マニュアル/シナリオ再生エンジン）
音声再生コードは **なし**。現状マニュアル中は音声制御対象外。

### 1-6. AudioContext 使用箇所
`tool/lilic3.html`、`tool/lyrics_maker.html`、`tool/endrole_recorder_2.html` で `AudioContext`/`webkitAudioContext` を使用。ただしこれらは**エンドロール曲の解析・録画用の開発者ツール**であり、プレイヤー向けゲーム画面ではない。本機能のスコープ外とする。

`etc/manual-editor.html` にもプレビュー用の単発 `new Audio('../assets/audio/SND_02_play.mp3')` があるが、これも著者プレビュー専用で本編には無関係（スコープ外、必要なら任意で対応）。

### 1-7. スコープ外の候補一覧
- `tool/lyrics_maker.html`, `tool/lilic3.html`, `tool/endrole_recorder_2.html` … 録音・解析ツール
- `etc/manual-editor.html`, `etc/novel_editor.html` … シナリオ編集ツール（`novel_editor.html`は実際には`NovelEngine.play`呼び出しのみで自前音声なし）
- `etc/stellar-delete-stage-params-editor.html`, `etc/stellar-delete-flow-map.html` … 開発ドキュメント/エディタ

---

## 2. BGM / SE 分類

命名規則が既にファイル名レベルで一貫しているため分類は容易。

| プレフィックス | 意味 | 該当 |
|---|---|---|
| `SND_*` | BGM（曲） | `SND_01_title`, `SND_02_play`, `SND_03_clear`, `SND_04_stage` |
| `EFE_*` | SE（効果音） | `EFE_01`〜`EFE_12` 各種 |
| `insideTSD.mp3` | BGM扱い | エンドロール曲 |

**`SND_03_clear`（クリアジングル）の分類：確定**
`SND.clear` はループなしの単発再生だが、**BGM音量グループに属する**ことで確定（ユーザー判断済み、2026-07-10）。SE音量を絞ってもクリア曲は独立してBGM音量に連動する。

---

## 3. BGM/SE 独立音量調整の最小変更案

### 3-1. 共通の音量管理モジュールを新設
新規ファイル `js/audio-settings.js`（あるいは既存の `js/` 配下）に、全画面から読み込む薄いモジュールを1つ作る。

```js
// 案イメージ（実装はしない）
window.AudioSettings = (function(){
  const KEY = 'stellarDeleteAudioSettings';
  let state = { bgm: 1.0, se: 1.0 };
  // load/save/get/set/onChange のみを提供する薄いラッパー
  return { load, save, getBgmVolume, getSeVolume, setBgmVolume, setSeVolume, subscribe };
})();
```

- 各画面（`index.html`, `sphere-minesweeper.html`, `novel.js`, `endrole_release.html`）は `<script src="js/audio-settings.js">` を追加するだけで済む。
- 実際の音量計算は「素材本来の音量バランス（例: `flag`=0.75, `destroy`=0.4 など）× ユーザーのBGM/SEスライダー値（0〜1）」の掛け算方式にする。既存の作り込まれた音量バランスを壊さずスライダーを重ねられる。

### 3-2. 各再生箇所の最小修正パターン

- **`sphere-minesweeper.html`**：`SND` オブジェクト生成後に「素材固有音量」を `SND[key]._baseVolume` として退避し、汎用ヘルパー（877-878行目）と直接呼び出し箇所（~15箇所）を、実際に鳴らす直前に `audio.volume = baseVolume * AudioSettings.getXxxVolume()` を計算する1行に統一する。
  - `bgm`, `clear` → `getBgmVolume()`
  - それ以外 → `getSeVolume()`
  - 呼び出し箇所が散在しているため、`playSnd(key)` のような小さな共通関数を1つ用意し、直接 `.play()` している15箇所をそこに寄せると変更が閉じる（このリファクタ自体が最小変更の一部）。

- **`index.html`**：3箇所の `.volume = 0.7` 等の代入を `AudioSettings.getBgmVolume()*0.7` / `getSeVolume()*1.0` に置き換えるだけ（3行）。

- **`novel/js/novel.js`**：`playBGM`/`fadeOutBGM`/`_playSE` の3関数内で固定値 `0.6`/`0.8` を書いている箇所を `AudioSettings.getBgmVolume()*0.6` 等に置き換えるだけ（3〜4行）。全10章に波及するがファイルは1つ。

- **`endrole_release.html`**：`ed-audio` の音量代入箇所（現状は明示的な `.volume=` 代入が見当たらず暗黙の1.0）に `audio.volume = AudioSettings.getBgmVolume()` を1行追加。

### 3-3. 設定UI
- 音量スライダーの設置場所は要検討（タイトル画面 or 共通の設定モーダル）。既存の「モード選択ハブ」（`modes.json` 駆動、[[project_mode_select]]）に設定導線を足すか、タイトル画面右上に歯車アイコン+モーダルを追加するのが自然。
- UI自体は今回のスコープ外（本ドキュメントでは音量「調整ロジック」の設計のみ扱う）。UIを別途決める場合は追加調査が必要。

---

## 4. localStorage 保存・復元案

既存コードの規約（`SAVE_KEY`, `REPLAY_STORE_KEY` などのパターン）に合わせる。

```js
const AUDIO_SETTINGS_KEY = 'stellarDeleteAudioSettings';

function loadAudioSettings(){
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      bgm: (parsed && typeof parsed.bgm === 'number') ? parsed.bgm : 1.0,
      se:  (parsed && typeof parsed.se  === 'number') ? parsed.se  : 1.0,
    };
  } catch(e){ return { bgm: 1.0, se: 1.0 }; }
}

function saveAudioSettings(state){
  try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(state)); } catch(e){}
}
```

- 既存コードは全箇所 `try/catch` で localStorage 例外を握りつぶす方針（プライベートブラウジング等での例外対策）。今回もこれに倣う。
- キーは1つに統一（`{bgm, se}` のJSON）。画面をまたいで同じキーを見るため、`index.html` で変更した音量が `sphere-minesweeper.html` 遷移後も即反映される。
- 保存タイミングはスライダーのinput/changeイベント時。ページロード時に `AudioSettings.load()` を1回呼ぶだけで良い。

---

## 5. 既存コードへの影響範囲

| ファイル | 影響度 | 内容 |
|---|---|---|
| `js/audio-settings.js`（新規） | 新規追加 | 音量管理モジュール本体 |
| `sphere-minesweeper.html` | 中 | `SND` 初期化部＋再生箇所を共通関数化（音量参照を差し替え）。既存の音量バランス値は「基準値」として保持し壊さない |
| `index.html` | 小 | 3箇所の音量代入を差し替え |
| `novel/js/novel.js` | 小 | 3関数内の固定値を差し替え。**全10ノベル章に自動反映**（各HTML自体の変更は不要） |
| `endrole_release.html` | 小 | 1行追加 |
| `manual/scenario-engine.js`, `manual/game-bridge.js` | なし | 音声再生自体が存在しないため変更不要 |
| `tool/*`, `etc/*編集系` | なし | スコープ外（プレイヤー向け画面ではない） |

**リスク要因**
- `sphere-minesweeper.html` の直接 `.play()` 呼び出しが多箇所に散在しているため、取りこぼすとその箇所だけスライダーが効かない回帰を生みやすい。→ 実装時は該当行を全てリストアップしてチェックリスト化することを推奨。
- ノベルパートは `new Audio()` を再生の都度生成するため、曲の途中で音量スライダーを動かした場合に「現在再生中の音声」に即時反映するには、生成済みインスタンスへの参照を `AudioSettings` 側で保持し、スライダー変更時にコールバックで書き換える仕組み（`subscribe`）が必要。単に「次回再生時の音量」だけで良いなら実装はより簡単になる（要仕様確認）。

---

## 6. 実装工数・リスク見積もり

| タスク | 見積り |
|---|---|
| `audio-settings.js` モジュール新規実装（load/save/get/set/subscribe） | 0.5h |
| `sphere-minesweeper.html` の再生箇所を共通関数化＋音量差し替え | 1.5〜2h（散在箇所の洗い出しと動作確認込み） |
| `index.html` 音量差し替え | 0.5h |
| `novel/js/novel.js` 音量差し替え（全10章に波及するため動作確認は1〜2章で代表確認） | 0.5〜1h |
| `endrole_release.html` 音量差し替え | 0.3h |
| 設定UI（スライダー等）実装 ※別スコープ | 別途要見積り（設置場所の仕様確定が前提） |
| 動作確認（全画面横断・BGM/SE個別に0/50/100%で確認、localStorage復元確認） | 1〜1.5h |
| **合計（UI除くロジック部分）** | **約4〜6h** |

**総合リスク：低〜中**
- コード変更自体は音量計算式の差し替えが中心で、ロジックの複雑化は小さい。
- 最大のリスクは「散在した再生箇所の取りこぼし」という**カバレッジ漏れ**であり、実装難度そのものではない。
- UIコンポーネント（スライダーの設置場所・デザイン）が未確定のため、そこは別途スコープとして仕様を先に決める必要がある。

---

## 7. 次のアクション（提案）

1. ~~`SND.clear`（クリアジングル）の音量グループ~~ → **BGM音量グループに決定済み（2026-07-10）**
2. 音量スライダーの設置場所（タイトル画面／モード選択ハブ／共通設定モーダル）を決定
3. 上記が決まり次第、本ドキュメントの§3〜5に沿って実装フェーズへ移行
