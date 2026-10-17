/* =========================================================
 * app.js
 *   画面の組み立て・段階表示（ステッパー）
 * ========================================================= */
'use strict';

/* ---------- 定数 ---------- */
const HIRAGANA = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'];
const GREEK = [...'αβγδζηθικλμνξπρστυφχψω'];       // ε は空列と紛らわしいので除く
const STATE_COLORS = ['#f9c0d2', '#ffd9a8', '#fff3a8', '#c8ecc8', '#c6e2ff', '#e0cdf7', '#c9f1ee', '#f5d0b8', '#e6e6a8', '#d7f0b4', '#f7c6c6', '#cfd8f7'];
const GROUP_COLORS = ['#f9c9e8', '#fdf3b0', '#c9f0c9', '#c9e4fb', '#ffd8a8', '#e3d1f5', '#c9f3f0', '#f5d6c9', '#e4e4e4', '#d9f0a3', '#f7c6c6', '#cfd8f7'];
const SYM_COLORS = ['#f6a5c0', '#f8b878', '#f2e68a', '#a8d8ea', '#b5e8b5', '#d3b8f0', '#9ee3dc', '#f0c3a8'];
const BUCKET_COLORS = ['#d0202a', '#1f5fbf', '#1a9c4a', '#c21fb0', '#d97a00', '#7a3fd0'];

const hira = i => HIRAGANA[i] !== undefined ? HIRAGANA[i] : 'q' + i;
const greek = i => GREEK[i] !== undefined ? GREEK[i] : 'G' + i;
const stateColor = i => STATE_COLORS[i % STATE_COLORS.length];
const groupColor = i => GROUP_COLORS[i % GROUP_COLORS.length];
const symColor = i => SYM_COLORS[i % SYM_COLORS.length];
const setText = set => '{' + set.join(',') + '}';

/* ---------- DOM ヘルパ ---------- */
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c === null || c === undefined) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}
const $ = sel => document.querySelector(sel);
const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
const symSpan = (sym, idx) => h('span', { class: 'sym', style: `background:${symColor(idx)}` }, sym);

/* ---------- ステッパー ---------- */
function makeStepper(bar, count, render) {
  let cur = 0;
  const ind = h('span', { class: 'step-ind' });
  const bFirst = h('button', { onclick: () => go(0) }, '⏮ 最初');
  const bPrev = h('button', { onclick: () => go(cur - 1) }, '◀ 前へ');
  const bNext = h('button', { class: 'primary', onclick: () => go(cur + 1) }, '次へ ▶');
  const bLast = h('button', { onclick: () => go(count - 1) }, '最後 ⏭');
  clear(bar).append(bFirst, bPrev, ind, bNext, bLast);
  function go(k) {
    cur = Math.max(0, Math.min(count - 1, k));
    ind.textContent = `ステップ ${cur + 1} / ${count}`;
    bFirst.disabled = bPrev.disabled = cur === 0;
    bNext.disabled = bLast.disabled = cur === count - 1;
    render(cur);
  }
  go(0);
  return { go, get current() { return cur; } };
}

/* ---------- 遷移表（共通） ---------- */
function transitionTable(alphabet, rows) {
  // rows: [{head: node, cells: [node|string], rowStyle}]
  const thead = h('thead', {}, h('tr', {}, [h('th', { class: 'corner' }, [h('span', {}, '入力→'), h('br'), h('span', {}, '↓状態')]), ...alphabet.map(a => h('th', { class: 'symhead' }, a))]));
  const tbody = h('tbody', {}, rows.map(r => h('tr', { style: r.rowStyle }, [h('th', { class: 'statehead', style: r.headStyle }, r.head), ...r.cells.map(c => h('td', { style: c && c.style }, c && c.node !== undefined ? c.node : c))])));
  return h('table', { class: 'ttable' }, [thead, tbody]);
}

/* =========================================================
 * §1 正規表現 → NFA
 * ========================================================= */
function renderSection1(R) {
  const { nfa, ast, alphabet, src } = R;
  $('#parse-info').replaceChildren(
    h('div', {}, [h('b', {}, '構文解析結果: '), h('code', {}, astToString(ast))]),
    h('div', {}, [h('b', {}, 'アルファベット Σ = '), h('code', {}, '{' + alphabet.join(', ') + '}')]),
    h('div', {}, [h('b', {}, 'NFA: '), `状態 ${nfa.states.length} 個（0〜${nfa.states.length - 1}）、初期状態 0、受理状態 ${nfa.accept}、遷移 ${nfa.edges.length} 本`])
  );
  const fig = $('#nfa-fig'), desc = $('#nfa-desc'), list = $('#nfa-list');
  const items = [h('li', { onclick: () => st.go(0) }, '初期状態 0 を作る')]
    .concat(nfa.edges.map((e, i) => h('li', { onclick: () => st.go(i + 1) }, [h('code', {}, `${e.from} ─${e.sym}→ ${e.to}`), '　', e.why])));
  list.replaceChildren(...items);
  const st = makeStepper($('#nfa-stepper'), nfa.edges.length + 1, k => {
    fig.replaceChildren(drawNFA(nfa, { edgeCount: k, lastEdge: k - 1 }));
    if (k === 0) desc.replaceChildren(h('p', {}, '初期状態 0 を作り、正規表現を左から順に読みながら状態と遷移を追加していく。'));
    else {
      const e = nfa.edges[k - 1];
      desc.replaceChildren(h('p', {}, [h('b', {}, `遷移 ${k}: `), h('code', {}, `${e.from} ─${e.sym}→ ${e.to}`), '　', e.why]));
      if (k === nfa.edges.length) desc.appendChild(h('p', { class: 'note' }, `完成。状態 ${nfa.accept} が受理状態（二重丸）になる。`));
    }
    items.forEach((li, i) => { li.classList.toggle('done', i < k); li.classList.toggle('current', i === k); });
  });
  $('#nfa-count').textContent = `（${nfa.states.length} 状態）`;
}

/* =========================================================
 * §2 NFA → DFA（部分集合構成法）
 * ========================================================= */
function renderSection2(R) {
  const { nfa, dfa, alphabet } = R;
  const figN = $('#sub-nfa-fig'), figD = $('#sub-dfa-fig'), desc = $('#sub-desc');
  const symIdx = s => alphabet.indexOf(s);
  makeStepper($('#sub-stepper'), dfa.steps.length, k => {
    const step = dfa.steps[k];
    const nfaOpts = { source: new Set(), targets: new Map() };
    const dfaOpts = { label: i => dfa.states[i].set.join(','), fill: i => stateColor(i), visibleStates: step.numStates, edgeCount: step.numEdges, targets: new Map(), hlEdges: new Set() };
    const parts = [];
    if (step.kind === 'init') {
      nfaOpts.source.add(nfa.start);
      step.closure.forEach(s => { if (s !== nfa.start) nfaOpts.targets.set(s, '#f9c0d2'); });
      dfaOpts.source = step.state;
      parts.push(h('p', {}, [h('b', {}, '初期状態を決める: '), `NFA の初期状態 0 から ε だけで辿れる状態をすべてまとめ、DFA の初期状態にする。`]));
      parts.push(h('p', {}, [h('code', {}, `ε-closure({0}) = ${setText(step.closure)}`), dfa.states[step.state].accept ? '　← 受理状態 ' + nfa.accept + ' を含むので受理状態' : '']));
    } else {
      const S = dfa.states[step.state];
      S.set.forEach(s => nfaOpts.source.add(s));
      dfaOpts.source = step.state;
      parts.push(h('p', {}, [h('b', {}, `状態 ${setText(S.set)} を展開する: `), 'この集合の各状態から、同じ記号で辿れる遷移先（ε で辿れる先も含む）を 1 つの状態にまとめる。']));
      const ul = h('ul', { class: 'results' });
      step.results.forEach(r => {
        const si = symIdx(r.sym);
        if (r.none) { ul.appendChild(h('li', {}, [symSpan(r.sym, si), ' 遷移なし'])); return; }
        r.closure.forEach(s => nfaOpts.targets.set(s, symColor(si)));
        dfaOpts.targets.set(r.target, symColor(si));
        dfaOpts.hlEdges.add(step.state + '>' + r.target);
        const T = dfa.states[r.target];
        ul.appendChild(h('li', {}, [
          symSpan(r.sym, si), ` で直接辿れる: ${setText(r.move)} → ε で広げる: `, h('code', {}, setText(r.closure)),
          r.isNew ? h('span', { class: 'tag new' }, '新しい状態') : h('span', { class: 'tag' }, 'すでにある状態'),
          T.accept ? h('span', { class: 'tag acc' }, `受理状態 ${nfa.accept} を含む → 受理`) : null
        ]));
      });
      parts.push(ul);
      if (k === dfa.steps.length - 1) parts.push(h('p', { class: 'note' }, `新しい状態が出なくなったので終了。DFA の状態数は ${dfa.states.length}。`));
      else {
        const pending = dfa.states.slice(0, step.numStates).filter(s => s.id > step.state).map(s => setText(s.set));
        parts.push(h('p', { class: 'small' }, '未処理の状態: ' + (pending.length ? pending.join(' ') : 'なし')));
      }
    }
    desc.replaceChildren(...parts);
    figN.replaceChildren(drawNFA(nfa, nfaOpts));
    figD.replaceChildren(drawDFA(dfa, dfaOpts));
  });
  $('#dfa-count').textContent = `（${dfa.states.length} 状態）`;
}

/* =========================================================
 * §3 ラベルの振り直しと状態遷移表
 * ========================================================= */
function renderSection3(R) {
  const { dfa, alphabet } = R;
  $('#relabel-fig').replaceChildren(drawDFA(dfa, { label: i => hira(i), fill: i => stateColor(i) }));
  const map = h('div', { class: 'chips' }, dfa.states.map(s => h('span', { class: 'chip', style: `background:${stateColor(s.id)}` }, [h('b', {}, (s.accept ? '◎' : '') + hira(s.id)), ' = ' + setText(s.set)])));
  $('#relabel-map').replaceChildren(map);
  const rows = dfa.states.map(s => ({
    head: (s.accept ? '◎' : '') + hira(s.id),
    headStyle: `background:${stateColor(s.id)}`,
    cells: alphabet.map(a => dfa.trans[s.id][a] === undefined ? '' : { node: hira(dfa.trans[s.id][a]), style: `background:${stateColor(dfa.trans[s.id][a])}` })
  }));
  $('#relabel-table').replaceChildren(transitionTable(alphabet, rows), h('p', { class: 'small' }, '◎ は受理状態。空欄は遷移なし。'));
}

/* =========================================================
 * §4 Moore's Algorithm
 * ========================================================= */
function renderSection4(R) {
  const { dfa, rounds, alphabet } = R;
  const desc = $('#moore-desc'), tbl = $('#moore-table'), hist = $('#moore-history');
  const groupsText = groups => groups.map(g => '{' + g.map(hira).join(',') + '}').join(' ');

  hist.replaceChildren(...rounds.map((rd, r) => h('li', { onclick: () => st.go(r) }, [
    h('b', {}, r === 0 ? '初期分割: ' : `分割 ${r}: `), groupsText(rd.groups), rd.changed ? ' → 矛盾あり' : ' → 矛盾なし（終了）'
  ])));

  const st = makeStepper($('#moore-stepper'), rounds.length, r => {
    const rd = rounds[r];
    const parts = [];
    if (r === 0) parts.push(h('p', {}, [h('b', {}, '初期分割: '), '全状態を「非受理状態」と「受理状態」の 2 グループに分ける。 ', h('code', {}, groupsText(rd.groups))]));
    else parts.push(h('p', {}, [h('b', {}, `分割 ${r}: `), '前のラウンドで分割した結果にラベルを付け直し、矛盾がないか再び調べる。 ', h('code', {}, groupsText(rd.groups))]));
    parts.push(h('p', {}, '各グループにラベルを付け、入力ごとの遷移先がどのグループに属するかを表にする:'));
    parts.push(h('div', { class: 'chips' }, rd.groups.map((g, gi) => h('span', { class: 'chip', style: `background:${groupColor(gi)}` }, [h('b', {}, greek(gi)), ' = {' + g.map(hira).join(', ') + '}']))));

    // 表
    const rows = [];
    rd.splits.forEach(sp => {
      const gi = sp.group;
      sp.buckets.forEach((b, bi) => b.members.forEach(s => {
        const outline = sp.split ? `box-shadow: inset 0 0 0 3px ${BUCKET_COLORS[bi % BUCKET_COLORS.length]}` : '';
        rows.push({
          group: gi, outline,
          head: (dfa.states[s].accept ? '◎' : '') + hira(s),
          headStyle: `background:${groupColor(gi)}`,
          cells: alphabet.map(a => {
            const t = dfa.trans[s][a];
            if (t === undefined) return { node: '', style: outline };
            return { node: `${hira(t)}∈${greek(rd.groupOf[t])}`, style: `background:${groupColor(rd.groupOf[t])};${outline}` };
          })
        });
      }));
    });
    const thead = h('thead', {}, h('tr', {}, [h('th', {}, 'Group'), h('th', { class: 'corner' }, [h('span', {}, '入力→'), h('br'), h('span', {}, '↓状態')]), ...alphabet.map(a => h('th', { class: 'symhead' }, a))]));
    const tbody = h('tbody', {}, rows.map(rw => h('tr', {}, [
      h('th', { class: 'grouphead', style: `background:${groupColor(rw.group)};${rw.outline}` }, greek(rw.group)),
      h('th', { class: 'statehead', style: rw.headStyle + ';' + rw.outline }, rw.head),
      ...rw.cells.map(c => h('td', { style: c.style }, c.node))
    ])));
    tbl.replaceChildren(h('table', { class: 'ttable moore' }, [thead, tbody]));

    // 結果
    if (rd.changed) {
      const ul = h('ul');
      rd.splits.filter(sp => sp.split).forEach(sp => {
        ul.appendChild(h('li', {}, [
          h('b', { class: 'conflict' }, '矛盾: '), `グループ ${greek(sp.group)} = {${rd.groups[sp.group].map(hira).join(',')}} の中で遷移先グループのパターンが異なる → `,
          ...sp.buckets.map((b, bi) => h('span', { class: 'bucket', style: `border-color:${BUCKET_COLORS[bi % BUCKET_COLORS.length]}` }, '{' + b.members.map(hira).join(',') + '}'))
        ]));
      });
      parts.push(h('p', {}, [h('b', {}, '同じグループ内で行の色のパターンを比べる:')]), ul);
      parts.push(h('p', {}, [h('b', {}, '新しい分割: '), h('code', {}, groupsText(rd.newGroups)), '　→ これ以上分割できなくなるまで繰り返す。']));
    } else {
      parts.push(h('p', { class: 'note' }, [h('b', {}, '矛盾なし。'), 'どのグループも遷移先グループのパターンがそろっているので、これ以上分割できない。各グループを 1 つの状態にまとめたものが状態数最小の DFA になる。']));
    }
    desc.replaceChildren(...parts);
    hist.querySelectorAll('li').forEach((li, i) => { li.classList.toggle('done', i < r); li.classList.toggle('current', i === r); });
  });
}

/* =========================================================
 * §5 最小 DFA
 * ========================================================= */
function renderSection5(R) {
  const { dfa, min, alphabet } = R;
  $('#min-fig').replaceChildren(drawDFA(min, { label: i => greek(i), fill: i => groupColor(i) }));
  $('#min-map').replaceChildren(h('div', { class: 'chips' }, min.states.map(s => h('span', { class: 'chip', style: `background:${groupColor(s.id)}` }, [h('b', {}, (s.accept ? '◎' : '') + greek(s.id)), ' = {' + s.members.map(hira).join(', ') + '}']))));
  const rows = min.states.map(s => ({
    head: (s.accept ? '◎' : '') + greek(s.id), headStyle: `background:${groupColor(s.id)}`,
    cells: alphabet.map(a => min.trans[s.id][a] === undefined ? '' : { node: greek(min.trans[s.id][a]), style: `background:${groupColor(min.trans[s.id][a])}` })
  }));
  $('#min-table').replaceChildren(transitionTable(alphabet, rows));
  $('#min-summary').textContent = `NFA ${R.nfa.states.length} 状態 → DFA ${dfa.states.length} 状態 → 最小 DFA ${min.states.length} 状態`;
  $('#min-count').textContent = `（${min.states.length} 状態）`;
}

/* ---------- 受理テスト ---------- */
function runTest(R) {
  const input = $('#test-input').value;
  const out = $('#test-result');
  const r1 = runDFA(R.dfa, input), r2 = runDFA(R.min, input);
  const fmt = (res, lab) => res.trace.map(lab).join(' → ') + (res.stuckAt !== undefined ? ` ─${res.stuckAt}→ (遷移なし)` : '');
  out.replaceChildren(
    h('p', {}, [h('b', { class: r2.accept ? 'ok' : 'ng' }, r2.accept ? '受理' : '不受理'), `　入力 "${input}"`]),
    h('p', { class: 'small' }, ['DFA: ', fmt(r1, hira), h('br'), '最小 DFA: ', fmt(r2, greek)])
  );
}

/* ---------- メイン ---------- */
let RESULT = null;
function compile() {
  const src = $('#regex').value;
  const err = $('#error');
  try {
    RESULT = compileAll(src);
    err.textContent = '';
    $('#results').hidden = false;
    renderSection1(RESULT); renderSection2(RESULT); renderSection3(RESULT); renderSection4(RESULT); renderSection5(RESULT);
    $('#test-result').replaceChildren();
    history.replaceState(null, '', '#' + encodeURIComponent(src));
  } catch (e) {
    err.textContent = 'エラー: ' + e.message;
    $('#results').hidden = true;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const initial = location.hash ? decodeURIComponent(location.hash.slice(1)) : 'a(b|c)*(bd)*';
  $('#regex').value = initial;
  $('#go').addEventListener('click', compile);
  $('#regex').addEventListener('keydown', e => { if (e.key === 'Enter') compile(); });
  document.querySelectorAll('.example').forEach(b => b.addEventListener('click', () => { $('#regex').value = b.dataset.re; compile(); }));
  $('#test-run').addEventListener('click', () => RESULT && runTest(RESULT));
  $('#test-input').addEventListener('keydown', e => { if (e.key === 'Enter' && RESULT) runTest(RESULT); });
  window.addEventListener('hashchange', () => {
    const re = decodeURIComponent(location.hash.slice(1));
    if (re && re !== $('#regex').value) { $('#regex').value = re; compile(); }
  });
  compile();
});
