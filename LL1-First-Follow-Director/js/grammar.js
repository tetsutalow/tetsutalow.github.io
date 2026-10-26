/* =========================================================
 * grammar.js
 *   文法 → First / Follow / Director 集合 → LL(1) 判定
 *   → 再帰的下向き構文解析のトレース
 *   （表示とは独立した計算部分。Node.js からも読み込める）
 *   講義「言語処理系 第5回 構文解析・下向き構文解析法」の流儀に合わせている。
 * ========================================================= */
'use strict';

const EPS = 'ε';
const END = '$';

/* ---------------------------------------------------------
 * 1. 文法の読み込み
 *   ・1行に「左辺 → 右辺1 | 右辺2 | …」（→ の代わりに -> や ::= も可）
 *   ・行頭が | の行は直前の左辺の続き
 *   ・左辺に現れる記号が非終端記号。右辺は非終端記号名を最長一致で切り出し、
 *     それ以外は1文字ずつ終端記号とする（後ろの ' や ′ はプライムとして付ける）
 *   ・"id" のようにダブルクォートで囲むと複数文字の終端記号
 *   ・〈式〉 や <expr> は1つの記号
 *   ・ε は空列、$ は入力の終わりを表す特殊記号なので使えない
 * --------------------------------------------------------- */
const ARROW_RE = /→|->|::=|⟶/;
const ALT_CHARS = new Set(['|', '｜', '¦']);
const PRIMES = new Set(["'", '′', '’']);

function tokenizeBody(s, ntByLen) {
  const alts = [[]];
  const push = x => alts[alts.length - 1].push(x);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (ALT_CHARS.has(c)) { alts.push([]); i++; continue; }
    const nt = ntByLen.find(n => s.startsWith(n, i));
    if (nt) { push(nt); i += nt.length; continue; }
    if (c === 'ε' || c === 'ϵ') { i++; continue; }
    if (c === '"' || c === '“' || c === '”') {
      let j = i + 1;
      while (j < s.length && !(s[j] === '"' || s[j] === '”' || s[j] === '“')) j++;
      if (j >= s.length) throw new Error('「"」が閉じていません');
      if (j === i + 1) throw new Error('空の "" は使えません（空列は ε と書きます）');
      push(s.slice(i + 1, j)); i = j + 1; continue;
    }
    if (c === '〈' || c === '<') {
      const close = c === '〈' ? '〉' : '>';
      const j = s.indexOf(close, i + 1);
      if (j > i + 1 && !/[\s|]/.test(s.slice(i + 1, j))) {
        let k = j + 1;
        while (k < s.length && PRIMES.has(s[k])) k++;
        push(s.slice(i, k)); i = k; continue;
      }
    }
    let k = i + 1;
    while (k < s.length && PRIMES.has(s[k])) k++;
    push(s.slice(i, k)); i = k;
  }
  return alts;
}

function parseGrammar(text, startOverride) {
  const errors = [], warnings = [];
  const entries = [];
  let lastLhs = null;
  text.split(/\r?\n/).forEach((raw, idx) => {
    const lineNo = idx + 1;
    let s = raw.trim();
    if (!s || s.startsWith('//') || s.startsWith('#')) return;
    s = s.replace(/^[（(]\d+[)）]\s*/, '');           // 「(1) E → …」の番号は読み飛ばす
    if (ALT_CHARS.has(s[0])) {
      if (!lastLhs) { errors.push(`${lineNo}行目: 「|」で始まっていますが、前に左辺がありません`); return; }
      entries.push({ lhs: lastLhs, body: s.slice(1), line: lineNo });
      return;
    }
    const m = s.match(ARROW_RE);
    if (!m) { errors.push(`${lineNo}行目: 「→」（または ->）が見つかりません: ${s}`); return; }
    const lhs = s.slice(0, m.index).replace(/\s+/g, '');
    if (!lhs) { errors.push(`${lineNo}行目: 左辺が空です`); return; }
    if (lhs === EPS || lhs === END) { errors.push(`${lineNo}行目: ${lhs} は左辺に使えません`); return; }
    lastLhs = lhs;
    entries.push({ lhs, body: s.slice(m.index + m[0].length), line: lineNo });
  });

  const nts = [];
  for (const e of entries) if (!nts.includes(e.lhs)) nts.push(e.lhs);
  const ntSet = new Set(nts);
  const ntByLen = [...nts].sort((a, b) => b.length - a.length);
  const prods = [], terminals = [], seen = new Set();
  for (const e of entries) {
    let alts;
    try { alts = tokenizeBody(e.body, ntByLen); }
    catch (err) { errors.push(`${e.line}行目: ${err.message}`); continue; }
    for (const rhs of alts) {
      const key = e.lhs + '\u0000' + rhs.join('\u0001');
      if (seen.has(key)) { warnings.push(`${e.line}行目: 生成規則 ${e.lhs}→${showSeq(rhs)} が重複しているので1つにまとめました`); continue; }
      seen.add(key);
      prods.push({ id: prods.length, lhs: e.lhs, rhs, line: e.line });
      for (const x of rhs) if (!ntSet.has(x) && !terminals.includes(x)) terminals.push(x);
    }
  }
  if (terminals.includes(END)) errors.push('$ は入力の終わりを表す特殊記号なので、文法の中では使えません');
  for (const t of terminals) {
    if (/^[〈<].+[〉>]/.test(t) || /^[A-Z][’'′]*$/.test(t))
      warnings.push(`記号 ${t} は左辺に現れないので、終端記号として扱います`);
  }
  if (!prods.length && !errors.length) errors.push('生成規則がありません');

  let start = nts[0];
  if (startOverride && ntSet.has(startOverride)) start = startOverride;
  const prodsOf = new Map(nts.map(a => [a, prods.filter(p => p.lhs === a)]));
  return { nts, ntSet, ntByLen, terminals, prods, prodsOf, start, errors, warnings };
}

const showSeq = rhs => rhs.length ? rhs.join('') : EPS;

/* ---------------------------------------------------------
 * 2. First 集合（教科書 p.52）
 *   First(ε) = {ε}, First(aα) = {a},
 *   First(Yα) = First(Y)            （ε ∉ First(Y)）
 *             = (First(Y)−{ε}) ∪ First(α) （ε ∈ First(Y)）
 *   X→α なら First(X) に First(α) を加え、変化がなくなるまで繰り返す
 * --------------------------------------------------------- */
function seqFirst(seq, first, ntSet) {
  const set = new Set(), parts = [];
  for (const x of seq) {
    if (!ntSet.has(x)) { set.add(x); parts.push({ t: x }); return { set, parts, nullable: false }; }
    const f = first.get(x);
    for (const y of f) if (y !== EPS) set.add(y);
    parts.push({ nt: x });
    if (!f.has(EPS)) return { set, parts, nullable: false };
  }
  set.add(EPS);
  return { set, parts, nullable: true };
}

const snapMap = m => new Map([...m].map(([k, v]) => [k, [...v]]));

function computeFirst(g) {
  const first = new Map(g.nts.map(a => [a, new Set()]));
  const rounds = [];
  for (let r = 0; r < 500; r++) {
    const adds = [];
    for (const p of g.prods) {
      const sf = seqFirst(p.rhs, first, g.ntSet);
      const tgt = first.get(p.lhs), added = [];
      for (const x of sf.set) if (!tgt.has(x)) { tgt.add(x); added.push(x); }
      if (added.length) adds.push({ prod: p.id, set: [...sf.set], parts: sf.parts, nullable: sf.nullable, added });
    }
    rounds.push({ adds, snap: snapMap(first) });
    if (!adds.length) break;
  }
  const ofProd = g.prods.map(p => {
    const sf = seqFirst(p.rhs, first, g.ntSet);
    return { set: [...sf.set], parts: sf.parts, nullable: sf.nullable };
  });
  return { first, rounds, ofProd };
}

/* ---------------------------------------------------------
 * 3. Follow 集合（教科書 p.53）
 *   Follow(開始記号) に $ を加える
 *   A→αBβ なら First(β)−{ε} を Follow(B) に加え、
 *   ε ∈ First(β)（β=ε を含む）なら Follow(A) を Follow(B) に加える
 * --------------------------------------------------------- */
function computeFollow(g, first) {
  const follow = new Map(g.nts.map(a => [a, new Set()]));
  follow.get(g.start).add(END);
  const rounds = [{ adds: [{ kind: 'init', nt: g.start, added: [END] }], snap: snapMap(follow) }];
  for (let r = 0; r < 500; r++) {
    const adds = [];
    for (const p of g.prods) {
      p.rhs.forEach((B, k) => {
        if (!g.ntSet.has(B)) return;
        const beta = p.rhs.slice(k + 1);
        const sf = seqFirst(beta, first, g.ntSet);
        const tgt = follow.get(B);
        const a1 = [];
        for (const x of sf.set) if (x !== EPS && !tgt.has(x)) { tgt.add(x); a1.push(x); }
        if (a1.length) adds.push({ kind: 'first', prod: p.id, pos: k, nt: B, beta, set: [...sf.set].filter(x => x !== EPS), parts: sf.parts, nullable: sf.nullable, added: a1 });
        if (sf.nullable && B !== p.lhs) {
          const a2 = [];
          for (const x of follow.get(p.lhs)) if (!tgt.has(x)) { tgt.add(x); a2.push(x); }
          if (a2.length) adds.push({ kind: 'follow', prod: p.id, pos: k, nt: B, beta, from: p.lhs, added: a2 });
        }
      });
    }
    rounds.push({ adds, snap: snapMap(follow) });
    if (!adds.length) break;
  }
  return { follow, rounds };
}

/* ---------------------------------------------------------
 * 4. Director 集合
 *   Director(A, α) = First(α)−{ε}，ただし α ⇒* ε なら Follow(A) も加える
 * --------------------------------------------------------- */
function computeDirector(g, firstRes, follow) {
  return g.prods.map(p => {
    const fp = firstRes.ofProd[p.id];
    const dir = new Set(fp.set.filter(x => x !== EPS));
    if (fp.nullable) for (const x of follow.get(p.lhs)) dir.add(x);
    return { prod: p.id, first: fp.set, parts: fp.parts, nullable: fp.nullable,
             follow: fp.nullable ? [...follow.get(p.lhs)] : null, set: [...dir] };
  });
}

/* ---------------------------------------------------------
 * 5. 左再帰・共通の先頭部分の検出と LL(1) 判定
 * --------------------------------------------------------- */
function detectLeftRecursion(g, first) {
  const nullable = x => g.ntSet.has(x) && first.get(x).has(EPS);
  const edges = new Map(g.nts.map(a => [a, []]));
  for (const p of g.prods) {
    for (const x of p.rhs) {
      if (!g.ntSet.has(x)) break;
      edges.get(p.lhs).push({ to: x, prod: p.id });
      if (!nullable(x)) break;
    }
  }
  const res = [];
  for (const A of g.nts) {
    const direct = g.prodsOf.get(A).filter(p => p.rhs[0] === A).map(p => p.id);
    if (direct.length) { res.push({ nt: A, direct: true, prods: direct, path: [A, A] }); continue; }
    // A から出て A に戻る経路を幅優先で探す（間接左再帰）
    const prev = new Map(), q = [];
    for (const e of edges.get(A)) if (!prev.has(e.to)) { prev.set(e.to, { from: A, prod: e.prod }); q.push(e.to); }
    let found = prev.has(A);
    while (q.length && !found) {
      const u = q.shift();
      for (const e of edges.get(u)) {
        if (prev.has(e.to)) continue;
        prev.set(e.to, { from: u, prod: e.prod }); q.push(e.to);
        if (e.to === A) { found = true; break; }
      }
    }
    if (!found) continue;
    const path = [A], prs = [];
    let cur = A;
    do { const pv = prev.get(cur); prs.unshift(pv.prod); path.unshift(pv.from); cur = pv.from; } while (cur !== A && path.length < 50);
    res.push({ nt: A, direct: false, prods: prs, path });
  }
  return res;
}

function detectCommonPrefix(g) {
  const res = [];
  for (const A of g.nts) {
    const groups = new Map();
    for (const p of g.prodsOf.get(A)) {
      if (!p.rhs.length) continue;
      if (!groups.has(p.rhs[0])) groups.set(p.rhs[0], []);
      groups.get(p.rhs[0]).push(p.id);
    }
    for (const [sym, ids] of groups) if (ids.length > 1) res.push({ nt: A, sym, prods: ids });
  }
  return res;
}

function checkLL1(g, director) {
  const checks = [];
  for (const A of g.nts) {
    const ps = g.prodsOf.get(A);
    if (ps.length < 2) continue;
    const pairs = [];
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const sb = new Set(director[ps[j].id].set);
        pairs.push({ a: ps[i].id, b: ps[j].id, inter: director[ps[i].id].set.filter(x => sb.has(x)) });
      }
    checks.push({ nt: A, prods: ps.map(p => p.id), pairs, ok: pairs.every(p => !p.inter.length) });
  }
  const cols = [...g.terminals, END];
  const table = new Map(g.nts.map(a => [a, new Map(cols.map(c => [c, []]))]));
  for (const d of director) {
    const p = g.prods[d.prod];
    for (const x of d.set) table.get(p.lhs).get(x).push(p.id);
  }
  return { checks, table, cols };
}

/* ---------------------------------------------------------
 * 6. 文法の書き換え（左再帰の除去 p.49，括り出し p.51）
 * --------------------------------------------------------- */
function rulesFrom(g) {
  return { order: [...g.nts], rules: new Map(g.nts.map(a => [a, g.prodsOf.get(a).map(p => [...p.rhs])])) };
}
function freshName(A, order) {
  let n = A + "'";
  while (order.includes(n)) n += "'";
  return n;
}
function insertAfter(order, A, B) { order.splice(order.indexOf(A) + 1, 0, B); }

function removeLeftRecursion(g) {
  const R = rulesFrom(g), notes = [];
  for (const A of g.nts) {
    const alts = R.rules.get(A);
    const alphas = alts.filter(r => r[0] === A).map(r => r.slice(1));
    if (!alphas.length) continue;
    const betas = alts.filter(r => r[0] !== A);
    if (!betas.length) { notes.push(`${A} は左再帰の規則しかないため書き換えられません`); continue; }
    const A2 = freshName(A, R.order);
    R.rules.set(A, betas.map(b => [...b, A2]));
    R.rules.set(A2, [...alphas.filter(a => a.length).map(a => [...a, A2]), []]);
    insertAfter(R.order, A, A2);
    notes.push(`${A} → ${alphas.map(a => A + showSeq(a)).join(' | ')} | ${betas.map(showSeq).join(' | ')} を ${A} → ${betas.map(b => showSeq([...b, A2])).join(' | ')}，${A2} → ${alphas.map(a => showSeq([...a, A2])).join(' | ')} | ε に書き換えました`);
  }
  const indirect = detectLeftRecursion(g, computeFirst(g).first).filter(x => !x.direct);
  if (indirect.length) notes.push(`間接的な左再帰（${indirect.map(x => x.path.join(' ⇒ ')).join('，')}）は自動では除去しません`);
  return { text: rulesToText(R, g.terminals), notes };
}

function leftFactor(g) {
  const R = rulesFrom(g), notes = [];
  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    for (const A of [...R.order]) {
      const alts = R.rules.get(A);
      const groups = new Map();
      alts.forEach((r, i) => { if (r.length) { if (!groups.has(r[0])) groups.set(r[0], []); groups.get(r[0]).push(i); } });
      const grp = [...groups.values()].find(ix => ix.length > 1);
      if (!grp) continue;
      const rs = grp.map(i => alts[i]);
      let n = 0;
      while (rs.every(r => r.length > n && r[n] === rs[0][n])) n++;
      const alpha = rs[0].slice(0, n);
      const A2 = freshName(A, R.order);
      const newAlts = [];
      alts.forEach((r, i) => {
        if (i === grp[0]) newAlts.push([...alpha, A2]);
        else if (!grp.includes(i)) newAlts.push(r);
      });
      R.rules.set(A, newAlts);
      R.rules.set(A2, rs.map(r => r.slice(n)));
      insertAfter(R.order, A, A2);
      notes.push(`${A} → ${rs.map(showSeq).join(' | ')} の共通部分 ${showSeq(alpha)} を括り出し，${A} → ${showSeq([...alpha, A2])}，${A2} → ${rs.map(r => showSeq(r.slice(n))).join(' | ')} にしました`);
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return { text: rulesToText(R, g.terminals), notes };
}

function rulesToText(R, terminals) {
  const ntByLen = [...R.order].sort((a, b) => b.length - a.length);
  const ntSet = new Set(R.order);
  const symText = x => {
    if (ntSet.has(x)) return x;
    const t = tokenizeBody(x, ntByLen);
    return (t.length === 1 && t[0].length === 1 && t[0][0] === x) ? x : `"${x}"`;
  };
  return R.order.map(A => `${A} → ${R.rules.get(A).map(r => r.length ? r.map(symText).join(' ') : EPS).join(' | ')}`).join('\n');
}

/* ---------------------------------------------------------
 * 7. 再帰的下向き構文解析の疑似コード（講義スライド p.14 の形）
 * --------------------------------------------------------- */
function buildCode(g, director) {
  const lines = [], header = {}, end = {}, errorLine = {}, cond = {}, body = {};
  const L = (text, extra = {}) => { lines.push({ text, ...extra }); return lines.length - 1; };
  const stmt = x => g.ntSet.has(x) ? `${x}();` : `${x} を読む;`;
  for (const A of g.nts) {
    const ps = g.prodsOf.get(A);
    header[A] = L(`void ${A}() {`, { nt: A });
    if (ps.length === 1) {
      const p = ps[0];
      body[p.id] = p.rhs.length ? p.rhs.map(x => L('    ' + stmt(x), { nt: A })) : [L('    /* ε：何も読まない */', { nt: A })];
      errorLine[A] = header[A];
    } else {
      ps.forEach((p, i) => {
        cond[p.id] = L(`    ${i ? '} else if' : 'if'} (次 ∈ {${director[p.id].set.map(x => `'${x}'`).join(', ')}}) {`, { nt: A, comment: `${A}→${showSeq(p.rhs)}` });
        body[p.id] = p.rhs.length ? p.rhs.map(x => L('        ' + stmt(x), { nt: A })) : [L('        /* ε：何も読まない */', { nt: A })];
      });
      L('    } else {', { nt: A });
      errorLine[A] = L('        導出できない（エラー）;', { nt: A });
      L('    }', { nt: A });
    }
    end[A] = L('}', { nt: A });
    L('');
  }
  lines.pop();
  return { lines, header, end, errorLine, cond, body };
}

/* ---------------------------------------------------------
 * 8. 入力の字句分割と構文解析のトレース
 * --------------------------------------------------------- */
function tokenizeInput(str, g) {
  const terms = [...g.terminals].sort((a, b) => b.length - a.length);
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    const t = terms.find(t => str.startsWith(t, i));
    if (t) { tokens.push(t); i += t.length; continue; }
    if (/\s/.test(str[i])) { i++; continue; }
    return { tokens, error: `${i + 1}文字目の「${str[i]}」はこの文法の終端記号ではありません` };
  }
  return { tokens };
}

function traceParse(g, an, tokens) {
  const code = an.code, director = an.director;
  const nodes = [], events = [], derivs = [];
  const frames = [];
  let pos = 0;
  const STOP = {};
  const la = () => pos < tokens.length ? tokens[pos] : END;

  const mkNode = (sym, kind, parent) => {
    const n = { id: nodes.length, sym, kind, parent, children: [], createdAt: events.length, expandedAt: -1, matchedAt: -1, prod: -1 };
    nodes.push(n);
    if (parent >= 0) nodes[parent].children.push(n.id);
    return n;
  };
  const emit = (type, text, line, extra = {}) => {
    if (events.length > 20000) { events.push({ type: 'error', text: '手順が多すぎるため打ち切りました', line: -1, pos, la: la(), frames: [], deriv: derivs.length - 1 }); throw STOP; }
    if (frames.length && line >= 0) frames[frames.length - 1].line = line;
    events.push({ type, text, line, pos, la: la(), frames: frames.map(f => ({ ...f })), deriv: derivs.length - 1, ...extra });
  };
  const frontier = id => {
    const n = nodes[id];
    if (n.kind === 't') return [n.sym];
    if (n.kind === 'eps') return [];
    if (n.expandedAt < 0) return [n.sym];
    return n.children.flatMap(frontier);
  };

  function parseNT(n) {
    const A = n.sym;
    if (frames.length > 400) { emit('error', '再帰が深すぎるため打ち切りました', -1); throw STOP; }
    const caller = frames.length ? frames[frames.length - 1].nt : null;
    frames.push({ nt: A, line: code.header[A], node: n.id });
    emit('call', caller ? `${caller}() から ${A}() を呼び出す` : `開始記号 ${A} の関数 ${A}() を呼び出して解析を始める`, code.header[A], { node: n.id });
    const ps = g.prodsOf.get(A);
    const p = ps.length === 1 ? ps[0] : ps.find(q => director[q.id].set.includes(la()));
    if (!p) {
      emit('error', `先読みした字句 ${la()} は ${ps.map(q => `Director(${A}, ${showSeq(q.rhs)})`).join('，')} のどれにも含まれない → 導出できない（構文エラー）`, code.errorLine[A], { node: n.id });
      throw STOP;
    }
    const kids = p.rhs.length ? p.rhs.map(x => mkNode(x, g.ntSet.has(x) ? 'nt' : 't', n.id)) : [mkNode(EPS, 'eps', n.id)];
    n.expandedAt = events.length; n.prod = p.id;
    derivs.push(frontier(0));
    const a = showSeq(p.rhs);
    emit('choose', ps.length === 1
      ? `${A} の生成規則は ${A}→${a} だけなので，これで導出する`
      : `先読み ${la()} ∈ Director(${A}, ${a}) = {${director[p.id].set.join(', ')}} なので ${A}→${a} で導出する`,
      ps.length === 1 ? code.header[A] : code.cond[p.id], { node: n.id, prod: p.id });
    if (!p.rhs.length) emit('eps', 'ε なので何も読まない', code.body[p.id][0], { node: n.id });
    p.rhs.forEach((x, k) => {
      const kid = kids[k];
      if (g.ntSet.has(x)) {
        frames[frames.length - 1].line = code.body[p.id][k];
        parseNT(kid);
      } else if (la() === x) {
        kid.matchedAt = events.length; pos++;
        emit('match', `${x} を読む（先読みした字句と一致）`, code.body[p.id][k], { node: kid.id });
      } else {
        emit('error', `${x} を読むはずが，次の字句は ${la()} → 構文エラー`, code.body[p.id][k], { node: kid.id });
        throw STOP;
      }
    });
    emit('return', `${A}() の処理が終わったので呼び出し元へ戻る`, code.end[A], { node: n.id });
    frames.pop();
  }

  let accepted = false;
  const root = mkNode(g.start, 'nt', -1);
  derivs.push([g.start]);
  try {
    parseNT(root);
    if (la() === END) { accepted = true; emit('accept', '入力をすべて読み終えた（次は $）→ 受理', -1); }
    else emit('error', `${g.start}() から戻ったのに，まだ入力 ${la()} が残っている → 構文エラー`, -1);
  } catch (e) { if (e !== STOP) throw e; }
  return { tokens, nodes, events, derivs, accepted };
}

/* ---------------------------------------------------------
 * 9. 文法から例文を作る（なるべく短く終わるように乱択）
 * --------------------------------------------------------- */
function generateSentence(g, maxDepth = 6) {
  const cost = new Map(g.nts.map(a => [a, Infinity]));
  const pc = p => p.rhs.reduce((s, x) => s + (g.ntSet.has(x) ? cost.get(x) : 1), 1);
  for (let changed = true; changed;) {
    changed = false;
    for (const p of g.prods) { const c = pc(p); if (c < cost.get(p.lhs)) { cost.set(p.lhs, c); changed = true; } }
  }
  if (cost.get(g.start) === Infinity) return null;
  const out = [];
  const gen = (A, d) => {
    if (out.length > 40) d = 99;
    const ps = g.prodsOf.get(A).filter(p => pc(p) < Infinity);
    let p;
    if (d >= maxDepth) p = ps.reduce((a, b) => pc(a) <= pc(b) ? a : b);
    else p = ps[Math.floor(Math.random() * ps.length)];
    for (const x of p.rhs) g.ntSet.has(x) ? gen(x, d + 1) : out.push(x);
  };
  gen(g.start, 0);
  return out;
}

/* ---------------------------------------------------------
 * 10. まとめて解析
 * --------------------------------------------------------- */
function analyzeGrammar(g) {
  const firstRes = computeFirst(g);
  const followRes = computeFollow(g, firstRes.first);
  const director = computeDirector(g, firstRes, followRes.follow);
  const leftRec = detectLeftRecursion(g, firstRes.first);
  const prefixes = detectCommonPrefix(g);
  const ll = checkLL1(g, director);
  const isLL1 = ll.checks.every(c => c.ok) && !leftRec.length;
  const code = buildCode(g, director);
  return { firstRes, followRes, director, leftRec, prefixes, ll, isLL1, code };
}

if (typeof module !== 'undefined') {
  module.exports = { EPS, END, parseGrammar, analyzeGrammar, tokenizeInput, traceParse, removeLeftRecursion, leftFactor, generateSentence, showSeq };
}
