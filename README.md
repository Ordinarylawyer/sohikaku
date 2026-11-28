# sohikaku

<p align="center"><img src="site/icon-192.png" width="128" height="128" alt="訴訟費用額計算機のアイコン（「訴訟費用」と表示した電卓のキャラクター）"></p>

訴訟費用額確定処分（民訴法71条）の計算をする Web アプリです（訴訟費用額計算機 Web 版）。**ブラウザの中だけで動き、入力した情報をどこにも送りません。**

- 書記官は、処分書（Word）と別紙計算書（Excel）を作れます。
- 申立人・代理人は、訴訟費用額確定処分申立書（Word）と費用計算書（Excel）を作れます（処分の見込み〔主文案〕も確かめられます）。

## 使い方

公開ページ: **https://ordinarylawyer.github.io/sohikaku/** をブラウザ（Edge・Chrome）で開き、STEP 1 から順に入れます。

手元で使うときは、このリポジトリを ZIP でダウンロードして展開し（GitHub の［Code］→［Download ZIP］）、`site/index.html` をダブルクリックして開きます。動きは公開ページと同じです。

続きをするときは STEP 10 で JSON ファイルを保存し、STEP 1 で読み込みます。

## 入力を外に出さないために

- 計算と Excel の作成は、すべてブラウザの中で行います。サーバーで動くものはありません。
- `index.html` の CSP（Content-Security-Policy）で、外部との通信を禁止しています（`connect-src 'none'` など）。
- 外部の CDN・フォント・アクセス解析は使いません。ブラウザの保存領域（localStorage など）・Cookie も使いません。閉じると入力は消えます。
- サーバー側には入力を受け取る仕組み（送信フォーム・データベースなど）がなく、入力の保存も、サーバーからのデータの取得もしません。ページを開いたときにプログラム・単価マスタ・ひな形を読み込むだけです。
- GitHub Pages で配信する場合、GitHub はセキュリティのために閲覧者の IP アドレスを記録します（[About GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages) の Data collection）。入力した内容は含まれません。
- 続きをするときの保存は、利用者が JSON ファイルを手元に保存し、STEP 1 で読み込む方式です（読込みもブラウザの中で行い、アップロードはしません）。JSON は暗号化されていないので、取扱いは所属の定めに従ってもらいます。画面の STEP 1・10 に「入力内容の扱いと、JSON による保存・復元について」の解説があります。
- これらは `tests/privacy.mjs` で確かめています。

## マスタ（単価・簡易裁判所）の直し方

マスタは、メンテ用の CSV と、アプリが読む JS の 2 つの形で持ち、中身をそろえておきます。直すのは CSV だけです。

| ファイル | 用途 |
|---|---|
| `data/masters/単価マスタ.csv` | 単価（項目コード・項目名・施行日・金額・廃止日・申立日基準）。**メンテ用** |
| `data/masters/簡易裁判所マスタ.csv` | 簡易裁判所（庁名・地家裁・高裁・所在地・緯度・経度）。**メンテ用** |
| `data/masters/version.txt` | マスタの版（yyyy-mm-dd）。画面の右上に出る |
| `site/js/data/masters.js` | アプリが読むデータ（**処理用**。CSV から作る。手で直さない） |

1. CSV を Excel などで直します（UTF-8・BOM 付き。日付は `yyyy-mm-dd`、空欄は値なし、「申立日基準」は「はい」か空欄）。額の改定は、同じ項目コードで新しい施行日の行を足します（旧い行はそのまま残す）。項目そのものがなくなるときは、その行に廃止日を入れます。附則で「施行日前に申し立てられた事件は従前の例による」とされた改定の行は、「申立日基準」を「はい」にします。版の日付も `version.txt` で直します。
2. `node tools/build-masters.mjs` で `site/js/data/masters.js`（とテスト用の `tests/fixtures/masters.json`）を作り直します。CSV に誤り（日付の書き方、「項目コード＋施行日」の重複など）があれば、行と列を示して止まります。
3. `node tests/run.mjs` でテストします。CSV と JS がずれているとテスト（`tests/masters.mjs`）が失敗します。作り直さずに同期だけ確かめるときは `node tools/build-masters.mjs --check` です。

## 中身

| 場所 | 内容 |
|---|---|
| `site/` | Web アプリ（HTML・CSS・JavaScript。ビルド不要） |
| `site/js/engine/` | 計算エンジン |
| `site/js/app/` | 画面（STEP 1〜10）と Word・Excel の作成 |
| `data/masters/` | マスタの CSV（メンテ用。上の「マスタの直し方」） |
| `site/js/data/` | 単価マスタ・簡易裁判所マスタ（CSV から作る）・Excel のひな形（`tools/` で作る） |
| `site/vendor/jszip.min.js` | JSZip 3.10.1（MIT。Word・Excel の読み書きに使う） |
| `tests/` | テスト（`node tests/run.mjs`）。参照実装の期待値との突き合わせなど |
| `docs/00_設計.md` | 設計 |

## 参考文献

『民事訴訟等の費用に関する書記官事務の研究』（書記官実務研究報告書15号。略して「書実研15号」）。画面の説明に頁を示しています。

## 誤りの報告・改善の提案

GitHub の Issue（[誤りの報告](https://github.com/Ordinarylawyer/sohikaku/issues/new?template=report.yml)／[改善の提案](https://github.com/Ordinarylawyer/sohikaku/issues/new?template=suggest.yml)）へお寄せください。アプリの各画面の「この画面について」の末尾からも開けます。直接直す場合の手順は [CONTRIBUTING.md](CONTRIBUTING.md) にあります。事件の当事者名・住所・事件番号など、個別の事件を特定できる情報は書かないでください。

## ライセンス

- プログラム（`site/`・`tools/`・`tests/` のコード）：[MIT License](LICENSE)
- データ（単価マスタ・簡易裁判所マスタ、ひな形、テスト用の事件、設計メモ、アイコン）：[CC0 1.0](LICENSE-DATA.md)（権利を主張しません）
- 同梱の JSZip 3.10.1：MIT License（GPLv3 との選択。[site/vendor/jszip.LICENSE.md](site/vendor/jszip.LICENSE.md)）

計算の結果や出力した書面は、利用者の責任で確かめてから使ってください。

