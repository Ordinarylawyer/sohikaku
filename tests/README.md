# テスト

Web 版の計算エンジン（`site/js/engine/`）が、参照実装 `engine/*.ps1`（PowerShell）と
同じ結果を出すことを確かめる。依存パッケージは無い（Node.js 18 以上）。

```
node tests/run.mjs
```

| ファイル | 内容 |
|---|---|
| `rate.mjs` | 単価区間・申立ての日で新旧を決める改定・6〜8号・旅費・直線距離・丸め（参照実装のテスト TC-18・TC-19・TC-25 を移したもの） |
| `golden.mjs` | ランダムな事件（期日・出欠を含む）を参照実装で計算した期待値と、1 件ずつ全項目を突き合わせる（`fixtures/expected/golden-*.json.gz`。計 700 件） |
| `scenario.mjs` | アプリの退避 JSON（考案事例 事件A〜G）を読み込み、計算・主文・計算書・期日の費用を突き合わせる |
| `masters.mjs` | マスタの CSV（`data/masters/`）と、処理用の `site/js/data/masters.js`・`tests/fixtures/masters.json` が同じ中身か。CSV の読み書きの往復 |

## 期待値の作り直し

参照実装の `engine/` に `tools/reference/` の 2 本を置いて実行する（PowerShell 7）。

```
pwsh -NoProfile -File engine/Export-Golden.ps1 -Count 300 -Seed 1 -Out golden1.json -WithLabels
pwsh -NoProfile -Command "& ./tools/webcheck/Export-Scenario.ps1 -Out scenario.json -Masters masters.json -Files (<JSON のパス>)"
node tests/golden.mjs golden1.json      # 任意のファイルを直接渡せる
```

`Export-Golden.ps1` は、ランダムな事件を参照実装で計算し、事件と期待値を JSON で書く。
`Export-Scenario.ps1` は `tools/webcheck/` に置く（`engine/` を相対パスで読む）。

## 参照実装と合わせてある細部

- 丸めは PowerShell と同じ（`[Math]::Round(x, 6)` は偶数丸め、1 円未満は四捨五入、`[int]` は偶数丸め）。
- 文字列の並べ替えは .NET（ICU）と同じ順（記号は数字より前で `-` `:` `+` `>` `|` の順）。対象はエンジン内部の鍵だけ。
- 列和の表示は有効数字 15 桁（`1.1`、`1.33333333333333`）。
- 合算した債務（Phase 7）は入れた順を保つ（参照実装の `[ordered]@{}`）。
