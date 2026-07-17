export type IconRegistry = Readonly<Record<string, readonly string[]>>;

export const canonicalGlyphs: IconRegistry = {
  person: ["M20 21a8 8 0 0 0-16 0", "M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
  team: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  service: ["M4 5h16v14H4z", "M8 9h8", "M8 13h5"],
  api: ["M8 9l-3 3 3 3", "M16 9l3 3-3 3", "M14 5l-4 14"],
  server: ["M4 4h16v6H4z", "M4 14h16v6H4z", "M8 7h.01", "M8 17h.01"],
  worker: ["M12 2v4", "M12 18v4", "M4.93 4.93l2.83 2.83", "M16.24 16.24l2.83 2.83", "M2 12h4", "M18 12h4", "M4.93 19.07l2.83-2.83", "M16.24 7.76l2.83-2.83", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
  tool: ["M14.7 6.3a4 4 0 0 0-5-5L7 4l3 3 2.7-.7 6.9 6.9a2 2 0 1 1-2.8 2.8l-6.9-6.9L9 12l-3-3-2.7 2.7a4 4 0 0 0 5 5"],
  agent: ["M12 8V4H8", "M8 4h8", "M5 8h14v11H5z", "M9 13h.01", "M15 13h.01", "M9 17h6"],
  model: ["M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z", "M19 3v4", "M17 5h4"],
  database: ["M4 6c0-2.2 3.6-4 8-4s8 1.8 8 4-3.6 4-8 4-8-1.8-8-4z", "M4 6v6c0 2.2 3.6 4 8 4s8-1.8 8-4V6", "M4 12v6c0 2.2 3.6 4 8 4s8-1.8 8-4v-6"],
  cache: ["M5 7c0-2 3.1-4 7-4s7 2 7 4-3.1 4-7 4-7-2-7-4z", "M5 7v5c0 2 3.1 4 7 4s7-2 7-4V7", "M5 12v5c0 2 3.1 4 7 4s7-2 7-4v-5"],
  queue: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  stream: ["M3 12h4l2-6 4 12 2-6h6"],
  event: ["M5 12a7 7 0 0 1 14 0", "M8 12a4 4 0 0 1 8 0", "M12 12h.01"],
  browser: ["M3 4h18v16H3z", "M3 9h18", "M7 6.5h.01"],
  mobile: ["M7 2h10v20H7z", "M11 18h2"],
  terminal: ["M4 5h16v14H4z", "M7 9l3 3-3 3", "M12 15h4"],
  document: ["M6 2h8l4 4v16H6z", "M14 2v5h5", "M9 13h6", "M9 17h6"],
  code: ["M8 9l-3 3 3 3", "M16 9l3 3-3 3", "M14 5l-4 14"],
  table: ["M3 5h18v14H3z", "M3 10h18", "M9 5v14"],
  note: ["M5 3h14v14l-4 4H5z", "M15 21v-4h4", "M8 8h8", "M8 12h6"],
  callout: ["M4 4h16v13H9l-5 4z", "M8 9h8", "M8 13h5"],
  badge: ["M12 2l3 3 4-.5.5 4L22 12l-2.5 3.5-.5 4-4-.5-3 3-3-3-4 .5-.5-4L2 12l2.5-3.5.5-4 4 .5z"],
  legend: ["M5 6h.01", "M9 6h10", "M5 12h.01", "M9 12h10", "M5 18h.01", "M9 18h10"],
  barChart: ["M4 20V10h4v10", "M10 20V4h4v16", "M16 20v-7h4v7", "M3 20h18"],
  lineChart: ["M3 19l5-6 4 3 7-10", "M3 20h18"],
  areaChart: ["M3 19l5-6 4 3 7-10v13H3z", "M3 20h18"],
  progress: ["M4 12h16", "M4 12a8 8 0 0 1 8-8"],
  check: ["M20 6 9 17l-5-5"],
  star: ["M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z"],
  warning: ["M12 3 2 21h20L12 3z", "M12 9v5", "M12 17h.01"],
  "credit-card": ["M3 5h18v14H3z", "M3 10h18", "M7 15h3"],
  cloud: ["M17.5 19H7a5 5 0 0 1-.7-9.95A7 7 0 0 1 19.7 8 5.5 5.5 0 0 1 17.5 19z"],
  globe: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M2 12h20", "M12 2a15 15 0 0 1 0 20", "M12 2a15 15 0 0 0 0 20"],
  lock: ["M5 10h14v11H5z", "M8 10V7a4 4 0 0 1 8 0v3"],
  mail: ["M3 5h18v14H3z", "m3 8 9 6 9-6"],
  package: ["m12 2 9 5-9 5-9-5 9-5z", "M3 7v10l9 5 9-5V7", "M12 12v10"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "m21 21-4.35-4.35"],
  sparkles: ["m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z", "m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"],
  webhook: ["M18 16.5a3.5 3.5 0 1 1-3.5-3.5", "M6 7.5A3.5 3.5 0 1 1 9.5 11", "M8.5 18a3.5 3.5 0 1 1 3.5-3.5", "M9.5 11h5", "m12 14.5-2.5-3.5", "m14.5 13-2.5 1.5"],
};

export function canonicalGlyph(name: string | undefined, registry?: IconRegistry) {
  return name ? canonicalGlyphs[name] ?? registry?.[name] : undefined;
}

export function iconNames(registry?: IconRegistry) {
  return [...new Set([...Object.keys(canonicalGlyphs), ...Object.keys(registry ?? {})])].sort();
}
