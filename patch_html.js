const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Replace visual cyber elements with medieval ones
html = html.replace(/from-slate-900 via-black to-black/g, 'from-amber-950 via-[rgb(30,15,5)] to-black');
html = html.replace(/from-blue-400 to-cyan-300/g, 'from-amber-500 to-yellow-300');
html = html.replace(/NEXUS TACTICS/g, "KINGDOM'S FALL");
html = html.replace(/Initialize Drop 🚀/g, 'Start Campaign ⚔️');
html = html.replace(/Faction Databases 📖/g, 'Tomes & Lore 📜');
html = html.replace(/Tactical Archives/g, 'Kingdom Archives');
html = html.replace(/text-cyan-400/g, 'text-amber-400');
html = html.replace(/text-emerald-400/g, 'text-lime-400');
html = html.replace(/bg-blue-900\/40/g, 'bg-amber-900/40');
html = html.replace(/border-blue-500/g, 'border-amber-500');
html = html.replace(/bg-blue-900\/90/g, 'bg-amber-900/90');
html = html.replace(/text-blue-100/g, 'text-amber-100');
html = html.replace(/border-blue-500\/50/g, 'border-amber-500/50');
html = html.replace(/border-blue-700\/50/g, 'border-amber-700/50');
html = html.replace(/bg-slate-900/g, 'bg-stone-900');
html = html.replace(/bg-slate-800/g, 'bg-stone-800');
html = html.replace(/border-slate-800/g, 'border-stone-800');
html = html.replace(/border-slate-700/g, 'border-stone-700');
html = html.replace(/text-slate-400/g, 'text-stone-400');
html = html.replace(/text-slate-300/g, 'text-stone-300');
html = html.replace(/text-slate-500/g, 'text-stone-500');
html = html.replace(/font-mono/g, 'font-serif');

fs.writeFileSync('index.html', html);
