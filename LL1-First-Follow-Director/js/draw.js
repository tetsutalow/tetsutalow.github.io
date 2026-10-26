/* =========================================================
 * draw.js
 *   構文木の SVG 描画（グラフィックライブラリは使わない）
 * ========================================================= */
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, children = []) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

/* 文字幅のおおまかな見積もり（全角は 2 文字分） */
function textWidth(s, fontSize) {
  let w = 0;
  for (const ch of s) w += /[　-鿿＀-￯]/.test(ch) ? fontSize : fontSize * 0.62;
  return w;
}

/* ---------------------------------------------------------
 * 構文木のレイアウト
 *   trace.nodes のうち createdAt <= upto のものだけを描く。
 *   葉を左から順に並べ、親は子の中央に置く（最左導出の順序が保たれる）。
 * --------------------------------------------------------- */
function layoutTree(trace, upto) {
  const nodes = trace.nodes;
  // ε だけを導出する枝（ε の葉と、展開済みで下に終端記号が1つもない非終端記号）は描かない。
  // まだ展開していない非終端記号は、これから終端記号を導くかもしれないので描く。
  const yieldsEps = id => {
    const n = nodes[id];
    if (n.kind === 'eps') return true;
    if (n.kind === 't') return false;
    if (n.expandedAt < 0 || n.expandedAt > upto) return false;
    return n.children.every(yieldsEps);
  };
  const visible = id => nodes[id].createdAt <= upto && !yieldsEps(id);
  const pos = new Map();
  const H = 58, FONT = 16, GAP = 14;
  let cursor = 0, maxDepth = 0;
  const widthOf = id => Math.max(30, textWidth(nodes[id].sym, FONT) + 18);

  function place(id, depth) {
    const n = nodes[id];
    maxDepth = Math.max(maxDepth, depth);
    const kids = n.children.filter(visible);
    if (!kids.length) {
      const w = widthOf(id);
      const x = cursor + w / 2;
      cursor += w + GAP;
      pos.set(id, { x, y: depth * H, w });
      return;
    }
    for (const k of kids) place(k, depth + 1);
    const xs = kids.map(k => pos.get(k).x);
    pos.set(id, { x: (xs[0] + xs[xs.length - 1]) / 2, y: depth * H, w: widthOf(id) });
  }
  place(0, 0);
  return { pos, width: cursor, height: (maxDepth + 1) * H, H };
}

/* ---------------------------------------------------------
 * 構文木の描画
 *   hl: 強調するノード id（現在の手順で注目しているノード）
 * --------------------------------------------------------- */
function drawTree(container, trace, upto, hl) {
  const nodes = trace.nodes;
  const L = layoutTree(trace, upto);
  const PAD = 24, R = 15;
  const W = Math.max(L.width + PAD * 2, 200), Hh = L.height + PAD * 2;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, class: 'tree' });
  const ox = PAD, oy = PAD + 2;

  // 枝
  for (const [id, p] of L.pos) {
    const n = nodes[id];
    if (n.parent < 0) continue;
    const q = L.pos.get(n.parent);
    svg.appendChild(svgEl('line', { x1: ox + q.x, y1: oy + q.y + R, x2: ox + p.x, y2: oy + p.y - R, class: 'edge' }));
  }
  // 節点
  for (const [id, p] of L.pos) {
    const n = nodes[id];
    let cls = 'node ' + n.kind;
    if (n.kind === 't' && n.matchedAt >= 0 && n.matchedAt <= upto) cls += ' matched';
    if (n.kind === 'nt' && n.expandedAt >= 0 && n.expandedAt <= upto) cls += ' expanded';
    if (id === hl) cls += ' hl';
    const g = svgEl('g', { class: cls, transform: `translate(${ox + p.x},${oy + p.y})` });
    if (n.kind === 'nt') g.appendChild(svgEl('rect', { x: -p.w / 2, y: -R, width: p.w, height: R * 2, rx: 6 }));
    else g.appendChild(svgEl('circle', { r: R }));
    g.appendChild(svgEl('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, [n.sym]));
    svg.appendChild(g);
  }
  container.replaceChildren(svg);
  return svg;
}

if (typeof module !== 'undefined') module.exports = { layoutTree };
