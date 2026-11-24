// ui.js  画面表示とアニメーション
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const SYMBOL = { add: '+', sub: '-', mul: '×', div: '÷', mod: '%', neg: '-' };

  let model = null;   // { tokens, steps, rpn, code }
  let busy = false;   // アニメーション中
  let playing = false;

  // ------------------------------------------------------------
  // 「最初／戻る／次へ／最後」の操作ボタン
  // ------------------------------------------------------------
  function makeStepper(host, count, render, hint) {
    host.innerHTML = '';
    let k = 0, shown = -1;
    const bFirst = el('button', '', '⏮ 最初'), bPrev = el('button', '', '◀ 前');
    const bNext = el('button', 'primary', '次 ▶'), bLast = el('button', '', '最後 ⏭');
    const cnt = el('span', 'count');
    const go = n => {
      k = Math.max(0, Math.min(count - 1, n));
      render(k, shown);
      shown = k;
      bFirst.disabled = bPrev.disabled = k === 0;
      bNext.disabled = bLast.disabled = k === count - 1;
      cnt.textContent = 'ステップ ' + (k + 1) + ' / ' + count;
    };
    bFirst.onclick = () => go(0);
    bPrev.onclick = () => go(k - 1);
    bNext.onclick = () => go(k + 1);
    bLast.onclick = () => go(count - 1);
    host.append(bFirst, bPrev, bNext, bLast, cnt);
    if (hint) host.append(el('span', 'hint', hint));
    go(0);
  }

  const chipClass = text => /^-?\d+$/.test(text) ? 'chip num' : (text === '(' || text === ')') ? 'chip' : 'chip op';

  // ------------------------------------------------------------
  // ① 逆ポーランド記法への変換
  // ------------------------------------------------------------
  function render1(k, prevK) {
    const s = model.steps[k];
    const prev = prevK >= 0 && prevK === k - 1 ? model.steps[prevK] : null;  // 1 つ進んだときだけ強調
    const tk = $('tokens');
    tk.innerHTML = '';
    model.tokens.forEach((t, i) => {
      const c = el('div', chipClass(t.text), t.text);
      if (i < s.i) c.classList.add('done');
      if (i === s.i) c.classList.add('cur');
      tk.append(c);
    });
    const st = $('opStack');
    st.innerHTML = '';
    s.stack.forEach((label, i) => {
      const c = el('div', 'cell', label);
      if (prev && i >= prev.stack.length) c.classList.add('new');
      st.append(c);
    });
    const out = $('rpnOut');
    out.innerHTML = '';
    s.output.forEach((label, i) => {
      const c = el('div', chipClass(label), label);
      if (prev && i >= prev.output.length) c.classList.add('new');
      out.append(c);
    });
    $('msg1').textContent = s.msg;
    $('msg1').classList.toggle('ok', k === model.steps.length - 1);
  }

  // ------------------------------------------------------------
  // ② コード生成
  // ------------------------------------------------------------
  function insRow(ins, no) {
    const row = el('div', 'ins');
    row.append(el('span', 'arrow', '▶'), el('span', 'no', String(no)));
    const body = el('span', 'body');
    if (ins.op === 'push') {
      body.append(document.createTextNode('push '), el('span', 'arg', String(ins.arg)));
    } else {
      body.textContent = ins.op;
    }
    row.append(body);
    return row;
  }

  function render2(k, prevK) {
    // k = 生成済みの命令数
    const rp = $('rpn2');
    rp.innerHTML = '';
    model.rpn.forEach((r, i) => {
      const c = el('div', chipClass(r.text), r.text);
      if (i < k - 1) c.classList.add('done');
      if (i === k - 1) c.classList.add('cur');
      rp.append(c);
    });
    const cd = $('code2');
    cd.innerHTML = '';
    for (let i = 0; i < k; i++) {
      const row = insRow(model.code[i], i + 1);
      if (i === k - 1) { row.classList.add('cur'); if (prevK === k - 1) row.classList.add('new'); }
      cd.append(row);
    }
    let msg, hit = -1;
    if (k === 0) {
      msg = '逆ポーランド記法を左から順に読み、1 つの要素につき 1 つの命令を生成します。';
    } else {
      const ins = model.code[k - 1];
      if (ins.op === 'pop') {
        msg = '式の終わりです。スタックに残った計算結果を取り出すために pop を生成します。';
        hit = 8;
      } else if (ins.op === 'push') {
        msg = '数値 ' + ins.arg + ' → 「push ' + ins.arg + '」を生成します。';
        hit = 1;
      } else {
        const r = model.rpn[ins.src];
        msg = '演算子 ' + r.text + ' → 「' + ins.op + '」を生成します。';
        hit = { add: 2, sub: 3, mul: 4, div: 5, mod: 6, neg: 7 }[ins.op];
      }
      if (k === model.code.length) msg += ' これでコード生成は完了です。';
    }
    $('msg2').textContent = msg;
    $('msg2').classList.toggle('ok', k === model.code.length);
    document.querySelectorAll('table.rules tr').forEach((tr, i) => tr.classList.toggle('hit', i === hit));
  }

  // ------------------------------------------------------------
  // ③ 実行
  // ------------------------------------------------------------
  let pc = 0;            // 次に実行する命令の番号
  let halted = false;    // 実行時エラーで停止した
  let mstack = [];       // スタック（BigInt）
  let result = null;     // pop で取り出した値

  const dur = () => [900, 650, 450, 280, 150][$('xSpeed').value - 1];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function setSlot(slot, value, isNew) {
    slot.textContent = value === null ? '' : String(value);
    slot.classList.toggle('filled', value !== null);
    slot.classList.toggle('new', !!isNew && value !== null);
  }
  function clearAlu() {
    setSlot($('slotA'), null); setSlot($('slotB'), null); setSlot($('slotR'), null);
    $('slotA').classList.remove('off');
    $('slotOp').textContent = '';
  }

  function updateCodeMarks() {
    [...$('code3').children].forEach((row, i) => {
      row.classList.toggle('done', i < pc);
      row.classList.toggle('cur', i === pc && !halted);
    });
    $('xCount').textContent = 'ステップ ' + (pc + 1 > model.code.length ? model.code.length : pc + 1) + ' / ' + model.code.length + (halted ? '（エラー）' : pc >= model.code.length ? '（終了）' : '');
  }
  function updateButtons() {
    const end = pc >= model.code.length || halted;
    $('xReset').disabled = busy || pc === 0;
    $('xBack').disabled = busy || pc === 0;
    $('xStep').disabled = busy || end;
    $('xAuto').disabled = end && !playing;
    $('xAuto').textContent = playing ? '⏸ 停止' : '▶ 自動再生';
    $('btnBuild').disabled = busy;
  }
  function setMsg3(text, isErr) {
    $('msg3').textContent = text;
    $('msg3').classList.toggle('ng', !!isErr);
    $('msg3').classList.toggle('ok', !isErr && !!model && pc >= model.code.length);
  }
  function idleMessage() {
    if (pc >= model.code.length) return '実行終了。計算結果は ' + result + ' です。';
    if (pc === 0) return '「次 ▶」を押すと、▶ の付いた命令を 1 つ実行します。';
    return '次の命令は「' + SM.insText(model.code[pc]) + '」です。';
  }

  // 命令 n 個を実行し終えた状態を（アニメーションなしで）表示する
  function showState(n) {
    mstack = []; result = null; halted = false;
    for (let i = 0; i < n; i++) {
      const r = SM.execute(model.code[i], mstack);
      if (r.kind === 'pop') result = r.value;
    }
    pc = n;
    const st = $('stack');
    st.innerHTML = '';
    mstack.forEach(v => st.append(el('div', 'cell', String(v))));
    clearAlu();
    setSlot($('slotOut'), result);
    updateCodeMarks();
    setMsg3(idleMessage());
    updateButtons();
  }

  // 数値が from から to へ移動するアニメーション
  async function fly(text, from, to, cls) {
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const d = el('div', 'fly' + (cls ? ' ' + cls : ''), text);
    d.style.left = a.left + 'px'; d.style.top = a.top + 'px';
    d.style.width = a.width + 'px'; d.style.height = a.height + 'px';
    document.body.append(d);
    const anim = d.animate([
      { transform: 'translate(0,0)', width: a.width + 'px', height: a.height + 'px' },
      { transform: 'translate(' + (b.left - a.left) + 'px,' + (b.top - a.top) + 'px)', width: b.width + 'px', height: b.height + 'px' }
    ], { duration: dur(), easing: 'ease-in-out', fill: 'forwards' });
    try { await anim.finished; } catch (e) { /* 中断されても続行 */ }
    d.remove();
  }

  const topCell = () => $('stack').lastElementChild;

  // スタックのトップを取り出して to へ運ぶ
  async function popTo(to, value, cls) {
    const c = topCell();
    c.style.visibility = 'hidden';
    await fly(String(value), c, to, cls);
    c.remove();
    setSlot(to, value);
  }
  // from にある値をスタックに積む
  async function pushFrom(from, value, cls) {
    const c = el('div', 'cell', String(value));
    c.style.visibility = 'hidden';
    $('stack').append(c);
    await fly(String(value), from, c, cls);
    c.style.visibility = '';
  }

  async function stepAnimated() {
    if (busy || pc >= model.code.length || halted) return;
    busy = true; updateButtons();
    const ins = model.code[pc];
    const row = $('code3').children[pc];
    row.scrollIntoView({ block: 'nearest' });
    clearAlu();
    let r;
    try {
      r = SM.execute(ins, mstack);
    } catch (e) {
      if (!e || !e.runtime) throw e;
      halted = true; playing = false; busy = false;
      setMsg3('実行時エラー：' + e.message + ' ここで実行を停止します。', true);
      updateCodeMarks(); row.classList.add('cur'); updateButtons();
      return;
    }
    const pause = () => sleep(dur() * 0.6);

    if (r.kind === 'push') {
      setMsg3('push ' + r.value + '：定数 ' + r.value + ' をスタックに積みます。');
      await pushFrom(row.querySelector('.arg'), r.value);
    } else if (r.kind === 'pop') {
      setMsg3('pop：スタックのトップから ' + r.value + ' を取り出します。これが計算結果です。');
      setSlot($('slotOut'), null);
      await popTo($('slotOut'), r.value, 'res');
      result = r.value;
    } else if (r.kind === 'un') {
      $('slotA').classList.add('off');
      $('slotOp').textContent = SYMBOL.neg;
      setMsg3('neg：スタックから ' + r.b + ' を取り出し、符号を反転します。');
      await popTo($('slotB'), r.b);
      await pause();
      setSlot($('slotR'), r.result, true);
      setMsg3('neg：-(' + r.b + ') = ' + r.result + ' をスタックに積みます。');
      await pause();
      await pushFrom($('slotR'), r.result, 'res');
      clearAlu();
    } else {
      const sym = SYMBOL[ins.op];
      $('slotOp').textContent = sym;
      setMsg3(ins.op + '：まずスタックのトップから ' + r.b + ' を取り出します（演算の右側）。');
      await popTo($('slotB'), r.b);
      setMsg3(ins.op + '：続けて ' + r.a + ' を取り出します（演算の左側）。');
      await popTo($('slotA'), r.a);
      await pause();
      setSlot($('slotR'), r.result, true);
      const fmt = v => v < 0n ? '(' + v + ')' : String(v);
      setMsg3(ins.op + '：' + fmt(r.a) + ' ' + sym + ' ' + fmt(r.b) + ' = ' + r.result + ' を計算し、結果をスタックに積みます。');
      await pause();
      await pushFrom($('slotR'), r.result, 'res');
      clearAlu();
    }
    pc++;
    busy = false;
    updateCodeMarks();
    if (pc >= model.code.length) { playing = false; setMsg3(idleMessage()); }
    updateButtons();
  }

  async function autoRun() {
    if (playing) { playing = false; updateButtons(); return; }
    if (busy) return;
    playing = true; updateButtons();
    while (playing && pc < model.code.length && !halted) {
      await stepAnimated();
      if (playing && pc < model.code.length) await sleep(dur() * 0.5);
    }
    playing = false; updateButtons();
  }

  $('xStep').onclick = () => { playing = false; stepAnimated(); };
  $('xAuto').onclick = autoRun;
  $('xReset').onclick = () => { if (!busy) showState(0); };
  $('xBack').onclick = () => { if (!busy && pc > 0) showState(halted ? pc : pc - 1); };

  // ------------------------------------------------------------
  // 入力 → 全体の組み立て
  // ------------------------------------------------------------
  function showError(src, err) {
    const e = $('error');
    e.textContent = '構文エラー：' + err.message + '\n\n  ' + src + '\n  ' + ' '.repeat(Math.max(0, err.pos)) + '^';
    e.hidden = false;
    ['sec1', 'sec2', 'sec3'].forEach(id => { $(id).hidden = true; });
  }

  function build() {
    if (busy) return;
    playing = false;
    const src = $('expr').value;
    $('error').hidden = true;
    let tokens, r;
    try {
      tokens = SM.tokenize(src);
    } catch (e) {
      if (e && e.pos !== undefined) { showError(src, e); return; }
      throw e;
    }
    r = SM.toRPN(tokens);
    if (r.error) { showError(src, r.error); return; }
    model = { tokens: tokens, steps: r.steps, rpn: r.rpn, code: SM.codegen(r.rpn) };
    ['sec1', 'sec2', 'sec3'].forEach(id => { $(id).hidden = false; });

    makeStepper($('ctl1'), model.steps.length, render1, '入力を左から読み、演算子スタックを使って並べ替えます（操車場アルゴリズム）。');
    makeStepper($('ctl2'), model.code.length + 1, render2, '逆ポーランド記法の要素 1 つにつき 1 命令を生成します。');

    const cd = $('code3');
    cd.innerHTML = '';
    model.code.forEach((ins, i) => cd.append(insRow(ins, i + 1)));
    showState(0);
  }

  $('btnBuild').onclick = build;
  $('expr').addEventListener('keydown', e => { if (e.key === 'Enter') build(); });
  document.querySelectorAll('button.ex').forEach(b => {
    b.onclick = () => { $('expr').value = b.textContent; build(); };
  });
  build();
})();
