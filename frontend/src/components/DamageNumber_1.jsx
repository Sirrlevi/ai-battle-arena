// ---------- DAMAGE NUMBER RENDERER ----------
// Short-lived floating text spawned on hit. Uses SVG's built-in <animate>
// so it doesn't need to hook into the rAF loop — it plays once and the
// parent removes it from state after `lifetimeMs`.

export default function DamageNumber({ x, y, text, color = "#E4443B" }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={18}
      fontWeight={700}
      fill={color}
      fontFamily="'IBM Plex Mono', monospace"
      stroke="#0A0C0F"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {text}
      <animate attributeName="y" from={y} to={y - 46} dur="0.9s" fill="freeze" />
      <animate attributeName="opacity" from="1" to="0" dur="0.9s" fill="freeze" />
    </text>
  );
}
