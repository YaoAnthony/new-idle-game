# -*- coding: utf-8 -*-
"""
把 gpt设计稿/金币与商店/*.md 转成一套带侧边导航的 HTML（单文件，内联全部 CSS/JS）。
纯本地小工具，不进版本库的正式产物——按需重跑即可。
"""
import io
import os
import re
import markdown

BASE = r"C:/my folder/游戏项目/new-idle-game/Frontend-3D/gpt设计稿/金币与商店"
OUT = BASE + "/HTML/index.html"

# 文档清单**自动发现**，不写死。
#
# 原来这里是一份手写的三项列表，加了 04（女巫小屋）和 05（石傀儡）之后
# 没人记得回来登记——于是重跑 build.py 生成的 HTML 里始终只有前三份，
# 而且不报错、不缺页，只是少了两章，看的人根本不知道。
#
# 侧边导航的标题从文件名推：`03-期2-建筑与升级` → `期2 · 建筑与升级`。
# 排序按文件名前缀的两位数字，所以新文档只要按 `NN-标题` 命名就自动进来。
def discover():
    names = sorted(
        n[:-3] for n in os.listdir(BASE)
        if re.match(r"^\d\d-.+\.md$", n)
    )
    out = []
    for slug in names:
        # 去掉 "NN-" 前缀，把剩下的第一个 "-" 换成 " · " 当分隔
        title = slug.split("-", 1)[1]
        parts = title.split("-", 1)
        out.append((slug, " · ".join(parts) if len(parts) > 1 else title))
    return out


DOCS = discover()
if not DOCS:
    raise SystemExit("没有找到任何 NN-*.md，检查 BASE 路径：" + BASE)

md = markdown.Markdown(extensions=["tables", "fenced_code", "sane_lists"])

sections = []
for slug, label in DOCS:
    path = BASE + "/" + slug + ".md"
    text = io.open(path, encoding="utf-8").read()
    # 去掉 md 内部的相对链接后缀 .md（导航改用锚点跳转，不再打开新文件）
    text = re.sub(r"\]\((\d\d-[^)]+?)\.md\)", r"](#\1)", text)
    md.reset()
    html = md.convert(text)
    sections.append((slug, label, html))

nav_items = []
for slug, label, _ in sections:
    nav_items.append('<a href="#' + slug + '" class="nav-link" data-slug="' + slug + '">' + label + '</a>')

body_sections = []
for slug, label, html in sections:
    body_sections.append('<section id="' + slug + '" class="doc">\n' + html + '\n</section>')

nav_html = "\n".join(nav_items)
body_html = "\n".join(body_sections)

HEAD = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>游戏重构计划</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;700&family=Noto+Sans+SC:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root {
  --ground:      #f7f2e6;
  --ground-2:    #efe7d5;
  --ground-sunk: #e6dcc6;
  --panel:       #fbf8f0;
  --ink:         #241b13;
  --ink-soft:    #55452f;
  --ink-mute:    #8a7a5f;
  --rule:        #d9cdb2;
  --rule-strong: #b39d78;
  --gold:        #b8860f;
  --gold-bright: #f4b942;
  --leaf:        #5f7d3e;
  --clay:        #a85f3a;
  --nav-w: 250px;
  --f-display: "Noto Serif SC", "Songti SC", serif;
  --f-body:    "Noto Sans SC", "PingFang SC", system-ui, sans-serif;
  --f-mono:    "JetBrains Mono", ui-monospace, "SFMono-Regular", monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground:      #16110c;
    --ground-2:    #1f1811;
    --ground-sunk: #100c08;
    --panel:       #1c150e;
    --ink:         #ede1c4;
    --ink-soft:    #c4b494;
    --ink-mute:    #8a7a5f;
    --rule:        #33281c;
    --rule-strong: #4d3d29;
    --gold:        #f4b942;
    --gold-bright: #ffd166;
    --leaf:        #94b56b;
    --clay:        #cf8a60;
  }
}
:root[data-theme="dark"] {
  --ground:      #16110c;
  --ground-2:    #1f1811;
  --ground-sunk: #100c08;
  --panel:       #1c150e;
  --ink:         #ede1c4;
  --ink-soft:    #c4b494;
  --ink-mute:    #8a7a5f;
  --rule:        #33281c;
  --rule-strong: #4d3d29;
  --gold:        #f4b942;
  --gold-bright: #ffd166;
  --leaf:        #94b56b;
  --clay:        #cf8a60;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--f-body);
  font-weight: 300;
  font-size: 15.5px;
  line-height: 1.75;
  -webkit-font-smoothing: antialiased;
}
.nav {
  position: fixed; top: 0; left: 0; bottom: 0; width: var(--nav-w);
  overflow-y: auto; background: var(--ground-2); border-right: 1px solid var(--rule);
  padding: 28px 0 40px;
  z-index: 10;
}
.nav-title {
  font-family: var(--f-display); font-weight: 700; font-size: 17px;
  padding: 0 22px 18px; margin: 0 0 6px; border-bottom: 1px solid var(--rule);
}
.nav-title small { display: block; font-family: var(--f-mono); font-weight: 400; font-size: 11px; color: var(--ink-mute); margin-top: 6px; letter-spacing: .06em; }
.nav-link {
  display: block; padding: 9px 22px; font-size: 13.5px; color: var(--ink-soft);
  text-decoration: none; border-left: 2px solid transparent; transition: background .12s;
}
.nav-link:hover { background: var(--ground-sunk); color: var(--ink); }
.nav-link.active { color: var(--gold); border-left-color: var(--gold); background: var(--ground-sunk); font-weight: 500; }
.nav-toggle {
  display: none; position: fixed; top: 14px; left: 14px; z-index: 20;
  width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--rule-strong);
  background: var(--panel); color: var(--ink); font-size: 18px; cursor: pointer;
}
.wrap { margin-left: var(--nav-w); max-width: 900px; padding: 64px 40px 140px; }
.doc { margin-bottom: 96px; scroll-margin-top: 24px; }
.doc:not(:first-child) { padding-top: 56px; border-top: 1px solid var(--rule); }
h1 {
  font-family: var(--f-display); font-weight: 700; font-size: clamp(26px, 3.6vw, 34px);
  line-height: 1.25; margin: 0 0 6px;
}
h2 {
  font-family: var(--f-display); font-weight: 700; font-size: 21px;
  margin: 42px 0 18px; padding-bottom: 10px; border-bottom: 2px solid var(--ink);
}
h3 { font-family: var(--f-display); font-weight: 500; font-size: 17.5px; margin: 32px 0 12px; }
p { max-width: 62em; margin: 0 0 14px; }
strong { font-weight: 500; color: var(--ink); }
em { color: var(--ink-soft); }
hr { border: none; border-top: 1px solid var(--rule); margin: 40px 0; }
blockquote {
  margin: 20px 0; padding: 2px 0 2px 18px; border-left: 3px solid var(--rule-strong);
  color: var(--ink-soft); font-size: 14.5px;
}
a { color: var(--gold); text-decoration-thickness: 1px; text-underline-offset: 3px; }
ul, ol { padding-left: 22px; margin: 0 0 14px; }
li { margin-bottom: 4px; }
li > p { margin-bottom: 6px; }
code {
  font-family: var(--f-mono); font-size: .88em; background: var(--ground-sunk);
  border: 1px solid var(--rule); padding: .08em .38em; border-radius: 2px; color: var(--ink-soft);
}
pre {
  background: var(--ground-sunk); border: 1px solid var(--rule); border-radius: 4px;
  padding: 16px 18px; overflow-x: auto; margin: 18px 0;
}
pre code { background: none; border: none; padding: 0; font-size: 13px; line-height: 1.65; color: var(--ink); }
table { border-collapse: collapse; width: 100%; font-size: 14px; margin: 18px 0; }
.doc > table, .doc table { display: block; overflow-x: auto; }
th, td { text-align: left; padding: 10px 15px; border-bottom: 1px solid var(--rule); vertical-align: top; }
thead th {
  font-family: var(--f-mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--ink-mute); background: var(--ground-2); font-weight: 500; white-space: nowrap;
}
tbody tr:nth-child(even) { background: var(--ground-2); }
footer.page-foot {
  margin-left: var(--nav-w); padding: 28px 40px 60px; font-family: var(--f-mono);
  font-size: 11.5px; color: var(--ink-mute); border-top: 1px solid var(--rule); max-width: 900px;
}
@media (max-width: 880px) {
  .nav { transform: translateX(-100%); transition: transform .2s; box-shadow: 0 0 40px rgba(0,0,0,.3); }
  .nav.open { transform: translateX(0); }
  .nav-toggle { display: block; }
  .wrap { margin-left: 0; padding: 74px 20px 100px; }
  footer.page-foot { margin-left: 0; padding: 24px 20px 50px; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } * { transition: none !important; } }
</style>
</head>
<body>

<button class="nav-toggle" id="navToggle" aria-label="打开目录">目录</button>

<nav class="nav" id="nav">
  <p class="nav-title">游戏重构计划<small>2026-08-21</small></p>
"""

TAIL = """
</nav>

<div class="wrap">
"""

FOOT = """
</div>

<footer class="page-foot">
  由 Frontend-3D/gpt设计稿/金币与商店/*.md 生成 · 本页是阅读用途，改动请回源 Markdown · 改完源文件要重跑 build.py 才会同步（不是自动联动）
</footer>

<script>
(function () {
  var links = document.querySelectorAll('.nav-link');
  var sections = document.querySelectorAll('.doc');
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');

  toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
  links.forEach(function (a) {
    a.addEventListener('click', function () { nav.classList.remove('open'); });
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a) { a.classList.remove('active'); });
      var active = document.querySelector('.nav-link[data-slug="' + e.target.id + '"]');
      if (active) active.classList.add('active');
    });
  }, { rootMargin: '-10% 0px -70% 0px' });
  sections.forEach(function (s) { io.observe(s); });
})();
</script>
</body>
</html>
"""

out = HEAD + nav_html + TAIL + body_html + FOOT
io.open(OUT, "w", encoding="utf-8", newline="").write(out)
print("written", OUT, len(out), "bytes")
