# CSV Desk

ブラウザ上で複数のCSVを編集し、開いているCSVをSQLiteテーブルとして扱ってSQLを実行できるツールです。

## 公開URL

https://naosim.github.io/csv-desk/

## 主な機能

- 複数CSVファイルをタブで管理
- 新規CSVの作成
- セル、行、列の編集
- 行・列の追加
- Undo / Redo
- CSVの保存・ダウンロード
- カンマ、ダブルクォート、セル内改行を含むRFC 4180形式のパース
- LF / CRLF改行コードの維持
- 先頭ゼロを含む文字列の値を保持
- 列型の自動推論
- SQLite Wasmによる複数テーブルへのSQL実行
- クエリ結果のCSV出力
- クエリ結果を編集用タブへ昇格

## 使用方法

1. 公開URLをブラウザで開く
2. 「新規作成」で空のCSVを作成するか、「CSVを開く」で既存CSVを読み込む
3. セルや列・行を編集する
4. 「保存」を押してCSVをダウンロードする
5. SQLエディタで `SELECT * FROM テーブル名` などのクエリを実行する

テーブル名にはファイル名から `.csv` を除いた名称が使われます。ファイル名に記号や数字が含まれる場合は、SQLで使用できる英数字とアンダースコアに変換されます。

## ローカル開発

必要環境:

- Node.js 24以上
- npm

```powershell
npm install
npm run dev
```

ブラウザで表示されたローカルURLを開いてください。

## テストとビルド

```powershell
npm test
npm run build
```

テストにはVitestを使用しています。ビルド結果は `dist/` に出力されます。

## デプロイ

`main` ブランチへのpush時に、GitHub Actionsがテスト・ビルドを実行してGitHub Pagesへデプロイします。
