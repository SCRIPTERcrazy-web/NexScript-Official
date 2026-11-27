// Precompiles index.html: JSX -> plain JS (esbuild) and Tailwind -> a small CSS file.
// Runs on Vercel during "installCommand" (see vercel.json), so it finishes before the API functions are bundled.
// Output: dist/ (served as the site) AND the root index.html is replaced inside the build container only,
// so api/script/[slug].js, api/game.js and api/scripts.js also serve the compiled page. Your repo is never changed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'index.html');
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const log = (m) => console.log('[build] ' + m);
const fail = (m) => { console.error('[build] ERROR: ' + m); process.exit(1); };

let html = fs.readFileSync(SRC, 'utf8');
const open = html.indexOf('<script type="text/babel"');
if (open < 0) { log('index.html is already compiled (no text/babel script). Nothing to do.'); process.exit(0); }
const openEnd = html.indexOf('>', open) + 1;
const close = html.indexOf('</script>', openEnd);
if (close < 0) fail('could not find the end of the text/babel script');
const jsx = html.slice(openEnd, close);

// 1) JSX -> JS
let js;
try {
  js = esbuild.transformSync(jsx, {
    loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
    target: 'es2019', minifyWhitespace: true, minifySyntax: true, legalComments: 'none',
  }).code;
} catch (e) { fail('JSX did not compile:\n' + e.message); }
const appName = 'app.' + hash(js) + '.js';

// 2) Tailwind (same utility classes the CDN script produced, only the ones actually used)
const tmp = path.join(__dirname, '.tmp'); fs.mkdirSync(tmp, { recursive: true });
const colors = ['amber', 'cyan', 'purple', 'blue', 'green'];           // classes built as text-${color}-300 in the badge component
const safelist = [];
colors.forEach((c) => safelist.push('border-' + c + '-400/40', 'text-' + c + '-300', 'bg-' + c + '-400/10'));
fs.writeFileSync(path.join(tmp, 'tailwind.config.js'), 'module.exports=' + JSON.stringify({ content: [SRC], safelist, theme: { extend: {} }, plugins: [] }));
fs.writeFileSync(path.join(tmp, 'in.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
try {
  execFileSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-c', path.join(tmp, 'tailwind.config.js'), '-i', path.join(tmp, 'in.css'), '-o', path.join(tmp, 'out.css'), '--minify'], { stdio: 'pipe' });
} catch (e) { fail('Tailwind failed:\n' + (e.stderr ? e.stderr.toString() : e.message)); }
const css = fs.readFileSync(path.join(tmp, 'out.css'), 'utf8');
const cssName = 'tw.' + hash(css) + '.css';

// 3) rewrite the HTML
const babelTag = /<script[^>]*babel[^>]*><\/script>\s*/i;
const twTag = /<script[^>]*cdn\.tailwindcss\.com[^>]*><\/script>\s*/i;
html = html.slice(0, open) + '<script defer src="/' + appName + '"></script>' + html.slice(close + '</script>'.length);
if (!babelTag.test(html)) fail('could not find the Babel CDN tag to remove');
html = html.replace(babelTag, '');
if (!twTag.test(html)) fail('could not find the Tailwind CDN tag to remove');
html = html.replace(twTag, '');
html = html.replace('</head>', '<link rel="stylesheet" href="/' + cssName + '">\r\n</head>');
if (/text\/babel|babel\.min\.js|cdn\.tailwindcss\.com/.test(html)) fail('compiled page still references Babel or the Tailwind CDN');

// 4) write dist + copy the other static files
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, appName), js);
fs.writeFileSync(path.join(DIST, cssName), css);
fs.writeFileSync(path.join(DIST, 'index.html'), html);
const SKIP = new Set(['api', 'lib', 'tools', 'node_modules', 'dist', '.git', '.github', '.vercel', 'package.json', 'package-lock.json', 'vercel.json', 'index.html', '.gitignore', '.vercelignore']);
const copy = (from, to) => {
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    if (from === ROOT && (SKIP.has(f.name) || /\.(md|sql)$/i.test(f.name))) continue;
    const a = path.join(from, f.name), b = path.join(to, f.name);
    if (f.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copy(a, b); } else fs.copyFileSync(a, b);
  }
};
copy(ROOT, DIST);

// 5) the API functions read index.html from the project root: give them the compiled page too
fs.writeFileSync(SRC, html);
fs.rmSync(tmp, { recursive: true, force: true });
log('done: ' + appName + ' (' + Math.round(js.length / 1024) + ' KB), ' + cssName + ' (' + Math.round(css.length / 1024) + ' KB), index.html ' + Math.round(html.length / 1024) + ' KB');
