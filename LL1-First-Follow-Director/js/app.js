/* =========================================================
 * app.js
 *   画面の組み立てとステップ操作
 * ========================================================= */
'use strict';

/* ---------- 小さな DOM ヘルパ ---------- */
function h(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  if (!Array.isArray(children)) children = [children];
  for (const c of children) if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}
const $ = id => document.getElementById(id);
const setStr = a => `{${a.join(', ')}}`;
function setEl(items, mark = {}) {
  // mark: { new: Set, common: Set, dim: Set }
  const out = [document.createTextNode('{')];
  items.forEach((x, i) => {
    if (i) out.push(document.createTextNode(', '));
    let cls = 'elem';
    if (mark.new && mark.new.has(x)) cls += ' new';
    if (mark.common && mark.common.has(x)) cls += ' common';
    if (mark.dim && mark.dim.has(x)) cls += ' dim';
    out.push(h('span', { class: cls }, x));
  });
  out.push(document.createTextNode('}'));
  return h('span', {}, out);
}
const symEl = (x, g) => h('span', { class: 'sym ' + (g.ntSet.has(x) ? 'nt' : 't') }, x);
const prodStr = p => `${p.lhs} → ${showSeq(p.rhs)}`;

/* ---------- ステッパ ---------- */
function makeStepper(container, n, onStep, labels) {
  let cur = 0;
  const pos = h('span', { class: 'pos' });
  const range = h('input', { type: 'range', min: 0, max: n - 1, value: 0, oninput: e => set(+e.target.value) });
  const bFirst = h('button', { onclick: () => set(0) }, '|◀ 最初');
  const bPrev = h('button', { onclick: () => set(cur - 1) }, '◀ 前へ');
  const bNext = h('button', { onclick: () => set(cur + 1) }, '次へ ▶');
  const bLast = h('button', { onclick: () => set(n - 1) }, '最後 ▶|');
  function set(i) {
    cur = Math.max(0, Math.min(n - 1, i));
    range.value = cur;
    pos.textContent = labels ? labels(cur) : `${cur + 1} / ${n}`;
    bFirst.disabled = bPrev.disabled = cur === 0;
    bNext.disabled = bLast.disabled = cur === n - 1;
    onStep(cur);
  }
  container.replaceChildren(bFirst, bPrev, bNext, bLast, range, pos);
  set(0);
  return { set, get cur() { return cur; } };
}

/* ---------- First(α) の計算過程の説明 ---------- */
function explainSeqFirst(seq, state, g, label) {
  // state: Map nt -> array（その時点の First 集合）
  const lines = [];
  if (!seq.length) { lines.push(h('p', {}, [h('span', { class: 'formula' }, `First(ε) = {ε}`)])); return lines; }
  const x = seq[0];
  if (!g.ntSet.has(x)) {
    lines.push(h('p', {}, [h('span', { class: 'formula' }, `First(${showSeq(seq)}) = {${x}}`), '　（先頭が終端記号 ' + x + '）']));
    return lines;
  }
  let acc = [];
  for (let k = 0; k < seq.length; k++) {
    const y = seq[k];
    const rest = seq.slice(k + 1);
    if (!g.ntSet.has(y)) {
      lines.push(h('p', {}, [h('span', { class: 'formula' }, `First(${showSeq(seq.slice(k))}) = {${y}}`), '　（先頭が終端記号）']));
      acc = [...new Set([...acc, y])];
      break;
    }
    const fy = state.get(y);
    const hasEps = fy.includes(EPS);
    if (!hasEps) {
      lines.push(h('p', {}, [h('span', { class: 'formula' }, `First(${y}) = ${setStr(fy)}`), ' に ε は含まれないので ', h('span', { class: 'formula' }, `First(${showSeq(seq.slice(k))}) = First(${y})`)]));
      acc = [...new Set([...acc, ...fy])];
      break;
    }
    if (!rest.length) {
      lines.push(h('p', {}, [h('span', { class: 'formula' }, `First(${y}) = ${setStr(fy)}`), ' に ε が含まれ，後ろに何もないので ', h('span', { class: 'formula' }, `First(${y}) = ${setStr(fy)}`), '（ε を含む）']));
      acc = [...new Set([...acc, ...fy])];
      break;
    }
    lines.push(h('p', {}, [h('span', { class: 'formula' }, `First(${y}) = ${setStr(fy)}`), ' に ε が含まれるので ', h('span', { class: 'formula' }, `First(${showSeq(seq.slice(k))}) = (First(${y}) − {ε}) ∪ First(${showSeq(rest)})`)]));
    acc = [...new Set([...acc, ...fy.filter(z => z !== EPS)])];
  }
  const result = [...new Set(acc)];
  lines.push(h('p', {}, [h('b', {}, `よって ${label || 'First(' + showSeq(seq) + ')'} = ${setStr(result)}`)]));
  return lines;
}

/* ---------- 集合の表 ---------- */
function setsTable(title, g, state, hlNt, newElems) {
  const rows = g.nts.map(a => h('tr', { class: a === hlNt ? 'hl' : '' }, [
    h('td', {}, `${title}(${a})`),
    h('td', { class: 'set' }, setEl(state.get(a), { new: a === hlNt ? new Set(newElems || []) : null })),
  ]));
  return h('table', { class: 'sets' }, [h('thead', {}, h('tr', {}, [h('th', {}, '非終端記号'), h('th', {}, '集合')])), h('tbody', {}, rows)]);
}

/* ---------- 文法の表示 ---------- */
function grammarTable(g, hlProds = [], ngProds = []) {
  return h('table', { class: 'prods' }, g.prods.map(p => h('tr', { class: hlProds.includes(p.id) ? 'hl' : ngProds.includes(p.id) ? 'ng' : '' }, [
    h('td', { class: 'num' }, `(${p.id + 1})`),
    h('td', {}, p.lhs), h('td', {}, '→'), h('td', {}, showSeq(p.rhs)),
  ])));
}

/* =========================================================
 * 解析の実行
 * ========================================================= */
let G = null, AN = null;

function runAnalysis() {
  const text = $('grammar').value;
  const startSel = $('start');
  const g = parseGrammar(text, startSel.value);
  const msgs = $('messages');
  msgs.replaceChildren();
  for (const e of g.errors) msgs.appendChild(h('div', { class: 'err' }, e));
  for (const w of g.warnings) msgs.appendChild(h('div', { class: 'warn' }, w));

  // 開始記号の選択肢
  const prev = startSel.value;
  startSel.replaceChildren(...g.nts.map(a => h('option', { value: a }, a)));
  startSel.value = g.nts.includes(prev) ? prev : g.start;

  if (g.errors.length) { $('results').hidden = true; $('grammar-view').replaceChildren(); return; }
  G = g; AN = analyzeGrammar(g);
  renderGrammar();
  renderFirst();
  renderFollow();
  renderDirector();
  renderLL1();
  renderParseSection();
  $('results').hidden = false;
}

function renderGrammar() {
  const g = G;
  $('grammar-view').replaceChildren(
    h('h3', { style: 'margin-top:0' }, '読み込んだ生成規則'),
    grammarTable(g),
    h('div', { class: 'symlist' }, [h('b', {}, '非終端記号:'), ...g.nts.map(a => symEl(a, g)), h('span', {}, `　開始記号: ${g.start}`)]),
    h('div', { class: 'symlist' }, [h('b', {}, '終端記号:'), ...g.terminals.map(a => symEl(a, g))]),
  );
}

/* ---------- 1. First ---------- */
function renderFirst() {
  const g = G, R = AN.firstRes;
  const steps = [{ kind: 'init' }];
  R.rounds.forEach((r, ri) => {
    r.adds.forEach(a => steps.push({ kind: 'add', round: ri + 1, a }));
    if (!r.adds.length) steps.push({ kind: 'done', round: ri + 1 });
  });
  const stateAt = i => {
    const st = new Map(g.nts.map(a => [a, []]));
    for (let k = 1; k <= i; k++) if (steps[k].kind === 'add') { const a = steps[k].a; st.set(g.prods[a.prod].lhs, [...st.get(g.prods[a.prod].lhs), ...a.added]); }
    return st;
  };
  makeStepper($('st-first'), steps.length, i => {
    const s = steps[i], desc = $('first-desc');
    if (s.kind === 'init') {
      desc.replaceChildren(h('p', {}, '最初はすべての非終端記号の First 集合を空集合にしておく。生成規則を順に見て、X → α の First(α) を First(X) に加えていく。'), grammarTable(g));
      $('first-table').replaceChildren(setsTable('First', g, stateAt(i)));
    } else if (s.kind === 'add') {
      const p = g.prods[s.a.prod], before = stateAt(i - 1);
      desc.replaceChildren(
        h('p', {}, [h('b', {}, `ラウンド ${s.round}：生成規則 (${p.id + 1}) `), h('span', { class: 'formula' }, prodStr(p))]),
        ...explainSeqFirst(p.rhs, before, g),
        h('p', {}, [`First(${p.lhs}) = ${setStr(before.get(p.lhs))} に加えると，新たに `, setEl(s.a.added, { new: new Set(s.a.added) }), ' が追加される。']),
        grammarTable(g, [p.id]),
      );
      $('first-table').replaceChildren(setsTable('First', g, stateAt(i), p.lhs, s.a.added));
    } else {
      desc.replaceChildren(
        h('p', {}, [h('b', {}, `ラウンド ${s.round}：`), 'すべての生成規則を調べても追加されるものがなくなった。', h('span', { class: 'ok' }, ' First 集合が確定。')]),
        ...g.nts.map(a => h('p', {}, h('span', { class: 'formula' }, `First(${a}) = ${setStr(R.first.has(a) ? [...R.first.get(a)] : [])}`))),
      );
      $('first-table').replaceChildren(setsTable('First', g, stateAt(i)));
    }
  }, i => `手順 ${i + 1} / ${steps.length}`);
}

/* ---------- 2. Follow ---------- */
function renderFollow() {
  const g = G, R = AN.followRes, first = AN.firstRes.first;
  const firstState = new Map(g.nts.map(a => [a, [...first.get(a)]]));
  const steps = [{ kind: 'start' }];
  R.rounds.forEach((r, ri) => {
    r.adds.forEach(a => steps.push({ kind: a.kind, round: ri, a }));
    if (!r.adds.length) steps.push({ kind: 'done', round: ri });
  });
  const stateAt = i => {
    const st = new Map(g.nts.map(a => [a, []]));
    for (let k = 1; k <= i; k++) { const a = steps[k].a; if (a) st.set(a.nt, [...st.get(a.nt), ...a.added]); }
    return st;
  };
  makeStepper($('st-follow'), steps.length, i => {
    const s = steps[i], desc = $('follow-desc'), tbl = $('follow-table');
    if (s.kind === 'start') {
      desc.replaceChildren(h('p', {}, '最初はすべての非終端記号の Follow 集合を空集合にしておく。First 集合は確定したものを使う。'), setsTable('First', g, firstState));
      tbl.replaceChildren(setsTable('Follow', g, stateAt(i)));
      return;
    }
    if (s.kind === 'init') {
      desc.replaceChildren(h('p', {}, [`開始記号 ${s.a.nt} について Follow(${s.a.nt}) に `, h('span', { class: 'elem new' }, END), ' を加える（$ は読み込み終わりを表す特殊記号）。']));
      tbl.replaceChildren(setsTable('Follow', g, stateAt(i), s.a.nt, s.a.added));
      return;
    }
    if (s.kind === 'done') {
      desc.replaceChildren(
        h('p', {}, [h('b', {}, `ラウンド ${s.round}：`), 'すべての生成規則を調べても追加されるものがなくなった。', h('span', { class: 'ok' }, ' Follow 集合が確定。')]),
        ...g.nts.map(a => h('p', {}, h('span', { class: 'formula' }, `Follow(${a}) = ${setStr([...R.follow.get(a)])}`))),
      );
      tbl.replaceChildren(setsTable('Follow', g, stateAt(i)));
      return;
    }
    const a = s.a, p = g.prods[a.prod], before = stateAt(i - 1);
    const alpha = p.rhs.slice(0, a.pos), beta = a.beta;
    const head = [
      h('p', {}, [h('b', {}, `ラウンド ${s.round}：生成規則 (${p.id + 1}) `), h('span', { class: 'formula' }, prodStr(p)), ` を A → αBβ の形で見る（B = ${a.nt}，α = ${showSeq(alpha)}，β = ${showSeq(beta)}）。`]),
    ];
    if (s.kind === 'first') {
      desc.replaceChildren(...head,
        ...explainSeqFirst(beta, firstState, g, `First(β) = First(${showSeq(beta)})`),
        h('p', {}, [`First(β) から ε を除いた ${setStr(a.set)} を Follow(${a.nt}) = ${setStr(before.get(a.nt))} に加えると，新たに `, setEl(a.added, { new: new Set(a.added) }), ' が追加される。']),
        grammarTable(g, [p.id]));
    } else {
      desc.replaceChildren(...head,
        h('p', {}, beta.length ? `First(β) = First(${showSeq(beta)}) に ε が含まれる（β ⇒* ε）ので，` : 'β = ε なので，'),
        h('p', {}, [`Follow(A) = Follow(${p.lhs}) = ${setStr(before.get(p.lhs))} を Follow(${a.nt}) = ${setStr(before.get(a.nt))} に加えると，新たに `, setEl(a.added, { new: new Set(a.added) }), ' が追加される。']),
        grammarTable(g, [p.id]));
    }
    tbl.replaceChildren(setsTable('Follow', g, stateAt(i), a.nt, a.added));
  }, i => `手順 ${i + 1} / ${steps.length}`);
}

/* ---------- 3. Director ---------- */
function directorTable(g, upto, hl) {
  const rows = g.prods.map((p, k) => {
    const d = AN.director[k];
    return h('tr', { class: k === hl ? 'hl' : '' }, [
      h('td', {}, `(${k + 1})`),
      h('td', {}, `Director(${p.lhs}, ${showSeq(p.rhs)})`),
      h('td', { class: 'set' }, k <= upto ? setEl(d.set) : '　'),
    ]);
  });
  return h('table', { class: 'sets' }, [h('thead', {}, h('tr', {}, [h('th', {}, '#'), h('th', {}, 'Director 集合'), h('th', {}, '値')])), h('tbody', {}, rows)]);
}

function renderDirector() {
  const g = G;
  const firstState = new Map(g.nts.map(a => [a, [...AN.firstRes.first.get(a)]]));
  const n = g.prods.length + 1;
  makeStepper($('st-director'), n, i => {
    const desc = $('director-desc');
    if (i === 0) {
      desc.replaceChildren(
        h('p', {}, '各生成規則 A → α について Director(A, α) を求める。First(α) を求め，α が ε になりうるなら Follow(A) も加える。'),
        setsTable('First', g, firstState),
        h('div', { style: 'height:8px' }),
        setsTable('Follow', g, new Map(g.nts.map(a => [a, [...AN.followRes.follow.get(a)]]))),
      );
      $('director-table').replaceChildren(directorTable(g, -1));
      return;
    }
    const k = i - 1, p = g.prods[k], d = AN.director[k];
    const firstNoEps = d.first.filter(x => x !== EPS);
    const parts = [
      h('p', {}, [h('b', {}, `生成規則 (${k + 1}) `), h('span', { class: 'formula' }, prodStr(p))]),
      ...explainSeqFirst(p.rhs, firstState, g, `First(${showSeq(p.rhs)})`),
    ];
    if (d.nullable) {
      parts.push(h('p', {}, [`First(${showSeq(p.rhs)}) に ε が含まれる（${showSeq(p.rhs)} ⇒* ε）ので，ε を除いた ${setStr(firstNoEps)} に `, h('span', { class: 'formula' }, `Follow(${p.lhs}) = ${setStr(d.follow)}`), ' を加える。']));
    } else {
      parts.push(h('p', {}, `First(${showSeq(p.rhs)}) に ε は含まれないので，Follow(${p.lhs}) は加えない。`));
    }
    parts.push(h('p', {}, h('b', {}, [`Director(${p.lhs}, ${showSeq(p.rhs)}) = `, setEl(d.set, { new: new Set(d.nullable ? d.follow.filter(x => !firstNoEps.includes(x)) : []) })])));
    parts.push(grammarTable(g, [k]));
    desc.replaceChildren(...parts);
    $('director-table').replaceChildren(directorTable(g, k, k));
  }, i => i === 0 ? `準備 / ${n}` : `手順 ${i + 1} / ${n}`);
}

/* ---------- 4. LL(1) 判定 ---------- */
function parseTable(g, hlNt) {
  const t = AN.ll;
  const head = h('tr', {}, [h('th', {}, '非終端 \\ 先読み'), ...t.cols.map(c => h('th', {}, c))]);
  const rows = g.nts.map(a => h('tr', { class: a === hlNt ? 'hl' : '' }, [
    h('th', {}, a),
    ...t.cols.map(c => {
      const ids = t.table.get(a).get(c);
      return h('td', { class: ids.length > 1 ? 'conf' : ids.length ? 'cell' : '' }, ids.map(id => `(${id + 1})`).join(' '));
    }),
  ]));
  return h('div', {}, [
    h('p', { class: 'note', style: 'margin:4px 0' }, '先読みした字句ごとにどの生成規則を使うかをまとめた表（構文解析表）。1つのマスに2つ以上の規則が入ると（赤）先読み1字句では決められない。'),
    h('div', { style: 'overflow-x:auto' }, h('table', { class: 'ptable' }, [h('thead', {}, head), h('tbody', {}, rows)])),
  ]);
}

function renderLL1() {
  const g = G, ll = AN.ll;
  const steps = [{ kind: 'intro' }, ...ll.checks.map(c => ({ kind: 'check', c })), { kind: 'leftrec' }, { kind: 'verdict' }];
  const desc = $('ll1-desc'), tbl = $('ll1-table'), verdict = $('ll1-verdict');
  verdict.replaceChildren();
  makeStepper($('st-ll1'), steps.length, i => {
    const s = steps[i];
    if (s.kind !== 'verdict') verdict.replaceChildren();
    if (s.kind === 'intro') {
      const multi = ll.checks.map(c => c.nt);
      desc.replaceChildren(
        h('p', {}, multi.length
          ? ['生成規則に | が出てくる非終端記号は ', ...multi.map(a => symEl(a, g)), ' 。これらについて Director 集合どうしの共通部分を調べる。']
          : 'どの非終端記号にも生成規則の選択肢が1つしかないので，Director 集合の重なりは起こらない。'),
        directorTable(g, g.prods.length),
      );
      tbl.replaceChildren(parseTable(g));
      return;
    }
    if (s.kind === 'check') {
      const c = s.c;
      const items = c.pairs.map(pr => {
        const da = AN.director[pr.a], db = AN.director[pr.b], pa = g.prods[pr.a], pb = g.prods[pr.b];
        const common = new Set(pr.inter);
        return h('p', {}, [
          h('span', { class: 'formula' }, [`Director(${c.nt}, ${showSeq(pa.rhs)}) ∩ Director(${c.nt}, ${showSeq(pb.rhs)}) = `, setEl(da.set, { common }), ' ∩ ', setEl(db.set, { common }), ' = ', pr.inter.length ? setEl(pr.inter, { common }) : 'Φ']),
          ' ',
          pr.inter.length ? h('span', { class: 'ng' }, '← 重なりがある') : h('span', { class: 'ok' }, '← 重なりなし'),
        ]);
      });
      desc.replaceChildren(
        h('p', {}, [h('b', {}, `非終端記号 ${c.nt}：`), `生成規則 ${c.prods.map(id => `(${id + 1})`).join(' ')} の Director 集合を比べる。`]),
        ...items,
        h('p', {}, c.ok ? h('span', { class: 'ok' }, `${c.nt} については先読み1字句でどの規則を使うか必ず決まる。`)
          : h('span', { class: 'ng' }, `${c.nt} については先読み1字句ではどの規則を使うか決められない（バックトラックが必要）。`)),
        grammarTable(g, c.ok ? c.prods : [], c.ok ? [] : c.prods),
      );
      tbl.replaceChildren(parseTable(g, c.nt));
      return;
    }
    if (s.kind === 'leftrec') {
      const lr = AN.leftRec;
      desc.replaceChildren(
        h('p', {}, h('b', {}, '左再帰性の確認：')),
        lr.length
          ? h('div', {}, lr.map(x => h('p', {}, [h('span', { class: 'ng' }, x.direct ? `${x.nt} に直接の左再帰がある` : `${x.nt} に間接的な左再帰がある`), `（${x.path.join(' ⇒ ')}，生成規則 ${x.prods.map(id => `(${id + 1})`).join(' ')}）。左再帰があると再帰的下向き構文解析では無限に再帰してしまう。`])))
          : h('p', {}, h('span', { class: 'ok' }, '左辺の非終端記号が右辺の先頭に現れる規則はなく，左再帰性はない。')),
        grammarTable(g, [], lr.flatMap(x => x.prods)),
      );
      tbl.replaceChildren(parseTable(g));
      return;
    }
    // verdict
    const bad = ll.checks.filter(c => !c.ok);
    const lr = AN.leftRec;
    const v = h('div', { class: 'verdict ' + (AN.isLL1 ? 'ok' : 'ng') });
    if (AN.isLL1) {
      v.append(h('b', {}, '✔ この文法は LL(1) 文法である。'), '　すべての非終端記号について Director 集合に重複がなく（曖昧性がなく），左再帰性もない。下の「5. 再帰的下向き構文解析」で文字列を解析できる。');
    } else {
      const reasons = [];
      for (const c of bad) reasons.push(h('li', {}, `${c.nt} の生成規則 ${c.prods.map(id => `(${id + 1})`).join(' ')} の Director 集合に共通部分 ${[...new Set(c.pairs.flatMap(p => p.inter))].join(', ')} がある`));
      for (const x of lr) reasons.push(h('li', {}, `${x.nt} に${x.direct ? '直接の' : '間接的な'}左再帰がある（${x.path.join(' ⇒ ')}）`));
      v.append(h('b', {}, '✘ この文法は LL(1) 文法ではない。'), h('ul', {}, reasons));
      const hints = [];
      if (lr.some(x => x.direct)) hints.push('「左再帰を除去」ボタンで A → Aα | β を A → βA\'，A\' → αA\' | ε に書き換えられる（教科書 p.49）。');
      if (AN.prefixes.length) hints.push(`「括り出し」ボタンで共通の先頭部分（${AN.prefixes.map(x => `${x.nt}: ${x.sym}`).join('，')}）を括り出せる（教科書 p.51）。`);
      if (!lr.length && !AN.prefixes.length && bad.length) hints.push('共通の先頭部分も左再帰もないのに重なりがある。ε になりうる規則の Follow 集合が原因なので，文法の構造を見直す必要がある。');
      if (hints.length) v.append(h('p', { style: 'margin:6px 0 0' }, [h('b', {}, '書き換えの候補: '), ...hints.map(t => h('span', {}, t + ' '))]));
    }
    desc.replaceChildren(h('p', {}, '以上の結果をまとめる。'), grammarTable(g, [], [...bad.flatMap(c => c.prods), ...lr.flatMap(x => x.prods)]));
    tbl.replaceChildren(parseTable(g));
    verdict.replaceChildren(v);
  }, i => `手順 ${i + 1} / ${steps.length}`);
}

/* ---------- 5. 構文解析 ---------- */
function renderParseSection() {
  const g = G;
  const msg = $('parse-msg');
  $('parse-area').hidden = true;
  $('parse').disabled = $('gen').disabled = !AN.isLL1;
  msg.className = 'msg';
  msg.textContent = AN.isLL1 ? '' : 'LL(1) 文法ではないので構文解析はできません。文法を書き換えてください。';
  if (AN.isLL1 && !$('input').value) {
    const s = generateSentence(g, 3);
    if (s) $('input').value = s.join(g.terminals.some(t => t.length > 1) ? ' ' : '');
  }
}

function runParse() {
  const g = G, msg = $('parse-msg');
  if (!AN.isLL1) return;
  const tk = tokenizeInput($('input').value, g);
  msg.className = 'msg';
  if (tk.error) { msg.className = 'msg err'; msg.textContent = tk.error; $('parse-area').hidden = true; return; }
  msg.textContent = '';
  const trace = traceParse(g, AN, tk.tokens);
  const code = AN.code;
  $('parse-area').hidden = false;
  const n = trace.events.length + 1;

  // 疑似コード
  const codeView = $('code-view');
  const lineEls = code.lines.map(l => h('span', { class: 'ln' }, l.comment ? [l.text, h('span', { class: 'cm' }, `   /* ${l.comment} */`)] : [l.text]));
  codeView.replaceChildren(...lineEls);

  makeStepper($('st-parse'), n, i => {
    const ev = i > 0 ? trace.events[i - 1] : null;
    const pos = ev ? ev.pos : 0;
    // 入力
    const toks = trace.tokens.map((t, k) => h('span', { class: 'tok' + (k < pos ? ' read' : '') + (k === pos ? ' cur' : '') }, t));
    toks.push(h('span', { class: 'tok end' + (pos >= trace.tokens.length ? ' cur' : '') }, END));
    $('input-view').replaceChildren(h('span', { class: 'label' }, '入力:'), ...toks);
    // 説明
    const d = $('parse-desc');
    if (!ev) {
      d.replaceChildren(h('p', {}, `入力を字句に分けると ${trace.tokens.map(t => `「${t}」`).join('')}（${trace.tokens.length} 字句）。開始記号 ${g.start} から解析を始める。`));
    } else {
      const cls = ev.type === 'error' ? 'ng' : ev.type === 'accept' ? 'ok' : '';
      d.replaceChildren(h('p', {}, [h('b', {}, `手順 ${i}：`), h('span', { class: cls }, ev.text)]),
        h('p', { class: 'note' }, `先読み（次の字句）: ${ev.la}`));
    }
    // 呼び出しの入れ子
    const frames = ev ? ev.frames : [];
    $('stack-view').replaceChildren(h('div', { class: 'stack' }, [h('b', {}, '呼び出しの入れ子: '),
      ...(frames.length ? frames.map((f, k) => h('span', { class: 'fr' + (k === frames.length - 1 ? ' top' : '') }, `${f.nt}()`)) : [h('span', { class: 'note' }, ev && ev.type === 'accept' ? '（すべて戻った）' : '（まだ呼び出していない）')])]));
    // 導出列
    const di = ev ? ev.deriv : 0;
    const dv = $('deriv-view');
    const items = [];
    for (let k = 0; k <= di; k++) { if (k) items.push(' ⇒ '); items.push(h('span', { class: k === di ? 'cur' : '' }, trace.derivs[k].join(' ') || EPS)); }
    dv.replaceChildren(h('div', { class: 'deriv' }, [h('b', {}, '最左導出: '), ...items]));
    // コード
    const activeNts = new Set(frames.map(f => f.nt));
    code.lines.forEach((l, k) => {
      lineEls[k].className = 'ln' + (ev && ev.line === k ? ' cur' : '') + (l.nt && activeNts.has(l.nt) ? ' active' : '');
    });
    if (ev && ev.line >= 0) lineEls[ev.line].scrollIntoView({ block: 'nearest' });
    // 構文木
    drawTree($('tree-view'), trace, i - 1, ev ? ev.node : 0);
  }, i => `手順 ${i} / ${n - 1}`);
}

/* ---------- 文法の書き換え ---------- */
function rewrite(fn) {
  const g = parseGrammar($('grammar').value, $('start').value);
  const msgs = $('messages');
  if (g.errors.length) { runAnalysis(); return; }
  const r = fn(g);
  $('grammar').value = r.text;
  runAnalysis();
  for (const n of r.notes) msgs.appendChild(h('div', { class: 'info' }, n));
  if (!r.notes.length) msgs.appendChild(h('div', { class: 'info' }, '書き換える箇所はありませんでした。'));
}

/* ---------- イベント ---------- */
$('run').addEventListener('click', runAnalysis);
$('start').addEventListener('change', runAnalysis);
$('btn-leftrec').addEventListener('click', () => rewrite(removeLeftRecursion));
$('btn-factor').addEventListener('click', () => rewrite(leftFactor));
$('grammar').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runAnalysis(); });
document.querySelectorAll('.example').forEach(b => b.addEventListener('click', () => {
  $('grammar').value = b.dataset.g; $('start').replaceChildren(); $('input').value = ''; runAnalysis();
}));
$('parse').addEventListener('click', runParse);
$('input').addEventListener('keydown', e => { if (e.key === 'Enter') runParse(); });
$('gen').addEventListener('click', () => {
  const s = generateSentence(G, 4);
  if (s) { $('input').value = s.join(G.terminals.some(t => t.length > 1) ? ' ' : ''); runParse(); }
});

runAnalysis();
