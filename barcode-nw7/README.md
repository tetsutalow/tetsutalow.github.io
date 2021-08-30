# バーコードだけを画面に表示したい時に使うやつ
NW-7(Codabar)を使って任意のデータを出来るだけ大きく（横幅を考えて）表示するためのもの。
スマホで開けるURLにすると、スマホにバーコードだけを表示することができます。
例えばイベントなどで参加証をメール送付する時に、受付番号をこのURLで送れば、
参加者は受付でこのURLをクリックすることで画面にバーコードを表示できるので、
それをPCのバーコードリーダで読み込んで受け付けるなどの対応が可能になります。

バーコードはブラウザの表示幅を基準にできるだけ幅いっぱいに表示されるように
Narrow Barのピクセル幅を調整していますが、あまり大きくなりすぎないように
最大のNarrow Bar幅を指定できます（デフォルトは5　ただしNarrow Bar幅はこの値の2倍）。

なおバーコード表示には[JsBarcode](https://github.com/lindell/JsBarcode)を利用しています。ただオリジナルはNarrowとWideの比が1:2でマージンが少ないので、1:2.5になるように改造しています。

## 使用例

https://tetsutalow.github.io/barcode-nw7/?DATA=12345678
![image](https://user-images.githubusercontent.com/10404440/131297956-1e479a68-eceb-49a5-81cf-a09d0b3e239a.png)

https://tetsutalow.github.io/barcode-nw7/?DATA=A06-1234-5678B&TITLE=電話番号&MAXW=3

![image](https://user-images.githubusercontent.com/10404440/131298053-83467454-8380-464f-bafa-20b5eeef1852.png)

https://tetsutalow.github.io/barcode-nw7/?DATA=0032&TITLE=%E5%8F%97%E4%BB%98%E7%95%AA%E5%8F%B7&MAXW=7&BHEIGHT=150&NOCAPTION=1

![image](https://user-images.githubusercontent.com/10404440/131298122-5d7f2916-ff37-4d15-84de-379b05cc3b94.png)

URLパラメータのDATAがない場合は手動でバーコードを作るフォーム画面が表示されます。

## オプション一覧
<DL>
  <DT>DATA</DT>
  <DD>表示するデータ。数値の他にNW-7の記号がいくつか記号が使える(+-/$:)。NW-7はスタートストップキャラクタにA-Dの4通りが選べるので、データをA123Bなどとすることもできる。データにスタート・ストップキャラクタがない時はどちらもAになる</DD>
  <DT>MAXW</DT>
  <DD>バーコードのピクセルの基本幅の最大値。指定しない場合には5になる。</DD>
  <DT>BHEIGHT</DT>
  <DD>バーコードの高さ。指定しない場合には200になる。</DD>
  <DT>TITLE</DT>
  <DD>バーコードの上に表示するテキスト。URLに指定する時にはURLエンコードする。指定しない場合には何も表示しない。</DD>
  <DT>NOCAPTION</DT>
  <DD>何らかの値を代入するとバーコードの下にデータを表示しない。</DD>
</DL>
