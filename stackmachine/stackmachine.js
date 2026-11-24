// stackmachine.js
// 中核ロジック（画面表示に依存しない部分）
//   tokenize : 入力文字列 → トークン列（字句解析）
//   toRPN    : トークン列 → 逆ポーランド記法（操車場アルゴリズム）＋途中経過
//   codegen  : 逆ポーランド記法 → スタックマシンのコード
//   execute  : 1 命令の実行
(function (global) {
  'use strict';

  // 演算子の優先順位（数値が大きいほど強く結合する）
  const PREC = { 'neg': 3, '*': 2, '/': 2, '%': 2, '+': 1, '-': 1 };
  // 二項演算子 → スタックマシンの命令
  const OPCODE = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', 'neg': 'neg' };

  function SyntaxErr(message, pos) {
    return { message: message, pos: pos };
  }

  // ---------------------------------------------------------------
  // 字句解析
  //   num : 整数定数（オペランドの位置で数字の直前にある - は負の定数の符号とみなす）
  //   op  : + - * / %
  //   lp / rp : 括弧
  // ---------------------------------------------------------------
  function tokenize(src) {
    const tokens = [];
    let i = 0;
    const isDigit = c => c >= '0' && c <= '9';
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '　') { i++; continue; }
      const prev = tokens.length ? tokens[tokens.length - 1] : null;
      // 直前が「なし・演算子・開き括弧」なら、次はオペランドが来る位置
      const operandPos = !prev || prev.type === 'op' || prev.type === 'lp';
      if (isDigit(c) || (c === '-' && operandPos && i + 1 < src.length && isDigit(src[i + 1]))) {
        let j = i + 1;
        while (j < src.length && isDigit(src[j])) j++;
        const text = src.slice(i, j);
        tokens.push({ type: 'num', value: BigInt(text), text: String(BigInt(text)), pos: i });
        i = j;
      } else if ('+-*/%'.indexOf(c) >= 0) {
        tokens.push({ type: 'op', op: c, text: c, pos: i });
        i++;
      } else if (c === '(') {
        tokens.push({ type: 'lp', text: '(', pos: i }); i++;
      } else if (c === ')') {
        tokens.push({ type: 'rp', text: ')', pos: i }); i++;
      } else {
        throw SyntaxErr('使えない文字「' + c + '」があります。', i);
      }
    }
    if (tokens.length === 0) throw SyntaxErr('式が入力されていません。', 0);
    return tokens;
  }

  // ---------------------------------------------------------------
  // 逆ポーランド記法への変換（操車場アルゴリズム）
  //   戻り値 { steps, rpn, error }
  //   steps[k] = { i, stack, output, msg }  … k 手目を終えた時点の状態
  //     i      : 処理したトークンの番号（-1 は開始前、tokens.length は入力終了後）
  //     stack  : 演算子スタックの表示用ラベル列（末尾がトップ）
  //     output : 出力（逆ポーランド記法）の表示用ラベル列
  // ---------------------------------------------------------------
  function toRPN(tokens) {
    const steps = [];
    const stack = [];   // { label, op } または { label:'(' , lp:true, pos }
    const output = [];  // { kind:'num', value, text } | { kind:'op', op, text }
    const snap = (i, msg) => steps.push({
      i: i,
      stack: stack.map(s => s.label),
      output: output.map(o => o.text),
      msg: msg
    });
    const popToOutput = () => {
      const s = stack.pop();
      output.push({ kind: 'op', op: s.op, text: s.label });
      return s;
    };

    snap(-1, '入力を左から 1 トークンずつ読みます。数値はそのまま出力へ、演算子はいったん演算子スタックに積みます。');

    let expectOperand = true;   // 次にオペランド（数値・括弧・単項演算子）が来るべきか
    try {
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === 'num') {
          if (!expectOperand) throw SyntaxErr('数値「' + t.text + '」の前に演算子が必要です。', t.pos);
          output.push({ kind: 'num', value: t.value, text: t.text });
          snap(i, '数値 ' + t.text + ' はそのまま出力します。');
          expectOperand = false;
        } else if (t.type === 'op') {
          if (expectOperand) {
            // 単項演算子
            if (t.op === '+') {
              snap(i, '単項の + は値を変えないので、何も出力せずに読み飛ばします。');
            } else if (t.op === '-') {
              stack.push({ label: 'neg', op: 'neg' });
              snap(i, '単項の - です。二項の - と区別するため neg と書き、演算子スタックに積みます（単項演算子は最も優先順位が高い）。');
            } else {
              throw SyntaxErr('演算子「' + t.op + '」の左側にオペランドがありません。', t.pos);
            }
          } else {
            // 二項演算子（すべて左結合）
            while (stack.length && !stack[stack.length - 1].lp &&
                   PREC[stack[stack.length - 1].op] >= PREC[t.op]) {
              const s = popToOutput();
              snap(i, 'スタックトップの ' + s.label + ' は ' + t.op + ' と優先順位が' +
                (PREC[s.op] > PREC[t.op] ? 'より高い' : '同じ（左結合）') +
                'ので、先に計算されます。スタックから取り出して出力します。');
            }
            stack.push({ label: t.op, op: t.op });
            snap(i, '演算子 ' + t.op + ' を演算子スタックに積みます。');
            expectOperand = true;
          }
        } else if (t.type === 'lp') {
          if (!expectOperand) throw SyntaxErr('「(」の前に演算子が必要です。', t.pos);
          stack.push({ label: '(', lp: true, pos: t.pos });
          snap(i, '開き括弧 ( は目印として演算子スタックに積みます。');
        } else if (t.type === 'rp') {
          if (expectOperand) throw SyntaxErr('「)」の前にオペランドがありません。', t.pos);
          while (stack.length && !stack[stack.length - 1].lp) {
            const s = popToOutput();
            snap(i, '閉じ括弧 ) が来たので、( に出会うまで演算子を取り出して出力します： ' + s.label);
          }
          if (!stack.length) throw SyntaxErr('「)」に対応する「(」がありません。', t.pos);
          stack.pop();
          snap(i, '対応する ( をスタックから取り除きます。括弧は出力しません。');
          expectOperand = false;
        }
      }
      const endPos = tokens[tokens.length - 1].pos + tokens[tokens.length - 1].text.length;
      if (expectOperand) throw SyntaxErr('式が途中で終わっています（オペランドが必要です）。', endPos);
      while (stack.length) {
        if (stack[stack.length - 1].lp) {
          throw SyntaxErr('「(」に対応する「)」がありません。', stack[stack.length - 1].pos);
        }
        const s = popToOutput();
        snap(tokens.length, '入力が終わったので、スタックに残っている演算子を順に取り出して出力します： ' + s.label);
      }
      snap(tokens.length, '変換完了。逆ポーランド記法は  ' + output.map(o => o.text).join(' ') + '  です。');
    } catch (e) {
      if (e && e.message !== undefined && e.pos !== undefined) return { steps: steps, rpn: null, error: e };
      throw e;
    }
    return { steps: steps, rpn: output, error: null };
  }

  // ---------------------------------------------------------------
  // コード生成
  //   数値 n → push n、演算子 → 対応する命令、最後に pop（結果の取り出し）
  //   戻り値 [{ op, arg?, src }]   src は元になった RPN の要素番号（最後の pop は -1）
  // ---------------------------------------------------------------
  function codegen(rpn) {
    const code = [];
    rpn.forEach((r, k) => {
      if (r.kind === 'num') code.push({ op: 'push', arg: r.value, src: k });
      else code.push({ op: OPCODE[r.op], src: k });
    });
    code.push({ op: 'pop', src: -1 });
    return code;
  }

  function insText(ins) {
    return ins.op === 'push' ? 'push ' + ins.arg : ins.op;
  }

  // ---------------------------------------------------------------
  // 1 命令の実行。stack（BigInt の配列、末尾がトップ）を書き換える。
  //   戻り値 { kind:'push', value } | { kind:'pop', value }
  //        | { kind:'bin', a, b, result } | { kind:'un', b, result }
  //   実行時エラーは { runtime:true, message } を throw
  // ---------------------------------------------------------------
  function execute(ins, stack) {
    const need = n => {
      if (stack.length < n) throw { runtime: true, message: 'スタックが空です（' + ins.op + ' を実行できません）。' };
    };
    switch (ins.op) {
      case 'push':
        stack.push(ins.arg);
        return { kind: 'push', value: ins.arg };
      case 'pop': {
        need(1);
        return { kind: 'pop', value: stack.pop() };
      }
      case 'neg': {
        need(1);
        const b = stack.pop();
        const r = -b;
        stack.push(r);
        return { kind: 'un', b: b, result: r };
      }
      default: {
        need(2);
        const b = stack[stack.length - 1], a = stack[stack.length - 2];
        if ((ins.op === 'div' || ins.op === 'mod') && b === 0n) {
          throw { runtime: true, message: '0 で割ることはできません（' + a + ' ' + ins.op + ' 0）。' };
        }
        stack.pop(); stack.pop();
        let r;
        switch (ins.op) {
          case 'add': r = a + b; break;
          case 'sub': r = a - b; break;
          case 'mul': r = a * b; break;
          case 'div': r = a / b; break;   // BigInt の除算は 0 方向への切り捨て
          case 'mod': r = a % b; break;   // 符号は割られる数に従う
          default: throw { runtime: true, message: '未定義の命令 ' + ins.op };
        }
        stack.push(r);
        return { kind: 'bin', a: a, b: b, result: r };
      }
    }
  }

  global.SM = { tokenize: tokenize, toRPN: toRPN, codegen: codegen, execute: execute, insText: insText, PREC: PREC };
})(typeof window !== 'undefined' ? window : globalThis);
