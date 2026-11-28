# 誤りの報告・改善の提案のしかた

## Issue で知らせる

- 誤りを見つけたときは「[誤りの報告](https://github.com/Ordinarylawyer/sohikaku/issues/new?template=report.yml)」、使い勝手や機能の提案は「[改善の提案](https://github.com/Ordinarylawyer/sohikaku/issues/new?template=suggest.yml)」から Issue を作ってください。
- アプリの各画面の「この画面について」の末尾と、画面下の「誤りの報告・改善の提案」からも開けます（画面〔STEP〕と単価マスタの版が入った状態になります）。
- **事件の当事者名・住所・事件番号など、個別の事件を特定できる情報は書かないでください。** 入力内容の JSON もそのまま貼らないでください。計算例を示すときは、架空の事例に置き換えてください。

## 直接直す（Pull Request）

### 何を直すか（どのファイルを直すか）

| 直したいもの | 直すファイル |
|---|---|
| 単価（項目・額・施行日・廃止日・申立日基準）とマスタの版 | `data/masters/単価マスタ.csv`・`data/masters/version.txt` |
| 簡易裁判所（庁名・所在地・緯度経度など） | `data/masters/簡易裁判所マスタ.csv` |
| 計算（費用の集計・案分・相殺・旅費日当など） | `site/js/engine/` |
| 画面・説明文 | `site/js/app/`・`site/css/` |
| 処分書・申立書（Word）の文言・体裁 | `site/js/app/word.js` |
| 計算書（Excel）のひな形 | `tools/template/` のひな形（直したら `node tools/build-template.mjs`） |

`site/js/data/masters.js`・`site/js/data/template.js`・`tests/fixtures/masters.json` は自動で作るファイルです。直接は直さないでください。

### 手順

1. 上のファイルを直します。CSV は UTF-8（BOM 付き）のまま保存してください（日付は `yyyy-mm-dd`、空欄は値なし）。
2. マスタを直したときは `node tools/build-masters.mjs` を実行します（CSV に誤りがあれば、行と列を示して止まります）。
3. `node tests/run.mjs` を実行し、`ALL PASS` になることを確かめます（Node.js 18 以上。追加のパッケージは要りません）。
4. 自動で作られたファイルも含めて commit し、Pull Request を作ります。
5. Pull Request には、根拠（法令・規則・告示、書実研15号の頁などと、確認した日）を書いてください。計算を変えるときは、テストに架空の事例と期待値を足してください。

### 守ってほしいこと

- 入力した情報をブラウザの外に出さない作りを崩さないでください。外部との通信（fetch など）・ブラウザの保存領域・Cookie・外部の CDN やフォント・アクセス解析は使いません（`tests/privacy.mjs` が確かめます）。
- テスト用の事件は架空のものにしてください。実際の事件の当事者名・住所・事件番号は入れないでください。実際の事件をもとにする場合は、名前などを伏せるだけでなく、期日の日付・回数、金額、審級の始まりの日など、組み合わせると事件が分かる情報も変えてください。
