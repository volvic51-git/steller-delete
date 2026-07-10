# 数字セル開封演出 検討書

作成: 2026-07-10 / 状態: **B＋C＋E実装・検証済み（`feature/mine-removal-diff`）**
対象: `sphere-minesweeper.html`。前提: B案（差分更新）実装済みの `feature/mine-removal-diff` 上に載せる。

> 実装済み内容（2026-07-10）: §2.2の骨子どおり（`_openFx`／`registerOpenFx`／`updateOpenFx`／
> openCellフック／animate呼び出し／initBoardクリア）。フラッシュ色は案2（パレット由来、
> `buildThemeColors.openFlash = darkenHex(hex, 0.55)`＋`BOARD_THEME_DEFAULT.openFlash`）。
> **E案（カスケード波紋）も実装済み**: `openCell(row,col,depth)` に再帰深度を追加（省略可＝後方互換）、
> `registerOpenFx(cell, depth*OPEN_FX_WAVE_MS)`（6ms/段）。波紋待ちの間に数字が一度フルサイズで
> 見えてから縮む「再ポップ」を防ぐため、**登録時に数字を0.6へ事前縮小**してから遅延発火する。
> 検証済み: 演出中の値（emissive=openFlash・intensity≈2.5→1減衰・数字scale 0.6→1.0）／
> 終了時のテーマ値復元（全セルscale=1・intensity=1）／RETRYでリストクリア／resume再構築中は
> 登録0件＋状態完全一致（openCellのdepth引数追加は後方互換）／resume後のライブ操作で発火／
> 2色パレット盤面で東西別色（黄0x707000・紫0x25004b）／フラッドでdelayが深度順（6/12/18ms…）に
> 付与され全排出・コンソールエラーなし。

---

## 0. 結論（先に要点）

**推奨: B（発光フラッシュ）＋C（数字ポップ）を1つの仕組みで同時実装（約40行）。
オプションとしてE（カスケード波紋＝開封順の時間差、＋約10行）を追加。**

- 性能影響は72×144でもモバイルでも**実質ゼロ**（アクティブなセルだけ回す設計。
  新規のテクスチャ/マテリアル/draw callを一切作らない）
- 既存のヒント脈動・Judgeハイライトと同じ「materialを直接触る」証明済みパターン
- InstancedMesh化（C案）とも共存可能（演出を1関数に集約しておけば移行時の差し替えは1箇所）
- D（周辺枠線の波紋）は今回見送り推奨（後述の通り実装リスクとコストが最も高い）。
  ただし「枠線を一瞬明るくして戻すだけ」の**D'軽量版**なら安価（将来の選択肢）

---

## 1. 評価軸と各案の比較

| | A: セルスケール | B: 発光フラッシュ | C: 数字ポップ | D: 周辺枠線波紋 | E: カスケード波紋(追加提案) |
|---|---|---|---|---|---|
| 実装コスト | 小（~30行） | **最小（~25行）** | 小（~15行※Bと共用） | **大（~60行＋罠2つ）** | 極小（B/C+10行） |
| 72×144性能 | ◎ 無視できる | ◎ 無視できる | ◎ 無視できる | △ 効果中は毎フレーム約1MBのGPUバッファ転送 | ◎ 無視できる |
| モバイル | ◎ | ◎ | ◎ | △ 転送コストが数ms/フレームになり得る | ◎ |
| 視認性向上 | ○ | **◎（開封色が一瞬明るく）** | ◎（数字の出現が明確） | ○ | ◎（連鎖が波に見える） |
| 気持ちよさ | ○ ポップ感 | ○ | ◎ 情報の主役が動く | ◎ | **◎ フラッドの主役** |
| InstancedMesh化(C案)との相性 | ◎ instanceMatrixで同等 | △ 要instanceColor流用or専用attribute（移行時に1関数差替え） | ◎ 数字アトラス側もinstance scale | ◎ 枠線は既に統合済みで無関係 | ◎ |
| 干渉リスク | 統合枠線がscaleに追従しない（枠静止・パネルのみ動く。見た目は許容） | updateCellVisualのemissive上書き（毎フレーム再設定で実害なし） | なし | `_borderHex`同色スキップ最適化と衝突・毎フレーム全カラーバッファ再転送 | なし |

### 判定（依頼の5項目）

1. **コスパ最高**: B。次点C（Bの仕組みに数行足すだけ）。
2. **現行コードで実装しやすい**: B（ヒント脈動 `animate()` 4458行付近と同じ手法の一回性版）と
   C（`numberMesh.scale` を触るだけ）。
3. **72×144での性能影響**: A/B/C/Eは「アクティブなセルのみの配列」を回すため、
   通常時 <10セル、最大級フラッド（~200セル開封）でも1フレームあたり0.05ms未満の見積り。
   既存のrender 44ms（ズームアウト時）に対し誤差。**全盤面スキャンを追加しないことが条件**
   （既存のCell removal animationsループは全盤面走査だが、これに相乗りせず専用配列を使う）。
4. **モバイル**: A/B/C/Eはプロパティ書き換えのみで安全。DのみGPU転送が乗るため非推奨。
5. **追加提案**: E（下記）とD'（下記）。

---

## 2. 推奨案の設計スケッチ（B＋C＋任意でE）

### 2.1 方針

- 開封演出は**専用の小配列 `_openFx`** で管理（全盤面スキャン禁止）。
- **`updateCellVisual` は絶対に毎フレーム呼ばない**（内部の `createNumberMesh` が
  canvas＋テクスチャを再生成するため。これが2.8秒ヒッチの原因だったのと同根）。
  エフェクトは material / scale を直接書き、終了時も直接テーマ値へ復元する。
- 対象は **`neighborMines > 0` の開封セルのみ**（0セルは直後に消滅演出があるため対象外。
  二重演出とvanishとの競合を避ける）。

### 2.2 コード骨子

```js
// ===== 開封演出（B:フラッシュ + C:数字ポップ）=====
let _openFx = [];              // {cell, t0, delay} アクティブな演出だけを保持
const OPEN_FX_MS = 220;        // 演出時間（150〜300msで調整）

function registerOpenFx(cell, delayMs){
  if(_replayInstant) return;               // resume/リプレイ再構築中は登録しない（数千個登録される）
  if(cell.neighborMines === 0) return;     // 0セルはvanish演出に任せる
  _openFx.push({ cell, t0: performance.now(), delay: delayMs || 0 });
}

// animate() から毎フレーム呼ぶ（particlesループの近くに置く）
function updateOpenFx(){
  if(!_openFx.length) return;
  const now = performance.now();
  for(let i = _openFx.length - 1; i >= 0; i--){
    const fx = _openFx[i], cell = fx.cell;
    if(!cell.mesh || cell.isRemoved || cell.animating){ _openFx.splice(i,1); continue; }
    const t = (now - fx.t0 - fx.delay) / OPEN_FX_MS;
    if(t < 0) continue;                    // E案: 波紋ディレイ待ち
    if(t >= 1){
      // 終了：テーマ値へ直接復元（updateCellVisualは呼ばない）
      const vc = buildThemeColors(paletteColor(getCellPaletteIndex(cell)));
      cell.mesh.material.emissive.setHex(vc.openEmit);
      cell.mesh.material.emissiveIntensity = 1;
      if(cell.numberMesh) cell.numberMesh.scale.setScalar(1);
      _openFx.splice(i,1); continue;
    }
    const ease = 1 - (1-t)*(1-t);          // easeOut
    // B: 開封フラッシュ（明るく点いて減衰）
    cell.mesh.material.emissive.setHex(OPEN_FLASH_COLOR);
    cell.mesh.material.emissiveIntensity = 1 + (1 - ease) * 1.8;
    // C: 数字ポップ（0.6 → 1.0）
    if(cell.numberMesh) cell.numberMesh.scale.setScalar(0.6 + 0.4 * ease);
  }
}
```

呼び出し側: `openCell()` の `updateCellVisual(cell);` 直後に `registerOpenFx(cell);` を1行。
`initBoard()` の先頭で `_openFx = [];`（RETRY時に旧セルの参照を持ち越さない）。

### 2.3 E案: カスケード波紋（任意・強推奨）

フラッド開封を「波」に見せる。`openCell(row, col, depth)` に再帰深度を足し、
`registerOpenFx(cell, depth * 6)`（6ms/段）とするだけ。setTimeoutは使わない
（`_openFx` のdelayフィールドで処理するため、リスタート時のクリアも一括）。

**これがマインスイーパーの「気持ちいい」の本丸**：大きなフラッドが起きたとき、
開いたセルが波紋状に順番に光りながら数字が立ち上がる。地雷発見時の消滅演出と
対になる「開封側のご褒美」になる。

### 2.4 フラッシュ色（実装時に選ぶ）

- 案1: 固定シアン系（`0x00ffcc` 系。Judge色と統一感）
- 案2: パレット由来（`buildThemeColors` に `openFlash: darkenHex(hex, 0.6)` を1色追加。
  stageEX系の東西2色盤面で色の区別が保たれる）→ **推奨は案2**

---

## 3. 見送り案の理由

### A案（セルスケール）
実装は容易で、`cellSize` の0.86係数によりセル間に約14%の隙間があるため
**scale ≤ 1.15 なら隣接セルと重ならないことを確認済み**。ただし統合枠線
（cellBorderSegs）はセルmeshのscaleに追従しないため「枠は静止・パネルだけ動く」
見た目になる。C（数字ポップ）と役割が重複するので、実装後にCの動きが弱いと
感じた場合の代替として保留（同じ `_openFx` 機構に3行足せば載る）。

### D案（周辺枠線の波紋）
- `setCellBorderColor` は同色スキップ（`_borderHex` キャッシュ）を持ち、
  毎フレームの減衰アニメはこの最適化と衝突する（バイパスが必要）。
- 色の BufferAttribute に `needsUpdate` を立てると **10,368セル×8頂点×3floatの
  カラーバッファ全体（約1MB）が毎フレームGPU再転送**される。エフェクト中は
  モバイルで数ms/フレームの上乗せになり得る。
- 演出終了時に「正しい枠色」へ戻す処理が、旗・開封・ヒント等の枠色状態機械と絡む。

**D'軽量版**（将来の選択肢）: 開封時に枠色を明るい色へ**1回だけ**変え、
`_openFx` の終了時に**1回だけ**戻す（＝セルあたり2回の書き込みのみ、毎フレーム転送なし）。
これなら安価。B＋Cで物足りない場合に追加検討。

---

## 4. 罠（実装時に必ず守ること）

1. **`updateCellVisual` をエフェクトから呼ばない**（createNumberMeshのテクスチャ再生成が走る）。
   復元はmaterialプロパティ直書きで行う。
2. `_replayInstant` 中は `registerOpenFx` をスキップ（resume再構築で数千個積まれる）。
3. 0セル（`neighborMines===0`）は対象外。演出中にセルがvanish開始したら
   （`cell.animating || cell.isRemoved`）即座にリストから除外（骨子に実装済み）。
4. `initBoard()` で `_openFx` をクリア（RETRY/リスタートで旧盤面のセル参照を持ち越さない）。
5. エフェクト中に `applyMineRemovalEffects`（B案の差分更新）が同セルの
   `updateCellVisual` を呼ぶとemissiveが一瞬テーマ値に戻るが、次フレームで
   エフェクトが再設定するため実害なし（ヒント脈動と同じ構造。対処不要と知っておく）。
6. 全盤面スキャンのループ（Cell removal animations等）に相乗りしない。専用配列で回す。

---

## 5. InstancedMesh化（C案）との整合

- 演出の入口を `registerOpenFx` / 更新を `updateOpenFx` の**2関数に集約**しておけば、
  InstancedMesh移行時はこの2関数の中身（material直書き→instance属性書き込み）を
  差し替えるだけで済む。openCell側のフックは変わらない。
- B（emissive）はインスタンス化後、`instanceColor` の一時的な明度上げで近似するか、
  専用のfloat attribute（effect強度0..1）をシェーダーに足す。C案の計画書を書く際に
  「開封演出attribute」を要件として1行入れておくこと。
- C（数字ポップ）は数字がアトラス化されても per-instance matrix の scale で同等表現が可能。

---

## 6. 性能見積りまとめ（72×144・実測ベースの推定）

| 状況 | _openFx 件数 | 1フレームあたりの追加コスト |
|---|---|---|
| 通常プレイ（1セルずつ開封） | 1〜10 | 0.002ms未満 |
| 大フラッド（~200セル一斉開封＋E案の波紋） | ~200（約1.5秒で消化） | 0.05ms未満 |
| resume再構築中 | 0（registerでスキップ） | 0 |

新規のdraw call・テクスチャ・マテリアル・ジオメトリ生成: **ゼロ**。
モバイルへの影響: プロパティ書き換えのみで実質ゼロ。

実装規模: B＋C＝約40行、＋E＝約10行。1セッション内で実装・検証可能。
