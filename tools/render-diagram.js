// Renders a .mmd file to PNG using the local mermaid bundle and headless Edge.
// usage: node render.js <input.mmd> <output.png>
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [input, output] = process.argv.slice(2);
const here = __dirname;
const src = fs.readFileSync(input, 'utf8');
const mermaidJs = path.join(here, 'package/dist/mermaid.min.js').replace(/\\/g, '/');

// pass 1: render to SVG inside the page and dump the DOM
const page1 = path.join(here, 'pass1.html');
fs.writeFileSync(
  page1,
  `<!doctype html><html><head><meta charset="utf-8"><script src="file:///${mermaidJs}"></script></head>
<body><pre id="src">${src.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre><div id="out"></div>
<script>
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', er: { useMaxWidth: false }, flowchart: { useMaxWidth: false, htmlLabels: true } });
mermaid.render('d', document.getElementById('src').textContent).then(({ svg }) => {
  document.getElementById('out').innerHTML = svg;
  document.getElementById('src').remove();
  const el = document.querySelector('#out svg');
  const b = el.getBBox();
  document.title = 'SIZE:' + Math.ceil(el.viewBox.baseVal.width) + 'x' + Math.ceil(el.viewBox.baseVal.height);
}).catch(e => { document.title = 'ERR:' + e.message; });
</script></body></html>`,
);
const common = ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--no-first-run', '--hide-scrollbars'];
const dom = execFileSync(EDGE, [...common, '--virtual-time-budget=15000', '--dump-dom', `file:///${page1.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const title = (dom.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
if (!title.startsWith('SIZE:')) throw new Error('render failed: ' + title + '\n' + dom.slice(0, 500));
const [w, h] = title.slice(5).split('x').map(Number);
const svg = dom.slice(dom.indexOf('<svg'), dom.lastIndexOf('</svg>') + 6);

// pass 2: screenshot the SAME page (labels are rendered live by mermaid), at the measured size
const pad = 24;
const page2 = path.join(here, 'pass2.html');
fs.writeFileSync(page2, fs.readFileSync(page1, 'utf8').replace('<head>', '<head><style>html,body{margin:0;background:#fff}#out{padding:' + pad + 'px}#out svg{max-width:none!important}</style>'));
execFileSync(EDGE, [...common, '--virtual-time-budget=15000', '--force-device-scale-factor=2', `--window-size=${w + 2 * pad},${h + 2 * pad}`, `--screenshot=${path.resolve(output)}`, `file:///${page2.split(path.sep).join('/')}`], { stdio: 'ignore' });
console.log(`${output}: ${w}x${h} (x2)`);
