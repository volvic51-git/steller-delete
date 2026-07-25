# V2.5 Android APK化 検討書（Capacitor / WebView）

作成日: 2026-07-26
ステータス: **検討完了・未着手**（実装前。着手はユーザー判断待ち）
前提: V2完成（2026-07-25宣言、`etc/V2_HANDOFF.md`参照）
配布先: **Google Play が本命**（itch.io/直APK配布は対象外と決定）

旧分析 `etc/CAPACITOR_ANALYSIS.md`（2026-06-29）の後継。
**旧分析は前提が1つ誤っており、工数見積もりが大きくズレている**（後述 §A-0）。
旧分析は歴史的資料として残すが、判断には本書を使うこと。

---

## 0. 結論サマリ

| 論点 | 旧分析（2026-06-29） | 本書の結論（2026-07-26） |
|---|---|---|
| 最大工数 | **SPA化**（24 HTMLの単一HTML統合） | **不要。** Capacitorはマルチページのまま動く |
| 真のボトルネック | （項目なし） | **セーフエリア対応**（全24 HTMLのCSS）が工数の主戦場 |
| 描画性能 | （項目なし） | Snapdragon 8 Gen 1 で EX含め実証済み。**ミドルレンジ帯のみ未知** |
| 環境 | Node.js / Android Studio が要る | **既存環境は2022年6月で停止。全面刷新が必要** |
| targetSdk | （言及なし） | **36 を狙う**（35ではない。§B-1参照） |

### 旧分析から消えた作業・増えた作業

- **消えた**：SPA化（`location.href` 遷移53箇所の作り替え）
- **増えた**：エッジトゥエッジ/セーフエリア対応、Play向けの各種申告、
  セーブデータ耐久性、アセット容量削減

---

## A. コード側の課題

### A-0. 前提の訂正：SPA化は不要

Capacitorは webアセットを `https://localhost` として**ローカルサーバ配信**する
（`file://` ではない）。したがって：

- `window.location.href = 'sphere-minesweeper.html'` → そのまま動く
- `?stage=11&mode=normal` のURLパラメータ → そのまま動く
- `novel/` から `../assets/` への相対パス → そのまま動く
- `fetch('data/stages.json')` → そのまま動く

実測した遷移箇所は **53件 / 17ファイル**
（`index.html` 13、`sphere-minesweeper.html` 15、`novel/novel*.html` 各2、他）。
**この53箇所は原則ノータッチ。**

#### MPAのまま運用する場合の注意（3点）

1. ページ遷移ごとにJSコンテキストが破棄・再生成される
   → **バックボタンのリスナー登録を全ページに置く必要がある**（§A-4）
2. 遷移のたびに three.js を再パース。スマホで0.5〜1.5秒のもたつき
   → 現状のWeb版と同じ挙動であり、APK化による悪化ではない
3. 遷移中に一瞬白/黒画面 → ネイティブ側の背景色指定で緩和

---

### A-1. 🟡 描画性能とVRAM（懸念は大幅に後退）

**実測済みの前提**（`etc/V2_PERF_72x144_REPORT.md`、GTX1070）：
- 72×144盤面 ズームアウト時 draw call 約5,193 / 45.6ms/frame（≒22fps）

VRAM推定（[sphere-minesweeper.html:1726](../sphere-minesweeper.html:1726) `makeTextCanvas` は `size = 64` 固定）：
```
64×64 RGBA = 16KB/枚（+ミップマップで約21KB）
stageEX2 の非地雷セル = 8,502
→ 数字テクスチャだけで推定 150〜180MB
   ＋ Mesh/Material 10,368個
```

**しかし 2026-07-26 にユーザーより実測報告あり：**

> itch.io（ブラウザ）で Android / Snapdragon 8 Gen 1 にて V2 までテストプレイ済み。
> **EXTRA STAGE（72×144）を含めて全く問題なし。**

AndroidのWebViewもChromeも中身は同じChromiumであり、**WebView化しても描画性能は
ほぼ同じ**と判断してよい。よって当初 🔴 と見積もった項目を 🟡 に格下げする。

**残る未知数はミドルレンジ帯のみ**（Snapdragon 6シリーズ、Helio、Exynos廉価帯）。
itch.ioなら「重い端末では遊べない」で済むが、Playでは**クラッシュ＝星1レビュー**になる。

**対応方針**：テスト機を買う前に、**Play Consoleの「事前起動レポート」を使う。**
AABをアップロードするとGoogleが実機デバイスファームで自動起動し、クラッシュ・
スクリーンショット・パフォーマンスを返してくれる。無料。クローズドテストの前段として使う。

C案（セルInstancedMesh化）は**V2.5では不要**と判断。V3候補のまま据え置き。

---

### A-2. 🔴 CDN依存（オフラインで全滅する）

#### three.js
- [sphere-minesweeper.html:823](../sphere-minesweeper.html:823) の cdnjs r128、**1箇所のみ**
- `assets/libs/three.min.js` に落として差し替えるだけ
- ⚠️ **r128のまま使うこと。**最新版はAPI破壊があり移植コストが跳ねる

#### Google Fonts
- 全24 HTML ＋ [novel/js/novel.js:522](../novel/js/novel.js:522) の**実行時動的ローダー**
- 実測した使用ファミリは **17種類**：

| 分類 | ファミリ |
|---|---|
| 英字 | Orbitron, Rajdhani, Share Tech Mono, Exo 2, Black Ops One, Russo One, Bebas Neue, Barlow Condensed, Oswald |
| 日本語 | Noto Serif JP, Noto Sans JP, M PLUS 1p, Kaisei Decol, Shippori Mincho, Zen Old Mincho, Zen Maru Gothic, Dela Gothic One, BIZ UDPGothic |

日本語フォントを丸ごと同梱すると **1ファミリ5MB前後 × 9 = 45MB超**でアセットが倍増する。

**削減方針：**
1. **本文用（Noto Serif JP / Noto Sans JP / BIZ UDPGothic）は同梱しない。**
   Androidには Noto CJK が標準搭載されており、`serif` / `sans-serif` への
   フォールバックで実質同じ字面になる。
   [novel/js/novel.js:513](../novel/js/novel.js:513) の `_familyMap` は既にこの構造：
   ```js
   var _familyMap = {
     serif:  "'Noto Serif JP','Hiragino Mincho ProN',serif",
     gothic: "'M PLUS 1p','Hiragino Kaku Gothic ProN',sans-serif"
   };
   ```
2. **装飾フォントは使用文字だけサブセット化。**
   ノベル本文もエンドロールのクレジットも**全テキストが静的にリポジトリ内にある**ので、
   実際に使う字だけ抽出できる。1ファミリ数十KBに収まる。
   （ノベル側の `command:'font'` は実測で `Kaisei Decol` 1種類のみ。script01〜20全て）
3. `_loadGoogleFont()` が実行時に `<link>` をCDNへ生やしている点も併せて潰す

---

### A-3. 🔴 エッジトゥエッジ／セーフエリア ← **工数の主戦場**

Android 15（API 35）以降、**アプリは強制的にedge-to-edge描画**になる。
API 36ではオプトアウトが**完全廃止**され、対応必須。

影響：
- 上部バー（タイマー/RESCUE PROGRESS）がステータスバー・時計と重なる
- フッターボタンがジェスチャーナビゲーションバーに食われる
- カットインの立ち絵・吹き出しの位置ずれ

対応：`viewport-fit=cover` ＋ CSS `env(safe-area-inset-*)`。
技術的には難しくないが**全24 HTMLのレイアウトに影響**し、実機を見ながらの
微調整が要る。**旧分析には項目自体が無かった。**

---

### A-4. 🟡 Androidバックボタン

現状（実測）：
- [index.html:2992](../index.html:2992)：`history.pushState` を2回積み、`popstate` でダイアログ表示
- [sphere-minesweeper.html:5811](../sphere-minesweeper.html:5811)：2回積み、`popstate` で `index.html` へ `location.replace`
- `novel/novel*.html`：各1回積み、`popstate` でダイアログ表示

**この方式はAPKでは危険。**「戻る先が無い」状態を作れないため、
バックボタンで**即アプリ終了**という最悪の挙動になり得る
（プレイ中にそれが起きるとセーブが飛ぶ）。

対応：`@capacitor/app` の `backButton` リスナーでネイティブ側から扱う。
- プレイ中 → 「中断しますか？」
- タイトル → 「終了しますか？」
- ノベル中 → 章の途中なら確認

**全24ファイルに必要**なので共通モジュール化が前提（`js/` 配下に新規）。

---

### A-5. 🟡 音声

[sphere-minesweeper.html:890](../sphere-minesweeper.html:890) で `new Audio()` を
**13個**、ページロード時に一括生成：
```
bgm / flag / clear / destroy / popen / beep /
bell1 / bell2 / bell3 / damage / pin / charge / judge
```

課題：
1. **SE遅延**：`HTMLAudioElement` は mp3 デコードを都度走らせるため、タップからSEまで
   100〜300ms遅れることがある。掘削フィードバックとしては致命的。
   → SEだけ Web Audio API（デコード済み `AudioBuffer` を使い回す）へ移すのが定石
2. **自動再生ポリシー**：Capacitor側の設定で解除できるが**要実機確認**
3. **バックグラウンド遷移時のBGM停止** — 現状 `visibilitychange` の扱いが未整理。
   ホームボタンでBGMが鳴りっぱなしになるとレビュー爆撃案件

※ `js/audio-settings.js`（BGM/SE独立音量）は既に共通モジュール化済みなので、
   SEのWeb Audio化はそこに寄せられる。

---

### A-6. 🟡→🔴 セーブデータの耐久性（Play配布では重要度が上がる）

現行キー（実測）：

| キー | 内容 | 参照 |
|---|---|---|
| `stellarDeleteSave` | クリア進捗 | index.html:1791 ほか |
| `stellarDeleteRanking_stage_N` | ステージ別ランキング | index.html:1991 ほか |
| `stellarDeleteRanking_limit` | LIMIT MODE専用ランキング | index.html:2700 |
| `stellarDeleteAudioSettings` | BGM/SE音量 | js/audio-settings.js:3 |
| `steller_suspend` | 中断データ | sphere-minesweeper.html:3918 |
| `steller_replays` | リプレイ | sphere-minesweeper.html:3616 |
| `steller_replay_autosave` | リプレイ自動保存スイッチ | sphere-minesweeper.html:3632 |
| `steller_factory_board` | Factory盤面受け渡し（開発用） | sphere-minesweeper.html:1888 |

localStorage自体はWebViewで動く。ただしAPKでは：
- OEMのストレージクリーナー等で消える経路がブラウザより多い
- Android Auto Backup（Google Drive）にWebViewのlocalStorageが乗るかは不確実
  → **機種変更でセーブが消える**

Play配布は機種変更するユーザーが必ず出るため、対応必須と判断。
- `@capacitor/preferences`（ネイティブSharedPreferences）へ移す、または
- **最低限、セーブのエクスポート/インポート機能を用意する**

---

### A-7. 🟡 アセット容量（実測 78.7MB）

```
assets/audio     32.3 MB (31 files)  ← SND_06_ITSD.mp3 だけで 5.44MB
assets/images    45.0 MB
  ├ cutin        24.0 MB (25 files)  ← K01〜K07 が各 1.5MB の PNG
  ├ novels        8.1 MB (49 files)
  ├ characters    4.3 MB (40 files)
  ├ (root)        3.8 MB ( 5 files)  ← img_title.jpg 2.85MB
  ├ stages        3.0 MB (22 files)
  ├ plays         1.5 MB ( 8 files)
  └ etc           0.3 MB ( 6 files)
novel             0.8 MB (74 files)
data              0.1 MB (20 files)
js                0.1 MB ( 7 files)
(root files)      0.4 MB
───────────────────────────────────
合計            約 78.7 MB
```

AAB/APKの上限には収まるが、80MB超のインストールサイズはモバイルで離脱要因。

**削減方針**：
- cutin PNG → WebP（α付き）で 24MB → **推定4〜6MB**
- BGM mp3 のビットレート見直し・OGG化で 32MB → **推定15MB前後**
- 全体で **78MB → 30〜35MB** は現実的

**✅ 確認済み**：`assets/` `data/` `js/` `novel/` 配下に**非ASCIIファイル名は0件**。
Androidアセットは大文字小文字を区別するため表記ゆれがあれば即404になるが、問題なし。
（非ASCIIは `etc/` と `tool/cutin/` にのみ存在。いずれも同梱対象外）

---

### A-8. 🟢 軽微な項目

| 項目 | 判断 |
|---|---|
| `js/tab-guard.js` | `BroadcastChannel` はWebViewでも動作。自タブIDを除外する実装なので誤検知なし。APKでは無意味だが**無害＝放置可** |
| 🐞DEBUGボタン | APK版では隠すべき。未マージの `V1.7` ブランチが「DEBUGボタン非表示」を持つが、STORY2/LIMIT MODEも一緒に隠れるのでそのままは使えない |
| 画面の向き | portrait固定か両対応かを決める必要あり。novel側は `max-aspect-ratio: 3/4` でSP判定しているので回転時の再レイアウトは要確認。§B-1の②も参照 |
| `?v=` キャッシュバスター | APKでは不要だが害もなし |
| `steller_factory_board` | `tool/board-factory.html` からの受け渡し用。開発専用で同梱対象外 |

---

## B. 環境・アカウント側の課題（ユーザー作業）

### B-1. targetSdk とは / なぜ36なのか

Androidは1年ごとにOSが出て、それぞれに **API level** が付く。

| API level | Androidバージョン | リリース |
|---|---|---|
| 33 | Android 13 | 2022 |
| 34 | Android 14 | 2023 |
| 35 | Android 15 | 2024 |
| 36 | Android 16 | 2025 |

ビルド設定には3種類ある：

| 設定 | 意味 |
|---|---|
| **minSdk** | これ未満のOSにはインストールさせない（下限）。Capacitorの要求は23 |
| **compileSdk** | どのバージョンのAPIでコンパイルするか。常に最新でよく、挙動には影響しない |
| **targetSdk** | **「このアプリはAndroid ○○の流儀で書かれています」というOSへの宣言** |

Androidは新バージョンで仕様変更を入れる際、古いアプリが壊れないよう**互換動作を残す**。
どちらを適用するかの判定に使われるのが targetSdk。

- `targetSdk = 33` → Android 15の端末でも「Android 13当時の挙動」で動かしてもらえる
- `targetSdk = 36` → 「16の新仕様に対応済み」と宣言＝**互換モードが外れて新仕様が適用される**

つまり **targetSdkを上げる = 新しい仕様変更を全部受け入れる、という約束**。
数字の書き換えは1行だが、対応していないと表示崩れやクラッシュを起こす。

#### なぜ「35以上」という話が出るのか

**Google Playの規約。**新規アプリも更新も、targetSdkが古すぎると
**審査以前に機械的にアップロードが拒否される。**
基準は「最新Androidリリースから1年以内」で、毎年8月末に1つ繰り上がる。

- 前回の期限（2025年8月末）= API 35
- **次の期限（API 36）= 2026年8月31日**

→ **今から作るなら35ではなく最初から36を狙う。**
35で申請してもリリース直後に上げ直す羽目になる。

⚠️ Playの規約は変わる。着手時点の最新は**Play Consoleの案内で必ず確認すること。**

#### targetSdk 36 がこのゲームに要求すること

**① エッジトゥエッジの強制** → §A-3。API 36ではオプトアウト完全廃止

**② 大画面での画面向き制限の無効化**
幅600dp以上の端末（タブレット・折りたたみ）では `screenOrientation` による
向き固定が**無視される**。スマホのみ対応と割り切るなら、Play Console側で
対象デバイスをスマホに絞る手がある。**要判断。**

---

### B-2. 🔴 開発環境が2022年で止まっている（実測 2026-07-26）

```
Android Studio : AI-213.7172.25.2211.8571212  = 2021.3 Chipmunk（2022年前半）
  └ jbr/ が存在しない = 壊れている or 途中の状態
SDK platforms  : android-32 のみ（Android 12）
build-tools    : 30.0.3 / 32.0.0 / 32.1.0-rc1
cmdline-tools  : 未インストール
system-images  : android-32 / google_apis のみ
SDK最終更新    : 2022年6月1日
ANDROID_HOME   : 未設定（空）
java (PATH)    : NOT FOUND
adb  (PATH)    : NOT FOUND
─────────────────────────────
Node.js        : v24.16.0 ✅  npm 11.13.0 ✅  ← そのまま使える
git            : ✅
```

**Capacitorの現行版は targetSdk 35+ / JDK 21 / Gradle 8.x を要求**するため、
この環境では1行もビルドが通らない。

**やること：**
1. **Android Studio を最新版で入れ直す**
   （既存の `C:\Program Files\Android\Android Studio` は削除推奨。jbrが無く不完全）。
   最新版は JDK 21 (JBR) を同梱するので Java の別途インストールは不要
2. SDK Manager から **Platform 36／Build-Tools 36／Platform-Tools最新／
   Command-line Tools** を入れる。古い android-32 は削除してよい
3. 環境変数 `ANDROID_HOME` を設定
4. ディスクは C: に156GB空きがあるので余裕（必要 30〜40GB）

---

### B-3. 🔴 プロジェクトパスに日本語が入っている

```
D:\コード\StellerDelete\ver9_20_Git
     ^^^^^^  ← 非ASCII
```

**Gradle / Android Gradle Plugin / NDK は非ASCIIパスで壊れることが知られている。**
踏むと原因が分かりにくい類のトラブルで、しかも回避は簡単。

**対策**：Androidビルド用の作業ディレクトリを **`D:\dev\stellar-delete\`** のような
ASCIIパスに置く。`android/` プロジェクトだけASCII配下にある構成も組めるが、
混乱を避けるならリポジトリごとASCIIパスへ移すのが素直。

---

### B-4. 🟡 実機のAndroid端末

**✅ Snapdragon 8 Gen 1 機で itch.io 版の動作確認済み（EX含め問題なし）。**

残るのは**ミドルレンジ帯の検証**だが、§A-1のとおり
**Play Consoleの事前起動レポートで代替できる**ため、テスト機の追加購入は
レポートを見てから判断でよい。

デバッグビルドの転送用に、以下は必要：
- データ転送対応のUSBケーブル（充電専用ケーブルだと `adb` が認識しない定番の罠）
- 端末側で「開発者オプション」→「USBデバッグ」をON

---

### B-5. 🟡 署名キーストア

リリースAAB/APKには署名が必要で、`.jks` ファイルとパスワードを作る。

⚠️ **紛失するとアプリを二度と更新できない**
（Play App Signingを使えば救済ルートはあるが、前提として初回登録が要る）。
作成後は即バックアップすること。パスワード類はユーザー自身で管理する
（Claudeは扱わない）。

---

### B-6. 🟡 Google Play 固有の要件

- **Play Console 登録料 $25**（一回限り）
- **targetSdk 36**（§B-1）
- **プライバシーポリシーのURL** — localStorageに保存するだけで外部送信は無いため
  内容は単純だが、**Webページとして公開する必要がある。**
  GitHub Pages（`volvic51-git.github.io/steller-delete`）に1ページ足すのが早い
- **データセーフティ申告**・**コンテンツレーティング申請**
- **クローズドテスト**：個人開発者アカウントの場合、本番公開前に
  「テスター12人以上・14日間のクローズドテスト」が必要というルールがある
  → **ユーザー確認済み：itch.ioで約100人にプレイしてもらっているため確保可能の見込み**
  ⚠️ 条件は変わる可能性があるので Play Console の最新案内を必ず確認すること

---

## C. マシン選定（GTX1070機 vs RTX5060ti機）

現行機の実測（2026-07-26）：
```
CPU : Intel Core i7-4790 @3.60GHz  4C/8T（2014年 Haswell）
RAM : 15.9 GB
GPU : NVIDIA GeForce GTX 1070
Hypervisor : 有効（Hyper-V稼働中）
Disk : C: 156GB空き / D: 772GB空き
```

**結論：GPUは無関係。RTX5060tiであること自体に意味はない。効くのはCPU。**

| 用途 | 律速 | 評価 |
|---|---|---|
| Gradleビルド | CPU（マルチコア）＋ストレージ | i7-4790は現行CPUのシングル約1/2.5、マルチ約1/4〜1/6。フルビルド5〜10分、増分1〜2分 |
| Androidエミュレータ | CPU＋仮想化 | Hyper-V有効でWHPX経由。Haswellでは重い。そもそもWebGL評価には使えない |
| GPU | — | GradleもAndroid Studioもほぼ使わない |

**推奨：**
1. **ビルド機はRTX5060ti機に移す。**理由はGPUではなくCPU世代とNVMe。
   ビルド待ちが1/3〜1/5になり、開発ループの体感が変わる
2. ただし**この機で続行することも可能**。ビルドが遅いだけで、できないことはない。
   移行が面倒なら Step 1〜2 まではこのまま進め、本格作業に入る段階で移すのが合理的
3. §B-3（日本語パス）の対応と同時にやると二度手間にならない

---

## D. 実装ロードマップ

| Step | 内容 | 担当 | 見積 |
|---|---|---|---|
| **0** | 環境刷新：Android Studio再インストール／SDK 36／ASCIIパスへ移動／USBケーブル・USBデバッグ | **ユーザー** | 半日 |
| **1** | three.js ローカル化 ＋ Capacitor最小シェル。**SPA化なし・アセット未最適化のまま**実機で動かす | Claude | 1〜2日 |
| **2** | 実機でひととおり通しプレイ。バックボタン・音声・セーフエリアの実害を洗い出す | 共同 | 1日 |
| **3** | セーフエリア（§A-3）／バックボタン（§A-4）／音声（§A-5）／セーブ耐久性（§A-6） | Claude | **工数の主戦場** |
| **4** | フォントのローカル化＋サブセット（§A-2） | Claude | 1〜2日 |
| **5** | アセット最適化 78MB → 30MB台（§A-7） | Claude | まとまった単純作業 |
| **6** | 署名・AABビルド → Play Console へアップロード → **事前起動レポート確認** | 共同 | — |
| **7** | プライバシーポリシー公開／データセーフティ申告／コンテンツレーティング | **ユーザー** | — |
| **8** | クローズドテスト（12人・14日） → 本番公開 | **ユーザー** | 最低2週間 |

**Step 1〜2を最速で迎えに行くのがこの計画の肝。**
旧分析に従ってSPA化から始めていたら、数週間かけた後に「そもそも不要だった」と
判明する最悪の順序になっていた。

---

## E. 未決事項（着手前に決めること）

1. **画面の向き** — portrait固定か両対応か。§B-1の②（大画面での向き固定無効化）も絡む
2. **対象デバイス** — スマホのみに絞るか、タブレットも対象にするか
3. **minSdk** — どこまで古い端末を切るか（Capacitorの下限は23＝Android 6）
4. **セーブ移行方針** — `@capacitor/preferences` へ移すか、エクスポート/インポートで済ますか
5. **DEBUGメニュー** — APK版で隠す方法（`V1.7` ブランチはそのままでは使えない）
6. **アプリ名・パッケージ名・アイコン・ストア掲載画像** — ユーザー準備物
7. **既存itch.io版との関係** — 併存させるか、Play版へ一本化するか

---

## F. 参考：本書の根拠となった実測コマンド

すべて 2026-07-26 にこのリポジトリで実測。

- HTMLエントリポイント数：`Get-ChildItem -Recurse -Filter *.html`（tool/等を除外）→ **24件**
- CDN依存：`Grep` で `cdnjs|fonts.googleapis|fonts.gstatic|unpkg|jsdelivr` → 上記の通り
- 遷移箇所：`Grep` で `location.(href|replace|assign)|window.open|history.(pushState|...)` → **53件/17ファイル**
- localStorageキー：`Grep` で `stellarDelete[A-Za-z_]*|steller_[a-z_]*`
- アセット容量：`Get-ChildItem -Recurse | Measure-Object Length -Sum`
- 非ASCIIファイル名：`Where-Object { $_.Name -match '[^\x00-\x7F]' }`
- 環境：`Win32_ComputerSystem` / `Win32_Processor` / SDK・Android Studioディレクトリ走査

---

## 関連ドキュメント

- `etc/V2_HANDOFF.md` — V2完成までの全経緯
- `etc/CAPACITOR_ANALYSIS.md` — 旧分析（2026-06-29）。**§A-0の理由により判断には使わないこと**
- `etc/V2_PERF_72x144_REPORT.md` — 描画性能の実測データ（§A-1の根拠）
- `etc/V2_OPEN_FX_PLAN.md` — 開封演出。C案移行時の差し替え設計（§5）
