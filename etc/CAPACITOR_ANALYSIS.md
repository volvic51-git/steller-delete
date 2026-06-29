# Capacitor（Android APK化）分析レポート

作成日: 2026-06-29  
対象: Stellar Delete ver9_20_Git

---

## 最大の課題

**マルチページ構成のSPA化**が最大の工数。  
index.html → sphere-minesweeper.html → novel/*.html → endrole_release.html  
という複数HTMLをまたぐ遷移構造を、1つのHTMLにまとめる必要がある。

---

## 🔴 高優先度（必須対応）

### 1. マルチページ構成
- `window.location.href` で複数HTMLを遷移している
- 主な遷移箇所：
  - index.html:1428 → sphere-minesweeper.html
  - index.html:1530 → novel/*.html
  - sphere-minesweeper.html:631-634 → index.html / novel
  - novel/js/novel.js:1060 → index.html / 次エピソード
- **対応:** SPA化（全コンテンツを単一HTMLで管理、JS画面切り替え）

### 2. Three.js CDN依存
- sphere-minesweeper.html:733
  ```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  ```
- オフライン環境でゲーム画面が真っ黒になる
- **対応:** `assets/libs/three.min.js` としてローカルに同梱

---

## 🟡 中優先度（対応推奨）

### 3. Google Fonts CDN依存
- 使用フォント（CDN読み込み）:
  - index.html: Orbitron, Rajdhani, Share Tech Mono
  - novel/*.html: Noto Serif JP, M PLUS 1p
  - endrole_release.html: Exo 2, Black Ops One, Russo One 他多数
- オフラインでフォント崩れが発生
- **対応:** woff2ファイルをローカルに同梱、@font-faceで定義

### 4. Androidバックボタン
- index.html:1732 で `history.pushState` を使ったブラウザバック防止
- Capacitor WebViewで予期しない動作の可能性
- **対応:** `App.addListener('backButton', ...)` で上書き

### 5. 音声自動再生
- タイトルBGMは初回タップ後再生（対応済み ✅）
- プレイ画面の `startBGM()` が未対処の可能性あり
- **対応:** 確認・必要に応じてユーザー操作トリガーを追加

---

## 🟢 低優先度（ほぼ問題なし）

| 項目 | 状況 |
|---|---|
| localStorage（セーブ・ランキング） | Capacitor WebViewで完全動作 ✅ |
| BroadcastChannel（tab-guard.js） | APKではタブなし → try-catchで安全スキップ ✅ |
| タッチ操作 | スマホ対応済み ✅ |
| WebGL / Canvas（Three.js） | Android WebViewで完全サポート ✅ |
| fetch / JSON読み込み | ローカルファイルなので動作 ✅ |
| URLパラメータ処理 | SPA化時に再検討が必要 |

---

## 実装順序（推奨）

1. Three.js をローカルに同梱
2. Google Fonts をローカルに同梱
3. SPA化（最大工数）
4. Capacitorプロジェクト初期化
5. Androidバックボタン対応
6. 動作確認・調整

---

## 備考

- V2開発（事前盤面生成 → リプレイ → 中断）完了後にAPK化を検討予定
- SPA化はV2のアーキテクチャ変更と合わせて行うと効率的
