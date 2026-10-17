/* =========================================================
 * draw.js
 *   NFA / DFA を SVG で描く（外部ライブラリなし）
 * ========================================================= */
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  for (const c of children) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

function arrowDefs(idSuffix = '') {
  const mk = (id, color) => svgEl('marker', {
    id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9,
    orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse'
  }, [svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color })]);
  return svgEl('defs', {}, [mk('arrow' + idSuffix, '#222'), mk('arrowhl' + idSuffix, '#d0202a')]);
}

/** テキスト幅の概算（px） */
function textWidth(str, size = 15) {
  let w = 0;
  for (const ch of str) w += /[ -~]/.test(ch) ? size * 0.58 : size * 1.0;
  return w;
}

function unit(dx, dy) { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }

/** 楕円 (cx,cy,rx,ry) の中心から (tx,ty) 方向へ伸ばしたときの境界点 */
function ellipseBoundary(cx, cy, rx, ry, tx, ty) {
  const dx = tx - cx, dy = ty - cy;
  const k = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2 || 1);
  return [cx + dx * k, cy + dy * k];
}

function edgeLabel(x, y, text, cls = 'elabel') {
  return svgEl('text', { x, y, class: cls, 'text-anchor': 'middle' }, [text]);
}

/* ---------------------------------------------------------
 * NFA: 状態を番号順に一直線に並べる（講義の図と同じ）
 *   opts.edgeCount   : 表示する遷移の本数（段階表示用）
 *   opts.lastEdge    : 直前に追加された遷移を強調
 *   opts.source      : Set<state> 赤い太枠で強調
 *   opts.targets     : Map<state, color> 塗りつぶしで強調
 * --------------------------------------------------------- */
function drawNFA(nfa, opts = {}) {
  const r = 20, gap = 92, x0 = 60, suffix = '_n' + Math.random().toString(36).slice(2, 7);
  const n = nfa.states.length;
  const edges = nfa.edges.slice(0, opts.edgeCount === undefined ? nfa.edges.length : opts.edgeCount);
  const visible = new Set([nfa.start]);
  edges.forEach(e => { visible.add(e.from); visible.add(e.to); });

  // 並行する遷移（同じ from,to）に番号を付ける
  const parallel = new Map();
  const edgeInfo = edges.map(e => {
    const k = e.from + '>' + e.to;
    const idx = parallel.get(k) || 0;
    parallel.set(k, idx + 1);
    return { ...e, k: idx };
  });

  let maxUp = 40, maxDown = 40;
  const cx = i => x0 + i * gap;
  const paths = [], labels = [];

  // 弧の高さを決める: 同じ側で区間が重なる弧は一段ずつ高くする（ラベルが重ならないように）
  const placed = { up: [], down: [] };
  const arcHeight = e => {
    const fwd = e.to > e.from;
    const lo = Math.min(e.from, e.to), hi = Math.max(e.from, e.to);
    const side = placed[fwd ? 'up' : 'down'];
    let level = 1;
    for (const p of side) if (p.lo < hi && lo < p.hi) level = Math.max(level, p.level + 1);
    side.push({ lo, hi, level });
    return Math.max(16 + 48 * level, 30 * (hi - lo));
  };
  const heights = edgeInfo.map(e => (e.from === e.to || (e.to === e.from + 1 && e.k === 0)) ? 0 : arcHeight(e));

  edgeInfo.forEach((e, ei) => {
    const hl = opts.lastEdge !== undefined && ei === opts.lastEdge;
    const stroke = hl ? '#d0202a' : '#222';
    const marker = `url(#${hl ? 'arrowhl' : 'arrow'}${suffix})`;
    const cls = 'edge' + (hl ? ' edge-hl' : '');
    const xa = cx(e.from), xb = cx(e.to), y = 0;
    if (e.from === e.to) {                          // 自己ループ（この構成法では出ないが念のため）
      const h = 60 + 24 * e.k;
      const d = `M ${xa - 10} ${y - r + 3} C ${xa - 40} ${y - h}, ${xa + 40} ${y - h}, ${xa + 10} ${y - r + 3}`;
      paths.push(svgEl('path', { d, class: cls, stroke, 'marker-end': marker }));
      labels.push(edgeLabel(xa, y - h * 0.72, e.sym));
      maxUp = Math.max(maxUp, h + 10);
    } else if (e.to === e.from + 1 && e.k === 0) {  // 隣へ: 直線
      paths.push(svgEl('path', { d: `M ${xa + r} ${y} L ${xb - r} ${y}`, class: cls, stroke, 'marker-end': marker }));
      labels.push(edgeLabel((xa + xb) / 2, y - 8, e.sym));
    } else {                                        // 弧: 前進は上、後退は下
      const fwd = e.to > e.from;
      const h = heights[ei];
      const mx = (xa + xb) / 2, cy = fwd ? y - h : y + h;
      const [ux1, uy1] = unit(mx - xa, cy - y);
      const [ux2, uy2] = unit(mx - xb, cy - y);
      const p0 = [xa + ux1 * r, y + uy1 * r], p2 = [xb + ux2 * r, y + uy2 * r];
      const d = `M ${p0[0]} ${p0[1]} Q ${mx} ${cy} ${p2[0]} ${p2[1]}`;
      paths.push(svgEl('path', { d, class: cls, stroke, 'marker-end': marker }));
      const ly = 0.25 * p0[1] + 0.5 * cy + 0.25 * p2[1];
      labels.push(edgeLabel(mx, fwd ? ly - 6 : ly + 16, e.sym));
      if (fwd) maxUp = Math.max(maxUp, h * 0.5 + 24); else maxDown = Math.max(maxDown, h * 0.5 + 28);
    }
  });

  const width = x0 + (n - 1) * gap + 60, height = maxUp + maxDown + 2 * r;
  const svg = svgEl('svg', { viewBox: `${-30} ${-maxUp - r} ${width + 30} ${height}`, class: 'automaton nfa', width: width + 30 });
  svg.appendChild(arrowDefs(suffix));
  const g = svgEl('g');
  paths.forEach(p => g.appendChild(p));

  // 初期状態の矢印
  g.appendChild(svgEl('path', { d: `M ${cx(nfa.start) - r - 34} 0 L ${cx(nfa.start) - r - 2} 0`, class: 'edge', 'marker-end': `url(#arrow${suffix})` }));

  for (let i = 0; i < n; i++) {
    if (!visible.has(i)) continue;
    const isAcc = i === nfa.accept;
    const fill = opts.targets && opts.targets.has(i) ? opts.targets.get(i) : (opts.source && opts.source.has(i) ? '#ffd3d3' : '#fff');
    const ng = svgEl('g', { class: 'state' + (opts.source && opts.source.has(i) ? ' src' : '') });
    ng.appendChild(svgEl('circle', { cx: cx(i), cy: 0, r, fill, class: 'node' }));
    if (isAcc) ng.appendChild(svgEl('circle', { cx: cx(i), cy: 0, r: r - 4, fill: 'none', class: 'node-inner' }));
    ng.appendChild(svgEl('text', { x: cx(i), y: 0, class: 'slabel', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, [String(i)]));
    g.appendChild(ng);
  }
  labels.forEach(l => g.appendChild(l));
  svg.appendChild(g);
  return svg;
}

/* ---------------------------------------------------------
 * DFA: 初期状態からの幅優先の深さで左から右に並べる
 *   dfa.states[i] / dfa.edges {from,sym,to} / dfa.start
 *   opts.label(i)      : 状態名
 *   opts.fill(i)       : 塗り色
 *   opts.visibleStates : 表示する状態数（先頭から）
 *   opts.edgeCount     : 表示する遷移数（先頭から）
 *   opts.source        : 強調する状態 id
 *   opts.targets       : Map<id,color> 枠を色で強調
 *   opts.accept(i)
 * --------------------------------------------------------- */
function layoutDFA(dfa) {
  const n = dfa.states.length;
  const layer = new Array(n).fill(-1);
  const order = [];
  layer[dfa.start] = 0; order.push(dfa.start);
  for (let qi = 0; qi < order.length; qi++) {
    const s = order[qi];
    for (const e of dfa.edges) if (e.from === s && layer[e.to] < 0) { layer[e.to] = layer[s] + 1; order.push(e.to); }
  }
  for (let i = 0; i < n; i++) if (layer[i] < 0) { layer[i] = 0; order.push(i); }
  const layers = [];
  order.forEach(s => { (layers[layer[s]] = layers[layer[s]] || []).push(s); });
  return { layer, layers };
}

function drawDFA(dfa, opts = {}) {
  const suffix = '_d' + Math.random().toString(36).slice(2, 7);
  const n = dfa.states.length;
  const label = opts.label || (i => String(i));
  const accept = opts.accept || (i => dfa.states[i].accept);
  const fillOf = opts.fill || (() => '#fff');
  const visN = opts.visibleStates === undefined ? n : opts.visibleStates;
  const edges = dfa.edges.slice(0, opts.edgeCount === undefined ? dfa.edges.length : opts.edgeCount);
  const { layer, layers } = layoutDFA(dfa);

  // 大きさ
  const ry = 21, fontSize = 15;
  const rx = new Array(n).fill(0).map((_, i) => Math.max(22, textWidth(label(i), fontSize) / 2 + 12));
  const colX = [];
  let x = 60;
  layers.forEach((L, li) => {
    const w = Math.max(...L.map(s => rx[s])) * 2;
    colX[li] = x + w / 2;
    x += w + 80;
  });
  const rowGap = 118;
  const maxRows = Math.max(...layers.map(L => L.length));
  const totalH = Math.max(1, maxRows) * rowGap;
  const pos = new Array(n);
  layers.forEach((L, li) => {
    const h = L.length * rowGap;
    L.forEach((s, k) => { pos[s] = [colX[li], (totalH - h) / 2 + k * rowGap + rowGap / 2]; });
  });

  // 遷移を (from,to) でまとめる
  const merged = new Map();
  edges.forEach(e => {
    const k = e.from + '>' + e.to;
    if (!merged.has(k)) merged.set(k, { from: e.from, to: e.to, syms: [] });
    merged.get(k).syms.push(e.sym);
  });
  const has = (a, b) => merged.has(a + '>' + b);

  const svg = svgEl('svg', { class: 'automaton dfa' });
  svg.appendChild(arrowDefs(suffix));
  const g = svgEl('g');
  let minY = 0, maxY = totalH;

  // 初期状態の矢印
  const [sx, sy] = pos[dfa.start];
  g.appendChild(svgEl('path', { d: `M ${sx - rx[dfa.start] - 36} ${sy} L ${sx - rx[dfa.start] - 2} ${sy}`, class: 'edge', 'marker-end': `url(#arrow${suffix})` }));

  const labelEls = [];
  for (const m of merged.values()) {
    const [xa, ya] = pos[m.from], [xb, yb] = pos[m.to];
    const text = m.syms.join(', ');
    const hl = opts.hlEdges && opts.hlEdges.has(m.from + '>' + m.to);
    const stroke = hl ? '#d0202a' : '#222';
    const marker = `url(#${hl ? 'arrowhl' : 'arrow'}${suffix})`;
    const cls = 'edge' + (hl ? ' edge-hl' : '');
    if (m.from === m.to) {
      // 自己ループ: 列の一番上の状態なら上側、それ以外は下側に描く（上の状態と重ならないように）
      const up = layers[layer[m.from]][0] === m.from;
      const s = up ? -1 : 1;
      const y0 = ya + s * (ry - 2), yc = ya + s * (ry + 50);
      const d = `M ${xa - 12} ${y0} C ${xa - 34} ${yc}, ${xa + 34} ${yc}, ${xa + 12} ${y0}`;
      g.appendChild(svgEl('path', { d, class: cls, stroke, 'marker-end': marker }));
      labelEls.push(edgeLabel(xa, up ? ya - ry - 42 : ya + ry + 52, text));
      if (up) minY = Math.min(minY, ya - ry - 60); else maxY = Math.max(maxY, ya + ry + 62);
      continue;
    }
    let k;                                     // 曲がり具合
    const mx = (xa + xb) / 2, my = (ya + yb) / 2;
    const [ux, uy] = unit(xb - xa, yb - ya);
    let nx = -uy, ny = ux;                     // 進行方向の右側
    let cxp, cyp;
    if (layer[m.to] > layer[m.from]) k = 0;       // 前進: 直線（逆向きは外側を回るので重ならない）
    else if (layer[m.to] === layer[m.from]) {
      // 同じ列の中の遷移: 逆向きもあれば右手側に、なければ左側（入ってくる遷移と交差しにくい）に曲げる
      k = 40;
      if (!has(m.to, m.from)) { nx = -1; ny = 0; }
    }
    else {
      // 戻り遷移: 図の外側（上半分の状態なら上、下半分なら下）を大きく回る
      const diff = layer[m.from] - layer[m.to];
      const above = (ya + yb) / 2 <= totalH / 2;
      const yOut = above ? Math.min(ya, yb) - (70 + 40 * diff) : Math.max(ya, yb) + (70 + 40 * diff);
      cxp = mx; cyp = yOut;
      nx = 0; ny = above ? -1 : 1; k = Math.abs(yOut - my);
    }
    if (cxp === undefined) { cxp = mx + nx * k; cyp = my + ny * k; }
    const p0 = ellipseBoundary(xa, ya, rx[m.from] + 1, ry + 1, cxp, cyp);
    const p2 = ellipseBoundary(xb, yb, rx[m.to] + 1, ry + 1, cxp, cyp);
    const d = k === 0 ? `M ${p0[0]} ${p0[1]} L ${p2[0]} ${p2[1]}` : `M ${p0[0]} ${p0[1]} Q ${cxp} ${cyp} ${p2[0]} ${p2[1]}`;
    g.appendChild(svgEl('path', { d, class: cls, stroke, 'marker-end': marker }));
    const bx = 0.25 * p0[0] + 0.5 * cxp + 0.25 * p2[0], by = 0.25 * p0[1] + 0.5 * cyp + 0.25 * p2[1];
    const off = k === 0 ? -12 : 13 * Math.sign(k);
    const lx = bx + (k === 0 ? 0 : nx * off), ly = by + (k === 0 ? off : ny * off) + 5;
    labelEls.push(edgeLabel(lx, ly, text));
    minY = Math.min(minY, cyp - 10, ly - 14); maxY = Math.max(maxY, cyp + 10, ly + 6);
  }

  for (let i = 0; i < Math.min(visN, n); i++) {
    const [px, py] = pos[i];
    const isSrc = opts.source === i;
    const tcol = opts.targets && opts.targets.get(i);
    const ng = svgEl('g', { class: 'state' + (isSrc ? ' src' : '') });
    ng.appendChild(svgEl('ellipse', { cx: px, cy: py, rx: rx[i], ry, fill: fillOf(i), class: 'node', stroke: tcol || undefined, 'stroke-width': tcol ? 3.5 : undefined }));
    if (accept(i)) ng.appendChild(svgEl('ellipse', { cx: px, cy: py, rx: rx[i] - 4, ry: ry - 4, fill: 'none', class: 'node-inner' }));
    ng.appendChild(svgEl('text', { x: px, y: py, class: 'slabel', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, [label(i)]));
    g.appendChild(ng);
  }
  labelEls.forEach(l => g.appendChild(l));
  svg.appendChild(g);
  const width = x + 10, top = Math.min(minY, -10) - 10, height = Math.max(maxY, totalH) + 20 - top;
  svg.setAttribute('viewBox', `0 ${top} ${width} ${height}`);
  svg.setAttribute('width', width);
  return svg;
}
