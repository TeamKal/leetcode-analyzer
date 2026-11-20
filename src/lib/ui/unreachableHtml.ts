/**
 * A complete, script-free HTML page that looks like the browser's connection-error
 * screen. The proxy sends it straight back to a blocked account, so no app code,
 * router or hydration is involved.
 */

const BLANK_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// The sad-file icon as a pixel grid (11 x 13). "#" is a dark square.
const ICON = [
  "#######....",
  "#.....##...",
  "#.....#.#..",
  "#.....####.",
  "#.........#",
  "#..#...#..#",
  "#.........#",
  "#.........#",
  "#...###...#",
  "#..#...#..#",
  "#.........#",
  "#.........#",
  "###########",
];

const SQUARES = ICON.flatMap((row, y) =>
  [...row].flatMap((ch, x) =>
    ch === "#" ? [`<rect x="${x}" y="${y}" width="1" height="1"/>`] : [],
  ),
).join("");

/** What the screen names as the site that refused. The same everywhere (local and production). */
const SITE_LABEL = "https";

const CSS = `
html,body{margin:0;height:100%}
body{background:#fff;color:#202124;font:14px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
.in{max-width:600px;margin:0 auto;padding:max(48px,11vh) 20px 40px}
.ic{width:44px;height:52px;margin:0 0 28px;color:#535353;display:block;fill:currentColor}
h1{font-size:24px;font-weight:500;margin:0 0 16px;line-height:1.25}
p{margin:0 0 14px;color:#5f6368;font-size:15px}
p b{font-weight:600}
ul{margin:0 0 16px;padding-left:28px;color:#5f6368;font-size:15px;line-height:1.7}
li a{color:#1a3dc1;text-decoration:none}
.code{font-size:12px;color:#5f6368;margin:0 0 40px}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.btn{background:#1a73e8;color:#fff;border:0;border-radius:4px;padding:7px 20px;font:inherit;font-size:14px;cursor:pointer;text-decoration:none;display:inline-block}
summary{list-style:none;cursor:pointer;border:1px solid #dadce0;border-radius:4px;padding:6px 20px;font-size:14px;color:#5f6368;display:inline-block}
summary::-webkit-details-marker{display:none}
details{text-align:right}
details div{margin-top:12px;max-width:300px;text-align:left;color:#5f6368;font-size:13px}
@media (prefers-color-scheme:dark){
body{background:#202124;color:#e8eaed}.ic{color:#9aa0a6}
p,ul,.code,summary,details div{color:#9aa0a6}li a{color:#8ab4f8}
.btn{background:#8ab4f8;color:#202124}summary{border-color:#5f6368}}
`;

export function unreachableHtml(): string {
  const h = SITE_LABEL;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${h}</title>
<link rel="icon" href="${BLANK_ICON}">
<style>${CSS}</style></head><body><div class="in">
<svg class="ic" viewBox="0 0 11 13" shape-rendering="crispEdges" aria-hidden="true">${SQUARES}</svg>
<h1>This site can’t be reached</h1>
<p><b>${h}</b> refused to connect.</p>
<p style="margin-bottom:6px">Try:</p>
<ul><li>Checking the connection</li><li><a href="/">Checking the proxy and the firewall</a></li></ul>
<div class="code">ERR_CONNECTION_REFUSED</div>
<div class="row"><a class="btn" href="/">Reload</a>
<details><summary>Details</summary><div>The connection was refused when trying to reach ${h}. This is usually caused by a problem with the server, the network or a firewall.</div></details></div>
</div></body></html>`;
}
