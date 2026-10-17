/* =========================================================
 * automata.js
 *   正規表現 → NFA → DFA → 最小DFA の計算部分（表示とは独立）
 *   講義「言語処理系 第4回 続・字句解析」の流儀に合わせている。
 * ========================================================= */
'use strict';

const EPS = 'ε';

/* ---------------------------------------------------------
 * 1. 正規表現の構文解析
 *   alt    := cat ('|' cat)*
 *   cat    := repeat*
 *   repeat := atom '*'*
 *   atom   := '(' alt ')' | 'ε' | '\' 任意1文字 | 1文字
 *   （'+' と '?' は演算子ではなく普通の記号として扱う）
 *   各ノードに span（元の文字列中の範囲）を持たせ、表示に使う。
 * --------------------------------------------------------- */
function parseRegex(src) {
  let i = 0;
  const s = src;
  const peek = () => s[i];
  const skipWs = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const isOp = c => c === '*';

  function parseAlt() {
    const start = i;
    const items = [parseCat()];
    skipWs();
    while (peek() === '|') { i++; items.push(parseCat()); skipWs(); }
    if (items.length === 1) return items[0];
    return { type: 'alt', items, span: [start, i] };
  }
  function parseCat() {
    const start = i;
    const items = [];
    skipWs();
    while (i < s.length && peek() !== '|' && peek() !== ')') { items.push(parseRepeat()); skipWs(); }
    if (items.length === 0) return { type: 'eps', span: [start, i] };
    if (items.length === 1) return items[0];
    return { type: 'cat', items, span: [start, i] };
  }
  function parseRepeat() {
    const start = i;
    let node = parseAtom();
    skipWs();
    while (i < s.length && isOp(peek())) {
      i++;
      node = { type: 'star', sub: node, span: [start, i] };
      skipWs();
    }
    return node;
  }
  function parseAtom() {
    skipWs();
    const start = i;
    const c = peek();
    if (c === undefined) throw new Error(`位置 ${i}: 記号が必要です`);
    if (c === '(') {
      i++;
      const n = parseAlt();
      skipWs();
      if (peek() !== ')') throw new Error(`位置 ${i}: ')' が必要です`);
      i++;
      return n;
    }
    if (c === ')') throw new Error(`位置 ${i}: 対応する '(' がありません`);
    if (isOp(c)) throw new Error(`位置 ${i}: '*' の前に記号が必要です`);
    if (c === '|') throw new Error(`位置 ${i}: '|' の前に記号が必要です`);
    if (c === '\\') {
      i++;
      if (i >= s.length) throw new Error(`位置 ${i}: '\\' の後に文字が必要です`);
      const ch = s[i++];
      return { type: 'sym', ch, span: [start, i] };
    }
    if (c === 'ε' || c === 'ε') { i++; return { type: 'eps', span: [start, i] }; }
    i++;
    return { type: 'sym', ch: c, span: [start, i] };
  }

  const node = parseAlt();
  skipWs();
  if (i < s.length) throw new Error(`位置 ${i}: 予期しない文字 '${s[i]}'`);
  return node;
}

/** 構文木を括弧付きの文字列にする（確認表示用） */
function astToString(n) {
  switch (n.type) {
    case 'sym': return n.ch;
    case 'eps': return 'ε';
    case 'cat': return n.items.map(astToString).join('·');
    case 'alt': return '(' + n.items.map(astToString).join(' | ') + ')';
    case 'star': return '(' + astToString(n.sub) + ')*';
  }
  return '?';
}

/** 正規表現に現れる記号（アルファベット）を出現順に返す */
function collectAlphabet(ast) {
  const out = [];
  (function walk(n) {
    if (n.type === 'sym') { if (!out.includes(n.ch)) out.push(n.ch); }
    else if (n.items) n.items.forEach(walk);
    else if (n.sub) walk(n.sub);
  })(ast);
  return out.sort((a, b) => a.localeCompare(b));
}

/* ---------------------------------------------------------
 * 2. 正規表現 → NFA
 *   講義の図3.6 と同じ形になる構成法。
 *   build(node, start, end) は start から node を読む遷移を作り、
 *   終わりの状態を返す（end が指定されていればそこに合流させる）。
 *     記号 x   : start --x--> e
 *     連接 AB  : A の終わり = B の始まり
 *     選択 A|B : 始まりと終わりを共有
 *     閉包 A*  : start --ε--> s2 [A] e2 --ε--> s2,  start --ε--> e,  e2 --ε--> e
 *   状態番号は作られた順に 0,1,2,... となる（図と同じ左→右の並び）。
 * --------------------------------------------------------- */
function buildNFA(ast, src) {
  const nfa = { states: [], edges: [], start: 0, accept: null };
  const txt = n => src.slice(n.span[0], n.span[1]).replace(/\s+/g, '');
  const newState = () => { const id = nfa.states.length; nfa.states.push(id); return id; };
  const addEdge = (from, sym, to, why) => {
    if (nfa.edges.some(e => e.from === from && e.sym === sym && e.to === to)) return;
    nfa.edges.push({ from, sym, to, why });
  };

  function build(node, start, end) {
    switch (node.type) {
      case 'sym': {
        const e = end === undefined ? newState() : end;
        addEdge(start, node.ch, e, `記号 '${node.ch}' を読む遷移`);
        return e;
      }
      case 'eps': {
        const e = end === undefined ? newState() : end;
        addEdge(start, EPS, e, `空列 ε の遷移`);
        return e;
      }
      case 'cat': {
        let cur = start;
        node.items.forEach((it, k) => {
          cur = build(it, cur, k === node.items.length - 1 ? end : undefined);
        });
        return cur;
      }
      case 'alt': {
        // 最初の枝で終わりの状態を決め、残りの枝はそこに合流させる
        const e = build(node.items[0], start, end);
        for (let k = 1; k < node.items.length; k++) build(node.items[k], start, e);
        return e;
      }
      case 'star': {
        const t = txt(node);
        const s2 = newState();
        addEdge(start, EPS, s2, `閉包 ${t}: 繰り返し部分の入口へ ε で入る`);
        const e2 = build(node.sub, s2, undefined);
        addEdge(e2, EPS, s2, `閉包 ${t}: もう一度繰り返すため ε で入口へ戻る`);
        const e = end === undefined ? newState() : end;
        addEdge(start, EPS, e, `閉包 ${t}: 0回の繰り返し（読み飛ばし）の ε 遷移`);
        addEdge(e2, EPS, e, `閉包 ${t}: 繰り返しを抜ける ε 遷移`);
        return e;
      }
    }
    throw new Error('unknown node ' + node.type);
  }

  newState();                 // 状態 0（初期状態）
  nfa.accept = build(ast, 0, undefined);
  return nfa;
}

/* ---------------------------------------------------------
 * 3. NFA → DFA（部分集合構成法）
 *   ・初期状態から ε で辿れる状態をまとめて初期状態にする
 *   ・ある状態から、同じ入力で辿れる遷移先（ε も含めて）をまとめて1つの状態にする
 *   ・まとめた中に受理状態が1つでもあれば受理状態
 *   ・組合せが違えば別の状態
 *   ・これを新しい状態が出なくなるまで繰り返す
 * --------------------------------------------------------- */
function epsClosure(nfa, set) {
  const seen = new Set(set);
  const stack = [...set];
  while (stack.length) {
    const s = stack.pop();
    for (const e of nfa.edges) {
      if (e.from === s && e.sym === EPS && !seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
  }
  return [...seen].sort((a, b) => a - b);
}
function moveSet(nfa, set, sym) {
  const out = new Set();
  for (const e of nfa.edges) if (e.sym === sym && set.includes(e.from)) out.add(e.to);
  return [...out].sort((a, b) => a - b);
}

function subsetConstruction(nfa, alphabet) {
  const key = a => a.join(',');
  const dfa = { states: [], trans: [], edges: [], start: 0, alphabet, steps: [] };
  const index = new Map();
  const addState = set => {
    const id = dfa.states.length;
    dfa.states.push({ id, set, accept: set.includes(nfa.accept) });
    dfa.trans.push({});
    index.set(key(set), id);
    return id;
  };

  const init = epsClosure(nfa, [nfa.start]);
  dfa.start = addState(init);
  dfa.steps.push({ kind: 'init', state: dfa.start, closure: init, numStates: 1, numEdges: 0 });

  for (let i = 0; i < dfa.states.length; i++) {
    const results = [];
    for (const sym of alphabet) {
      const mv = moveSet(nfa, dfa.states[i].set, sym);
      if (mv.length === 0) { results.push({ sym, none: true }); continue; }
      const cl = epsClosure(nfa, mv);
      const k = key(cl);
      let target, isNew = false;
      if (index.has(k)) target = index.get(k);
      else { target = addState(cl); isNew = true; }
      dfa.trans[i][sym] = target;
      dfa.edges.push({ from: i, sym, to: target });
      results.push({ sym, move: mv, closure: cl, target, isNew });
    }
    dfa.steps.push({ kind: 'expand', state: i, results, numStates: dfa.states.length, numEdges: dfa.edges.length });
  }
  return dfa;
}

/* ---------------------------------------------------------
 * 4. DFA の状態数最小化（Moore's Algorithm）
 *   ・まず全状態を「非受理」「受理」の2グループに分ける
 *   ・各状態について、入力ごとの遷移先がどのグループに属するかを表にする
 *   ・同じグループ内で遷移先グループのパターンが違う状態があれば矛盾 → 分割
 *   ・分割できなくなるまで繰り返す
 *   各ラウンドの表・分割の様子を rounds に記録する。
 * --------------------------------------------------------- */
function mooreMinimize(dfa) {
  const n = dfa.states.length;
  const alphabet = dfa.alphabet;
  const ids = dfa.states.map(s => s.id);
  let groups = [];
  const nonAcc = ids.filter(s => !dfa.states[s].accept);
  const acc = ids.filter(s => dfa.states[s].accept);
  if (nonAcc.length) groups.push(nonAcc);
  if (acc.length) groups.push(acc);

  const rounds = [];
  for (;;) {
    const groupOf = new Array(n);
    groups.forEach((g, gi) => g.forEach(s => { groupOf[s] = gi; }));
    const sigs = {};
    const splits = [];
    const newGroups = [];
    groups.forEach((g, gi) => {
      const buckets = [];           // 同じ遷移パターンの状態をまとめる
      g.forEach(s => {
        const sig = alphabet.map(a => dfa.trans[s][a] === undefined ? null : groupOf[dfa.trans[s][a]]);
        sigs[s] = sig;
        const k = sig.map(x => x === null ? '-' : x).join(',');
        let b = buckets.find(b => b.key === k);
        if (!b) { b = { key: k, members: [] }; buckets.push(b); }
        b.members.push(s);
      });
      splits.push({ group: gi, buckets, split: buckets.length > 1 });
      buckets.forEach(b => newGroups.push(b.members));
    });
    const changed = newGroups.length !== groups.length;
    rounds.push({ groups, groupOf, sigs, splits, newGroups, changed });
    if (!changed) break;
    groups = newGroups;
  }

  // 最小 DFA を組み立てる（最後のラウンドのグループが状態になる）
  const last = rounds[rounds.length - 1];
  const min = { states: [], trans: [], edges: [], start: last.groupOf[dfa.start], alphabet };
  last.groups.forEach((g, gi) => {
    min.states.push({ id: gi, members: g, accept: g.some(s => dfa.states[s].accept) });
    const t = {};
    for (const a of alphabet) {
      const to = dfa.trans[g[0]][a];
      if (to !== undefined) { t[a] = last.groupOf[to]; min.edges.push({ from: gi, sym: a, to: t[a] }); }
    }
    min.trans.push(t);
  });
  return { rounds, min };
}

/* ---------------------------------------------------------
 * 5. 文字列の受理判定（最小 DFA を動かす）
 * --------------------------------------------------------- */
function runDFA(dfa, input) {
  let cur = dfa.start;
  const trace = [cur];
  for (const ch of input) {
    const nxt = dfa.trans[cur][ch];
    if (nxt === undefined) return { accept: false, trace, stuckAt: ch };
    cur = nxt;
    trace.push(cur);
  }
  return { accept: dfa.states[cur].accept, trace };
}

/* ---------------------------------------------------------
 * 6. まとめて実行
 * --------------------------------------------------------- */
function compileAll(src) {
  const ast = parseRegex(src);
  const alphabet = collectAlphabet(ast);
  if (alphabet.length === 0) throw new Error('記号が1つも含まれていません');
  const nfa = buildNFA(ast, src);
  const dfa = subsetConstruction(nfa, alphabet);
  const moore = mooreMinimize(dfa);
  return { src, ast, alphabet, nfa, dfa, rounds: moore.rounds, min: moore.min };
}
