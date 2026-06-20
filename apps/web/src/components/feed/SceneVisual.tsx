import { motion } from 'framer-motion';
import { useMemo } from 'react';
import type {
  ReelScene,
  VisualKind,
  VisualSpec,
} from '../../../../../packages/shared-types/artifacts';

// SceneVisual draws the actual educational content for a scene.
// No decorative-only kinds: every renderer below teaches something concrete.
// Legacy decorative kinds are remapped to an educational fallback.

export function SceneVisual({
  scene,
  hue,
  sceneKey,
}: {
  scene: ReelScene;
  hue: number;
  sceneKey: string;
}) {
  const c1 = `hsl(${hue} 80% 60%)`;
  const c2 = `hsl(${(hue + 60) % 360} 80% 60%)`;
  const c3 = `hsl(${(hue + 200) % 360} 80% 60%)`;

  const kind = remap(scene.visual_kind);
  const spec: VisualSpec = useMemo(
    () => (scene.visual_spec && typeof scene.visual_spec === 'object' ? scene.visual_spec : {}),
    [scene.visual_spec],
  );

  switch (kind) {
    case 'network_packets':
      return <NetworkPackets c1={c1} c2={c2} c3={c3} spec={spec} sceneKey={sceneKey} />;
    case 'neural_network':
      return <NeuralNetwork c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'tree_traversal':
      return <TreeTraversal c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'sorting_bars':
      return <SortingBars c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'linked_list':
      return <LinkedList c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'stack_queue':
      return <StackQueue c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'equation':
      return <EquationVisual c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} fallback={scene.subtitle} />;
    case 'coordinate_graph':
      return <CoordinateGraph c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'flowchart':
      return <FlowChart c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} fallback={scene.subtitle} />;
    case 'process_diagram':
      return <ProcessDiagram c1={c1} c2={c2} c3={c3} spec={spec} sceneKey={sceneKey} />;
    case 'molecule':
      return <Molecule c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'waveform':
      return <Waveform c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'supply_demand':
      return <SupplyDemand c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'map_route':
      return <MapRoute c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'timeline':
      return <TimelineVisual c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    case 'comparison':
      return <ComparisonVisual c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} fallback={scene.subtitle} />;
    case 'bar_chart':
      return <BarChartLabeled c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} />;
    default:
      return <EquationVisual c1={c1} c2={c2} spec={spec} sceneKey={sceneKey} fallback={scene.subtitle} />;
  }
}

// ----- Visual kind remap: degrade legacy decorative kinds into useful ones.
function remap(k: VisualKind): VisualKind {
  switch (k) {
    case 'particles':
    case 'gradient_pulse':
    case 'shape_morph':
    case 'icon_grid':
    case 'concept_map':
    case 'arrow_flow':
    case 'diagram':
      // No structured signal — show a flowchart of the subtitle as steps.
      return 'flowchart';
    default:
      return k;
  }
}

// ----- Shared chrome -----
// Visual safe-area:
//   top   ~ 9rem (scene title + progress bars + meta live here)
//   bottom ~13rem (subtitle band + pause/scene-dots + action rail)
// Renderers must keep their content inside this window so labels never get
// covered by the subtitle line. We also reserve a small "label rail" along the
// bottom of the visual for axis names / kind chips.
function Frame({
  sceneKey,
  children,
  label,
}: {
  sceneKey: string;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div key={sceneKey} className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center px-4 pt-[9.5rem] pb-[13rem]">
        <div className="relative h-full w-full max-w-[560px]">
          {children}
        </div>
      </div>
      {label && (
        <div className="absolute bottom-[12.25rem] left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70 backdrop-blur">
          {label}
        </div>
      )}
    </div>
  );
}

// ============================================================
//  Network packets — labeled hosts/routers + packets along edges.
// ============================================================
function NetworkPackets({
  c1, c2, c3, spec, sceneKey,
}: { c1: string; c2: string; c3: string; spec: VisualSpec; sceneKey: string }) {
  const nodes = (spec.nodes && spec.nodes.length
    ? spec.nodes
    : [
        { id: 'A', label: 'Client', x: 12, y: 50, kind: 'host' },
        { id: 'R1', label: 'Router', x: 38, y: 28, kind: 'router' },
        { id: 'R2', label: 'Router', x: 62, y: 72, kind: 'router' },
        { id: 'B', label: 'Server', x: 88, y: 50, kind: 'host' },
      ]
  ).map((n, i, arr) => ({
    ...n,
    x: typeof n.x === 'number' ? n.x : 12 + (i / Math.max(1, arr.length - 1)) * 76,
    y: typeof n.y === 'number' ? n.y : i % 2 === 0 ? 32 : 68,
  }));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = (spec.edges && spec.edges.length
    ? spec.edges
    : nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }))
  ).filter((e) => byId[e.from] && byId[e.to]);
  const packets = spec.packets && spec.packets.length
    ? spec.packets
    : edges.map((e, i) => ({ ...e, label: ['SYN', 'ACK', 'DATA', 'FIN'][i % 4] }));

  function isRouter(kind?: string) {
    return kind && /router|switch|hub|gateway/i.test(kind);
  }

  return (
    <Frame sceneKey={sceneKey} label="Network">
      <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id={`arr-${sceneKey}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,0 L10,5 L0,10 Z" fill="white" opacity="0.5" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = byId[e.from];
          const b = byId[e.to];
          return (
            <motion.line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="white" strokeOpacity="0.35" strokeWidth="0.5"
              strokeDasharray="1.5 1.5"
              markerEnd={`url(#arr-${sceneKey})`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, delay: 0.05 * i }}
            />
          );
        })}
        {packets.slice(0, 6).map((p, i) => {
          const a = byId[p.from];
          const b = byId[p.to];
          if (!a || !b) return null;
          const label = (p.label ?? '').slice(0, 5);
          return (
            <motion.g
              key={`p-${i}`}
              initial={{ opacity: 0 }}
              animate={{
                x: [a.x - b.x, 0],
                y: [a.y - b.y, 0],
                opacity: [0, 1, 1, 0],
              }}
              transition={{ duration: 2.6, delay: 0.4 + i * 0.4, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: `${b.x}px ${b.y}px` }}
            >
              <rect
                x={b.x - 3} y={b.y - 2} width="6" height="3.6" rx="0.6"
                fill={i % 2 === 0 ? c1 : c2}
                style={{ filter: `drop-shadow(0 0 5px ${i % 2 === 0 ? c1 : c2})` }}
              />
              {label && (
                <text x={b.x} y={b.y + 0.6} fill="white" fontSize="2.1" textAnchor="middle" fontWeight="700">
                  {label}
                </text>
              )}
            </motion.g>
          );
        })}
        {nodes.map((n, i) => {
          const router = isRouter(n.kind);
          const fill = i === 0 || i === nodes.length - 1 ? c3 : c2;
          return (
            <motion.g
              key={n.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.05 * i, type: 'spring', stiffness: 240, damping: 18 }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
            >
              {router ? (
                <rect
                  x={n.x - 5} y={n.y - 3} width="10" height="6" rx="1.4"
                  fill={fill} stroke="white" strokeOpacity="0.7" strokeWidth="0.4"
                  style={{ filter: `drop-shadow(0 0 6px ${fill})` }}
                />
              ) : (
                <circle
                  cx={n.x} cy={n.y} r="4.6"
                  fill={fill} stroke="white" strokeOpacity="0.75" strokeWidth="0.5"
                  style={{ filter: `drop-shadow(0 0 6px ${fill})` }}
                />
              )}
              <text x={n.x} y={n.y + 1.2} fill="white" fontSize="2.4" textAnchor="middle" fontWeight="800">
                {router ? '⇄' : i === 0 ? '◉' : i === nodes.length - 1 ? '⬛' : ''}
              </text>
              <text x={n.x} y={n.y + 9.5} fill="white" fillOpacity="0.9" fontSize="2.9" textAnchor="middle" fontWeight="700">
                {n.label}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </Frame>
  );
}

// ============================================================
//  Neural network — input/hidden/output layers + activations.
// ============================================================
function NeuralNetwork({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const layers = (spec.layers && spec.layers.length ? spec.layers : [3, 5, 4, 2]).map((n) =>
    Math.max(1, Math.min(8, n | 0)),
  );
  const labels = spec.layer_labels ?? ['Input', ...Array(layers.length - 2).fill('Hidden'), 'Output'];
  const W = 100;
  const H = 100;
  const colX = layers.map((_, i) => 10 + (i * (W - 20)) / Math.max(1, layers.length - 1));
  const positions = layers.map((count, li) =>
    Array.from({ length: count }, (_, ni) => ({
      x: colX[li],
      y: 12 + ((ni + 0.5) * (H - 24)) / count,
    })),
  );

  return (
    <Frame sceneKey={sceneKey} label="Neural net">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
        {positions.slice(0, -1).flatMap((layer, li) =>
          layer.flatMap((a, ai) =>
            positions[li + 1].map((b, bi) => (
              <motion.line
                key={`l-${li}-${ai}-${bi}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="white" strokeOpacity="0.18" strokeWidth="0.25"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: 0.02 * (li * 5 + ai + bi) }}
              />
            )),
          ),
        )}
        {positions.map((layer, li) =>
          layer.map((p, ni) => {
            const fill = li === 0 || li === positions.length - 1 ? c1 : c2;
            // Ripple activations through layers left→right on a loop.
            const wave = (li / Math.max(1, positions.length - 1)) * 0.7;
            return (
              <motion.circle
                key={`n-${li}-${ni}`}
                cx={p.x} cy={p.y} r="2.8"
                fill={fill}
                stroke="white" strokeOpacity="0.4" strokeWidth="0.25"
                initial={{ scale: 0 }}
                animate={{
                  scale: [1, 1.45, 1],
                  opacity: [0.55, 1, 0.55],
                }}
                transition={{
                  duration: 2.4,
                  times: [
                    Math.max(0, wave - 0.05),
                    wave,
                    Math.min(1, wave + 0.15),
                  ],
                  repeat: Infinity,
                  delay: 0.1 * ni,
                }}
                style={{ filter: `drop-shadow(0 0 6px ${fill})` }}
              />
            );
          }),
        )}
        {positions.map((layer, li) => (
          <text
            key={`label-${li}`}
            x={layer[0].x}
            y="6"
            fill="white" fillOpacity="0.75" fontSize="3"
            textAnchor="middle" fontWeight="600"
          >
            {labels[li] ?? ''}
          </text>
        ))}
      </svg>
    </Frame>
  );
}

// ============================================================
//  Tree traversal — binary tree with highlighted walk.
// ============================================================
function TreeTraversal({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const values = (spec.values && spec.values.length ? spec.values : [1, 2, 3, 4, 5, 6, 7]).slice(0, 15);
  // Level-order layout
  const depth = Math.ceil(Math.log2(values.length + 1));
  const nodes = values.map((v, i) => {
    const level = Math.floor(Math.log2(i + 1));
    const indexInLevel = i - (2 ** level - 1);
    const slots = 2 ** level;
    const x = 8 + ((indexInLevel + 0.5) / slots) * 84;
    const y = 14 + (level * 70) / Math.max(1, depth - 1 || 1);
    return { v, x, y, i };
  });
  const order = spec.traversal_order && spec.traversal_order.length
    ? spec.traversal_order
    : nodes.map((_, i) => i); // simple bfs default

  return (
    <Frame sceneKey={sceneKey} label={spec.operation ? `${spec.operation} traversal` : 'Tree'}>
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {nodes.map((n) => {
          const lc = 2 * n.i + 1;
          const rc = 2 * n.i + 2;
          const ln = nodes[lc];
          const rn = nodes[rc];
          return (
            <g key={`edges-${n.i}`}>
              {ln && (
                <motion.line
                  x1={n.x} y1={n.y} x2={ln.x} y2={ln.y}
                  stroke="white" strokeOpacity="0.35" strokeWidth="0.4"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5 }}
                />
              )}
              {rn && (
                <motion.line
                  x1={n.x} y1={n.y} x2={rn.x} y2={rn.y}
                  stroke="white" strokeOpacity="0.35" strokeWidth="0.4"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.05 }}
                />
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const step = order.indexOf(n.i);
          return (
            <g key={`node-${n.i}`}>
              <motion.circle
                cx={n.x} cy={n.y} r="4.5"
                fill={c2}
                stroke="white" strokeOpacity="0.7" strokeWidth="0.5"
                animate={
                  step >= 0
                    ? { fill: [c2, c1, c2], scale: [1, 1.3, 1] }
                    : { fill: c2 }
                }
                transition={{
                  duration: 1.0,
                  delay: 0.4 + step * 0.6,
                  repeat: Infinity,
                  repeatDelay: order.length * 0.6,
                }}
                style={{ filter: `drop-shadow(0 0 6px ${c1})` }}
              />
              <text
                x={n.x} y={n.y + 1.4}
                fill="white" fontSize="3.5" textAnchor="middle" fontWeight="700"
              >
                {String(n.v)}
              </text>
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

// ============================================================
//  Sorting bars — initial → sorted.
// ============================================================
function SortingBars({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const initial = (spec.initial && spec.initial.length ? spec.initial : [55, 18, 88, 42, 70, 32, 60, 25]).slice(0, 10);
  const sorted = spec.sorted && spec.sorted.length ? spec.sorted.slice(0, initial.length) : [...initial].sort((a, b) => a - b);
  const max = Math.max(...initial, ...sorted, 1);

  return (
    <Frame sceneKey={sceneKey} label={spec.algorithm ? `${spec.algorithm} sort` : 'Sort'}>
      <div className="absolute inset-0 flex items-end justify-center gap-2 px-4">
        {initial.map((v, i) => {
          const target = sorted[i] ?? v;
          return (
            <motion.div
              key={i}
              className="rounded-t-lg"
              style={{
                width: `${80 / initial.length}%`,
                background: `linear-gradient(180deg, ${c1}, ${c2})`,
                filter: `drop-shadow(0 0 8px ${c1})`,
              }}
              initial={{ height: `${(v / max) * 90}%` }}
              animate={{ height: [`${(v / max) * 90}%`, `${(target / max) * 90}%`, `${(v / max) * 90}%`] }}
              transition={{ duration: 3.6, delay: i * 0.15, repeat: Infinity, ease: 'easeInOut' }}
            />
          );
        })}
      </div>
    </Frame>
  );
}

// ============================================================
//  Linked list — nodes connected by arrows ending at NULL.
// ============================================================
function LinkedList({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const values = (spec.values && spec.values.length ? spec.values : ['A', 'B', 'C', 'D']).slice(0, 6);
  return (
    <Frame sceneKey={sceneKey} label={spec.operation ? `${spec.operation}` : 'Linked list'}>
      <div className="absolute inset-0 flex items-center justify-center gap-3 px-4">
        {values.map((v, i) => (
          <motion.div
            key={i}
            className="flex items-center"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.25 }}
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white"
              style={{
                background: i % 2 === 0 ? c1 : c2,
                boxShadow: `0 0 24px ${i % 2 === 0 ? c1 : c2}`,
              }}
            >
              {String(v)}
            </div>
            <div className="px-1 text-white/85 text-xl">→</div>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.2 + values.length * 0.25 }}
          className="rounded-md border border-white/30 px-2 py-1 text-[11px] uppercase tracking-widest text-white/70"
        >
          NULL
        </motion.div>
      </div>
    </Frame>
  );
}

// ============================================================
//  Stack/queue — operation visualisation.
// ============================================================
function StackQueue({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const op = spec.operation ?? 'push';
  const isQueue = op === 'enqueue' || op === 'dequeue';
  const isPop = op === 'pop' || op === 'dequeue';
  const values = (spec.values && spec.values.length ? spec.values : [5, 9, 2, 7]).slice(0, 6);

  return (
    <Frame sceneKey={sceneKey} label={op}>
      <div className={`absolute inset-0 flex items-center justify-center ${isQueue ? '' : 'flex-col-reverse'} gap-2 px-4`}>
        {values.map((v, i) => (
          <motion.div
            key={i}
            className="flex h-12 w-20 items-center justify-center rounded-xl text-base font-bold text-white"
            style={{
              background: i === values.length - 1 ? c1 : c2,
              boxShadow: `0 0 18px ${i === values.length - 1 ? c1 : c2}`,
            }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={
              i === values.length - 1
                ? isPop
                  ? { opacity: [1, 1, 0], y: [0, -20, -60] }
                  : { opacity: [0, 1], scale: [0.6, 1] }
                : { opacity: 1, scale: 1 }
            }
            transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1, delay: 0.2 + i * 0.1 }}
          >
            {String(v)}
          </motion.div>
        ))}
      </div>
    </Frame>
  );
}

// ============================================================
//  Equation — formulas appearing in sequence.
// ============================================================
function EquationVisual({
  c1, c2, spec, sceneKey, fallback,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string; fallback: string }) {
  const eqs = spec.steps && spec.steps.length
    ? spec.steps
    : spec.latex
      ? [spec.latex]
      : [fallback];
  return (
    <Frame sceneKey={sceneKey} label="Equation">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 text-center">
        {eqs.slice(0, 4).map((e, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 + i * 0.5 }}
            className="rounded-xl border border-white/15 bg-black/45 px-5 py-3 font-serif italic text-[clamp(1.1rem,3.5vw,1.6rem)] text-white"
            style={{
              boxShadow: `0 0 24px ${i % 2 === 0 ? c1 : c2}`,
              background: `linear-gradient(135deg, ${c1}25, ${c2}25)`,
            }}
          >
            {renderEquation(String(e))}
          </motion.div>
        ))}
      </div>
    </Frame>
  );
}

function renderEquation(s: string): string {
  // Lightweight TeX-ish prettifier — keep simple, no MathJax dependency.
  return s
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\pi/g, 'π')
    .replace(/\\theta/g, 'θ')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\sum/g, 'Σ')
    .replace(/\\int/g, '∫')
    .replace(/\\infty/g, '∞')
    .replace(/\^\{([^}]+)\}/g, '^$1')
    .replace(/_\{([^}]+)\}/g, '_$1');
}

// ============================================================
//  Coordinate graph — labeled axes, ticks, and an animated tracer dot.
// ============================================================
function CoordinateGraph({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const W = 100;
  const H = 100;
  const margin = 14;
  const curves = (spec.curves && spec.curves.length
    ? spec.curves
    : [
        {
          label: 'f(x)',
          points: Array.from({ length: 24 }, (_, i) => {
            const x = i * 4;
            const y = 50 + 40 * Math.sin((i / 23) * Math.PI * 2);
            return [x, y] as [number, number];
          }),
        },
      ]
  ).slice(0, 3);

  const allPts = curves.flatMap((c) => c.points);
  const xs = allPts.map(([x]) => x);
  const ys = allPts.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs, minX + 1);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys, minY + 1);
  const mapX = (x: number) => margin + ((x - minX) / (maxX - minX)) * (W - margin * 2);
  const mapY = (y: number) => H - margin - ((y - minY) / (maxY - minY)) * (H - margin * 2);

  const tickXs = [0, 0.25, 0.5, 0.75, 1];
  const xLabel = spec.x_label ?? 'x';
  const yLabel = spec.y_label ?? 'y';

  return (
    <Frame sceneKey={sceneKey} label="Graph">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
        {/* axes */}
        <line x1={margin} y1={H - margin} x2={W - margin} y2={H - margin} stroke="white" strokeOpacity="0.5" strokeWidth="0.55" />
        <line x1={margin} y1={margin} x2={margin} y2={H - margin} stroke="white" strokeOpacity="0.5" strokeWidth="0.55" />
        {/* gridlines + ticks */}
        {tickXs.map((t, i) => (
          <g key={i}>
            <line
              x1={margin + t * (W - margin * 2)} y1={margin}
              x2={margin + t * (W - margin * 2)} y2={H - margin}
              stroke="white" strokeOpacity="0.08" strokeWidth="0.3"
            />
            <line
              x1={margin} y1={margin + t * (H - margin * 2)}
              x2={W - margin} y2={margin + t * (H - margin * 2)}
              stroke="white" strokeOpacity="0.08" strokeWidth="0.3"
            />
            <text
              x={margin + t * (W - margin * 2)} y={H - margin + 4}
              fill="white" fillOpacity="0.7" fontSize="2.5" textAnchor="middle"
            >
              {(minX + t * (maxX - minX)).toFixed(0)}
            </text>
            <text
              x={margin - 2} y={H - margin - t * (H - margin * 2) + 1}
              fill="white" fillOpacity="0.7" fontSize="2.5" textAnchor="end"
            >
              {(minY + t * (maxY - minY)).toFixed(0)}
            </text>
          </g>
        ))}
        {curves.map((cv, ci) => {
          const stroke = ci === 0 ? c1 : c2;
          const path = cv.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapX(p[0])} ${mapY(p[1])}`).join(' ');
          const lastPt = cv.points[cv.points.length - 1];
          return (
            <g key={ci}>
              <motion.path
                d={path}
                fill="none"
                stroke={stroke}
                strokeWidth="1.4"
                strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 1.8, delay: 0.2 + ci * 0.3, ease: [0.22, 1, 0.36, 1] }}
                style={{ filter: `drop-shadow(0 0 6px ${stroke})` }}
              />
              {/* Tracer dot rides the curve */}
              <motion.circle
                r="1.6"
                fill="white"
                initial={{ opacity: 0 }}
                animate={cv.points.length > 1
                  ? {
                      cx: cv.points.map((p) => mapX(p[0])),
                      cy: cv.points.map((p) => mapY(p[1])),
                      opacity: [0, 1, 1, 0],
                    }
                  : { opacity: 0 }
                }
                transition={{ duration: 3.6, delay: 0.5 + ci * 0.3, repeat: Infinity, ease: 'linear' }}
                style={{ filter: `drop-shadow(0 0 8px ${stroke})` }}
              />
              {cv.label && lastPt && (
                <text
                  x={mapX(lastPt[0]) - 2}
                  y={mapY(lastPt[1]) - 2}
                  fill={stroke} fontSize="3" fontWeight="700" textAnchor="end"
                  style={{ filter: `drop-shadow(0 0 6px ${stroke})` }}
                >
                  {cv.label}
                </text>
              )}
            </g>
          );
        })}
        <text x={W - margin} y={H - 2} fill="white" fillOpacity="0.85" fontSize="3" textAnchor="end" fontWeight="700">{xLabel}</text>
        <text x="4" y={margin + 1} fill="white" fillOpacity="0.85" fontSize="3" fontWeight="700">{yLabel}</text>
      </svg>
    </Frame>
  );
}

// ============================================================
//  Flowchart — labeled boxes with arrows + a pulsing active step.
// ============================================================
function FlowChart({
  c1, c2, spec, sceneKey, fallback,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string; fallback: string }) {
  const steps = (spec.steps_labels && spec.steps_labels.length
    ? spec.steps_labels
    : fallback.split(/\s*→\s*|\s*->\s*|\s*\|\s*/).filter(Boolean).slice(0, 5)
  ).slice(0, 6);
  const labels = steps.length >= 2 ? steps : ['Input', 'Process', 'Output'];
  const cycleDur = labels.length * 0.8;

  return (
    <Frame sceneKey={sceneKey} label="Flow">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-6">
        {labels.map((s, i) => (
          <div key={i} className="flex w-full flex-col items-center gap-1">
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 10 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
              }}
              transition={{ duration: 0.45, delay: 0.2 + i * 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-[18rem] rounded-2xl border border-white/15 px-4 py-2.5 text-center text-sm font-semibold text-white"
              style={{
                background: `linear-gradient(135deg, ${i % 2 === 0 ? c1 : c2}, ${i % 2 === 0 ? c2 : c1})`,
                boxShadow: `0 0 18px ${i % 2 === 0 ? c1 : c2}55`,
              }}
            >
              <motion.div
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  mixBlendMode: 'overlay',
                }}
                animate={{ opacity: [0, 0.7, 0] }}
                transition={{
                  duration: cycleDur,
                  times: [
                    Math.max(0, i / labels.length - 0.05),
                    i / labels.length,
                    Math.min(1, i / labels.length + 0.05),
                  ],
                  repeat: Infinity,
                  delay: 0.6,
                }}
              />
              <span className="relative">{s}</span>
            </motion.div>
            {i < labels.length - 1 && (
              <motion.div
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ delay: 0.35 + i * 0.3 }}
                className="text-base text-white/70"
              >
                ↓
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </Frame>
  );
}

// ============================================================
//  Process diagram — nodes + labeled edges.
// ============================================================
function ProcessDiagram({
  c1, c2, c3, spec, sceneKey,
}: { c1: string; c2: string; c3: string; spec: VisualSpec; sceneKey: string }) {
  const nodes = (spec.nodes && spec.nodes.length
    ? spec.nodes
    : [
        { id: 'a', label: 'Source' },
        { id: 'b', label: 'Transform' },
        { id: 'c', label: 'Output' },
      ]
  ).slice(0, 6);
  return <NetworkPackets c1={c1} c2={c2} c3={c3} spec={{ ...spec, nodes }} sceneKey={sceneKey} />;
}

// ============================================================
//  Molecule — atoms + bonds.
// ============================================================
function Molecule({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const atoms = (spec.atoms && spec.atoms.length
    ? spec.atoms
    : [
        { el: 'H', x: 30, y: 35 }, { el: 'O', x: 50, y: 50 }, { el: 'H', x: 70, y: 35 },
      ]
  ).slice(0, 12);
  const bonds: { a: number; b: number; order?: number }[] = (spec.bonds && spec.bonds.length
    ? spec.bonds
    : atoms.slice(0, -1).map((_, i) => ({ a: i, b: i + 1 }))
  ).slice(0, 20);

  return (
    <Frame sceneKey={sceneKey} label="Molecule">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {bonds.map((b, i) => {
          const A = atoms[b.a];
          const B = atoms[b.b];
          if (!A || !B) return null;
          const stroke = (b.order ?? 1) >= 2 ? c1 : 'white';
          const sw = (b.order ?? 1) >= 2 ? 0.8 : 0.5;
          return (
            <motion.line
              key={i}
              x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke={stroke} strokeOpacity="0.7" strokeWidth={sw}
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.1 * i }}
            />
          );
        })}
        {atoms.map((a, i) => (
          <g key={i}>
            <motion.circle
              cx={a.x} cy={a.y} r="5"
              fill={a.el === 'C' ? '#2a2f3a' : a.el === 'O' ? '#ef4444' : a.el === 'N' ? '#3b82f6' : c2}
              stroke="white" strokeOpacity="0.7" strokeWidth="0.4"
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ duration: 0.4, delay: 0.05 * i }}
            />
            <text x={a.x} y={a.y + 1.5} fill="white" fontSize="4" textAnchor="middle" fontWeight="700">{a.el}</text>
          </g>
        ))}
      </svg>
    </Frame>
  );
}

// ============================================================
//  Waveform — sine/square/pulse animated.
// ============================================================
function Waveform({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const wave = spec.wave ?? 'sine';
  const f = spec.frequency ?? 2;
  const W = 100;
  const H = 100;
  const samples = 80;

  const phases = [0, Math.PI / 2];
  const paths = phases.map((phase) => {
    const pts: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = t * W;
      const arg = t * Math.PI * 2 * f + phase;
      let y: number;
      if (wave === 'sine') y = 50 + 30 * Math.sin(arg);
      else if (wave === 'square') y = 50 + (Math.sin(arg) >= 0 ? -30 : 30);
      else if (wave === 'triangle') y = 50 + 30 * ((2 / Math.PI) * Math.asin(Math.sin(arg)));
      else y = 50 + (Math.sin(arg) >= 0.7 ? -30 : 30);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
    }
    return pts.join(' ');
  });

  return (
    <Frame sceneKey={sceneKey} label={`${wave} wave`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
        <line x1="0" y1="50" x2={W} y2="50" stroke="white" strokeOpacity="0.2" strokeWidth="0.3" />
        {paths.map((d, i) => (
          <motion.path
            key={i}
            d={d}
            fill="none"
            stroke={i === 0 ? c1 : c2}
            strokeWidth="1.4"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.4, delay: 0.2 + i * 0.3 }}
            style={{ filter: `drop-shadow(0 0 6px ${i === 0 ? c1 : c2})` }}
          />
        ))}
      </svg>
    </Frame>
  );
}

// ============================================================
//  Supply & demand — crossing curves.
// ============================================================
function SupplyDemand({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const W = 100; const H = 100; const m = 12;
  // Supply: upward line. Demand: downward line. Cross at (50, 50).
  const supply = `M ${m} ${H - m} L ${W - m} ${m}`;
  const demand = `M ${m} ${m} L ${W - m} ${H - m}`;
  return (
    <Frame sceneKey={sceneKey} label="Supply & demand">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
        <line x1={m} y1={H - m} x2={W - m} y2={H - m} stroke="white" strokeOpacity="0.35" strokeWidth="0.5" />
        <line x1={m} y1={m} x2={m} y2={H - m} stroke="white" strokeOpacity="0.35" strokeWidth="0.5" />
        <motion.path
          d={supply} fill="none" stroke={c1} strokeWidth="1.3" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1.4 }}
          style={{ filter: `drop-shadow(0 0 6px ${c1})` }}
        />
        <motion.path
          d={demand} fill="none" stroke={c2} strokeWidth="1.3" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, delay: 0.25 }}
          style={{ filter: `drop-shadow(0 0 6px ${c2})` }}
        />
        <motion.circle
          cx="50" cy="50" r="2.6" fill="white"
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.6 }}
          style={{ filter: 'drop-shadow(0 0 8px white)' }}
        />
        <text x="55" y="48" fill="white" fillOpacity="0.85" fontSize="3.2" fontWeight="700">
          {spec.equilibrium_label ?? 'Equilibrium'}
        </text>
        <text x={W - m - 6} y={m + 4} fill={c1} fontSize="3.2" fontWeight="700">Supply</text>
        <text x={W - m - 6} y={H - m - 2} fill={c2} fontSize="3.2" fontWeight="700">Demand</text>
        <text x={W / 2} y={H - 2} fill="white" fillOpacity="0.7" fontSize="3" textAnchor="middle">Quantity</text>
        <text x="3" y={H / 2} fill="white" fillOpacity="0.7" fontSize="3" transform={`rotate(-90 3 ${H / 2})`} textAnchor="middle">Price</text>
      </svg>
    </Frame>
  );
}

// ============================================================
//  Map route — abstract map + path.
// ============================================================
function MapRoute({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const route = (spec.route && spec.route.length
    ? spec.route
    : [
        { x: 12, y: 70, label: 'Start' },
        { x: 35, y: 40 },
        { x: 60, y: 55 },
        { x: 85, y: 25, label: 'End' },
      ]
  ).slice(0, 12);
  const d = route.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <Frame sceneKey={sceneKey} label="Route">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {/* faux landmass */}
        <rect x="2" y="2" width="96" height="96" rx="6" fill="white" fillOpacity="0.04" />
        <motion.path
          d={d} fill="none" stroke={c1} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 2"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1.8 }}
          style={{ filter: `drop-shadow(0 0 6px ${c1})` }}
        />
        {route.map((p, i) => (
          <g key={i}>
            <motion.circle
              cx={p.x} cy={p.y} r="2.5"
              fill={i === 0 || i === route.length - 1 ? c1 : c2}
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 * i }}
              style={{ filter: `drop-shadow(0 0 6px ${i === 0 || i === route.length - 1 ? c1 : c2})` }}
            />
            {p.label && (
              <text x={p.x} y={p.y - 4} fill="white" fontSize="3.2" textAnchor="middle" fontWeight="700">
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </Frame>
  );
}

// ============================================================
//  Timeline — chronological labeled events.
// ============================================================
function TimelineVisual({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const items = (spec.steps_labels && spec.steps_labels.length
    ? spec.steps_labels
    : ['1957', '1969', '1991', '2007', '2024']
  ).slice(0, 6);
  return (
    <Frame sceneKey={sceneKey} label="Timeline">
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
        <div className="relative h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/15">
          <motion.div
            className="absolute inset-y-0 left-0"
            style={{ background: `linear-gradient(90deg, ${c1}, ${c2})`, boxShadow: `0 0 14px ${c1}` }}
            initial={{ width: 0 }} animate={{ width: '100%' }}
            transition={{ duration: 1.6 }}
          />
        </div>
        <div className="mt-4 flex w-full max-w-md justify-between">
          {items.map((label, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 + 0.18 * i }}
              className="flex flex-col items-center gap-1"
            >
              <div
                className="h-3 w-3 rounded-full border-2 border-white/70"
                style={{ background: i % 2 === 0 ? c1 : c2 }}
              />
              <div className="text-[10px] font-semibold text-white/85 whitespace-nowrap">{label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

// ============================================================
//  Comparison — left vs right.
// ============================================================
function ComparisonVisual({
  c1, c2, spec, sceneKey, fallback,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string; fallback: string }) {
  const [a, b] = spec.nodes && spec.nodes.length >= 2
    ? [spec.nodes[0], spec.nodes[1]]
    : (() => {
        const parts = fallback.split(/\s+vs\.?\s+|\s+\/\s+|\s+\|\s+/i);
        return [{ id: 'a', label: parts[0] ?? 'A' }, { id: 'b', label: parts[1] ?? 'B' }];
      })();
  return (
    <Frame sceneKey={sceneKey} label="Compare">
      <div className="absolute inset-0 grid grid-cols-2 gap-3 px-3">
        {[a, b].map((side, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: i === 0 ? -30 : 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 + i * 0.2 }}
            className="flex flex-col items-center justify-center rounded-3xl border border-white/10 p-4 text-center"
            style={{
              background: `linear-gradient(160deg, ${i === 0 ? c1 : c2}30, transparent 80%)`,
              boxShadow: `0 0 24px ${i === 0 ? c1 : c2}33`,
            }}
          >
            <div
              className="text-3xl font-extrabold leading-tight"
              style={{ color: i === 0 ? c1 : c2, textShadow: `0 0 18px ${i === 0 ? c1 : c2}` }}
            >
              {(side.label ?? '').split(' ').slice(0, 2).join(' ')}
            </div>
            <div className="mt-2 text-xs uppercase tracking-widest text-white/65">
              {i === 0 ? 'A' : 'B'}
            </div>
          </motion.div>
        ))}
      </div>
    </Frame>
  );
}

// ============================================================
//  Bar chart — labeled bars with values + a baseline axis.
// ============================================================
function BarChartLabeled({
  c1, c2, spec, sceneKey,
}: { c1: string; c2: string; spec: VisualSpec; sceneKey: string }) {
  const bars = (spec.bars && spec.bars.length
    ? spec.bars
    : [
        { label: 'A', value: 60 }, { label: 'B', value: 30 },
        { label: 'C', value: 80 }, { label: 'D', value: 45 },
      ]
  ).slice(0, 8);
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <Frame sceneKey={sceneKey} label="Chart">
      <div className="absolute inset-0 flex flex-col px-4 pb-6">
        <div className="relative flex flex-1 items-end justify-center gap-3">
          {bars.map((b, i) => (
            <div key={i} className="flex h-full flex-1 max-w-[60px] flex-col items-center justify-end gap-1">
              <motion.div
                className="text-[11px] font-bold tabular-nums text-white"
                style={{ textShadow: '0 0 8px rgba(0,0,0,0.6)' }}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + 0.1 * i }}
              >
                {b.value}
              </motion.div>
              <motion.div
                className="w-full rounded-t-xl"
                style={{
                  background: `linear-gradient(180deg, ${c1}, ${c2})`,
                  boxShadow: `0 0 14px ${c1}80, inset 0 -8px 12px rgba(0,0,0,0.25)`,
                }}
                initial={{ height: 0 }}
                animate={{ height: `${(b.value / max) * 78}%` }}
                transition={{ duration: 0.9, delay: 0.15 * i, ease: [0.22, 1, 0.36, 1] }}
              />
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/90">
                {b.label}
              </div>
            </div>
          ))}
        </div>
        <motion.div
          className="mt-1 h-px w-full bg-white/40"
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
          style={{ transformOrigin: 'left center' }}
          transition={{ duration: 0.6, delay: 0.2 }}
        />
      </div>
    </Frame>
  );
}
