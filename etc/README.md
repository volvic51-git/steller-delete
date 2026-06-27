# 同梱ファイルについて

このzipには、今回の対応で新規作成・編集したファイルのみが入っています。
画像・音楽ファイルは含まれていません。既存プロジェクトのフォルダに
このzipの中身を「上書きマージ」する形で配置してください。

## 同梱ファイル（23件）

```
stellar-delete/
├── index.html                 編集済み（SIMPLE/STORYボタン対応）
├── sphere-minesweeper.html    編集済み（novelAfterClear/loopMode/exMode対応）
├── data/
│   └── stage-params.json      編集済み（novelAfterClear追加）
└── novel/
    ├── novel01.html 〜 novel10.html   新規作成
    └── js/
        ├── novel.js                  編集済み（nextUrl対応パッチ）
        └── script01.js 〜 script10.js  編集済み（nextUrl追加）
```

## 同梱されていないもの（既存のものをそのまま使ってください）

- `data/stages.json`
- `data/credits.json`
- `characters/`（characters.json・001〜009.png）
- `stages/`（st01〜st09.png）
- `images/mine.png`
- `sounds/`（SND_02_play.mp3 等）
- `title/`（bg_pc.jpg・bg_sp.jpg）
- `novel/css/style.css`（novel-game-finalプロジェクトのもの）
- `novel/images/`・`novel/bgm/`・`novel/se/`（script内で参照している素材一式）

これらを既存のまま残し、このzipの中身を重ねて配置すれば、
STORYモード（タイトル→novel01→ステージ1固定セレクト→ゲーム→novel02→…→novel10）
と、SIMPLEモード（既存のステージセレクト）の両方が揃った状態になります。
