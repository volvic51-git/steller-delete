# Steller Data Specification

このディレクトリは **Stellar Delete のデータ仕様書群** である。
ゲームのコードではなく、ゲームが扱う **データの構造と思想** を定義する。
V2以降のすべての機能（盤面・検証・中断・リプレイ・ランキング・将来のクラウド同期）は、
ここで定めた原則とフォーマットに従う。

## 読む順番

```
00-Architecture.md     ← まず思想（七原則・Non Goals）を読む
        ↓
10-StellerDataSpec.md  ← 共通語彙（Identity / Reference / Provenance / Version）
        ↓
各フォーマット（憲法に従った具体仕様）
   20-BoardFormat.md        盤面（事実）          … v0.9
   30-VerificationFormat.md 盤面への評価          … 予約
   40-SaveFormat.md         中断中のゲーム状態    … 予約
   50-ReplayFormat.md       プレイ操作列          … 予約
   60-JobFormat.md          生成過程              … 予約
   70-RankingFormat.md      クリア記録            … 予約
   80-RuleSetFormat.md      ゲームルール・隣接定義 … 予約
```

迷ったら **必ず `00-Architecture.md` の七原則に立ち返る。**

## 状態

- 設計フェーズ：v0.9（ドラフト）完了。
- 次フェーズ：solver.js の共通化 → 100×100 実測 → `20-BoardFormat.md` を v1.0 に凍結。
- ここから先は「設計」より「実測」が主役。
