/* The whole page content lives in this terminal: a toy shell written from scratch (no libraries).
   While you scroll, the terminal "types" one command per scene (neofetch, about, ...); you can
   also type commands yourself. Virtual file system, bilingual output. */
(function () {
  "use strict";
  var root = document.documentElement;
  var term = document.getElementById("term");
  if (!term) return;
  var sec = document.getElementById("terminal"), out = document.getElementById("termOut"),
      input = document.getElementById("termIn"), ps = document.getElementById("termPs"),
      body = document.getElementById("termBody"), title = document.getElementById("termTitle"),
      fx = document.getElementById("termFx"), dots = document.querySelectorAll(".dots button");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var T = function (z, e) { return root.dataset.lang === "zh" ? z : e; };
  var GH = "https://github.com/ZachShen99";
  var MARKET = "https://marketplace.visualstudio.com/items?itemName=zach-shen.vbstools-vbscript";
  var TCL_MARKET = "https://marketplace.visualstudio.com/items?itemName=zach-shen.tcl-tools";
  var started = Date.now();

  /* ---------- output helpers ----------
     A line is a string or an array of segments; a segment is a string or [text, class, href?]. */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function seg(s) {
    if (typeof s === "string") return document.createTextNode(s);
    var n = el(s[2] ? "a" : "span", s[1] || "", s[0]);
    if (s[2]) {
      n.href = s[2];
      if (/^https?:/.test(s[2])) { n.target = "_blank"; n.rel = "noopener"; }
    }
    return n;
  }
  function toBottom() { body.scrollTop = body.scrollHeight; }
  function line() {
    var d = el("div", "ln");
    for (var i = 0; i < arguments.length; i++) d.appendChild(seg(arguments[i]));
    if (typeof arguments[0] === "string" && arguments[0].slice(0, 2) === "  ") d.className += " ind"; // hanging indent
    if (!d.firstChild) d.appendChild(document.createTextNode(" "));
    out.appendChild(d);
    toBottom();
    return d;
  }
  var fast = false; // render without delays (language switch)
  function sleep(ms) { return new Promise(function (r) { if (reduce || fast) r(); else setTimeout(r, ms); }); }
  function say(lines, gap) {
    return lines.reduce(function (p, l) {
      return p.then(function () {
        if (abort) return;
        line.apply(null, typeof l === "string" ? [l] : l);
        return sleep(gap == null ? 24 : gap);
      });
    }, Promise.resolve());
  }

  /* ---------- content ---------- */
  var PROJECTS = [
    { id: "vbstools", name: "VbsTools", tagZ: "VS Code 插件 · 仅 Windows", tagE: "VS Code extension · Windows only",
      descZ: "给 VBScript 用的 VS Code 插件。认 COM 对象的补全、能打断点调试，脚本跑在自带的、兼容 cscript 的宿主里。", descE: "A VS Code extension for VBScript: completion that understands COM objects, a debugger with breakpoints, and a cscript-compatible script host.",
      links: [["介绍页", "Page", "vbstools/"], ["Marketplace", "Marketplace", MARKET], ["GitHub", "GitHub", GH + "/VbsTools"]] },
    { id: "tcl-tools", name: "Tcl Tools", tagZ: "VS Code 插件", tagE: "VS Code extension",
      descZ: "给 Tcl 用的 VS Code 插件。补全、跳转、重命名，认识 Tk 和 SQLite，测试面板里能跑 tcltest，F5 直接调试。Tcl 8.5 到 9.1 都支持。", descE: "A VS Code extension for Tcl: completion, go-to-definition and rename, Tk and SQLite aware, tcltest in the Test Explorer, F5 debugging. Works with Tcl 8.5 through 9.1.",
      links: [["Marketplace", "Marketplace", TCL_MARKET], ["GitHub", "GitHub", GH + "/vscode-tcl-tools"]] },
    { id: "daysengine", name: "DaysEngine for Android", tagZ: "安卓应用 · 免费", tagE: "Android app · free",
      descZ: "DaysEngine 的非官方安卓版，手机、平板上能玩 School Days HQ、Shiny Days、Cross Days。读你自己的游戏目录，加了触屏操作、双语字幕和存档备份。", descE: "An unofficial Android port of DaysEngine, so School Days HQ, Shiny Days and Cross Days run on phones and tablets. It reads your own game folder; I added touch controls, bilingual subtitles and save backup.",
      noteZ: "不带游戏本体，要自备 · 仅限成年人 · 和版权方没有关系", noteE: "No game files included, bring your own · adults only · not affiliated with the rights holders",
      links: [["下载", "Download", GH + "/DaysEngineForAndroid/releases/latest"], ["GitHub", "GitHub", GH + "/DaysEngineForAndroid"]] }
  ];
  function linkLine(links) {
    var segs = ["  "];
    links.forEach(function (l, i) { if (i) segs.push("   "); segs.push(["→ ", "d"], [T(l[0], l[1]), "c", l[2]]); });
    return segs;
  }
  function projectLines(p) {
    var ls = [[[p.name, "b"], ["  " + T(p.tagZ, p.tagE), "d"]], "  " + T(p.descZ, p.descE)];
    if (p.noteZ) ls.push([["  " + T(p.noteZ, p.noteE), "d"]]);
    ls.push(linkLine(p.links));
    return ls;
  }

  /* ---------- virtual file system ---------- */
  var projectFiles = {};
  PROJECTS.forEach(function (p) { projectFiles[p.id + ".md"] = function () { return projectLines(p); }; });
  var tree = {
    home: { zach: {
      "about.txt": function () {
        return [
          [["Zach", "b"]], "",
          T("平时写点开发工具，主要是 VS Code 插件。", "I mostly write developer tools, mainly VS Code extensions."),
          T("VBScript、Tcl 这类老语言，写起来没什么趁手的工具，就自己做了几个。", "Old languages like VBScript and Tcl never got much tooling, so I built some."),
          T("另外把 DaysEngine 弄到了安卓上。", "I also got DaysEngine running on Android.")
        ];
      },
      "notes.txt": function () {
        return [
          [[T("几个实现上的小细节", "A few implementation details"), "b"]], "",
          [["- ", "g"], T("VbsTools 的补全是直接读你电脑上注册的 COM 类型库，不是内置的一份名单。", "VbsTools reads the COM type libraries registered on your machine for completion; there is no built-in list.")],
          [["- ", "g"], T("调试器在每条语句前插一个钩子，行号不变，所以 On Error Resume Next 这类错误处理照常工作。", "The debugger puts a hook before every statement and keeps line numbers, so On Error Resume Next and friends keep working.")],
          [["- ", "g"], T("语法检查是调系统自带的 vbscript.dll 去编译，不运行脚本，报的错和实际运行一样。", "Syntax checking compiles with the system's own vbscript.dll without running anything, so errors match a real run.")],
          [["- ", "g"], T("Tcl Tools 的补全是从你装的 Tcl 里现查的，Tk 和 SQLite 也一样。", "Tcl Tools asks your installed Tcl for completion data, Tk and SQLite included.")],
          [["- ", "g"], T("都是免费的，有问题直接在 GitHub 上提 issue。", "All free. If something is wrong, open an issue on GitHub.")]
        ];
      },
      "contact.txt": function () {
        return [
          [["GitHub  ", "d"], ["github.com/ZachShen99", "c", GH]],
          [["Issues  ", "d"], T("有问题去对应项目的 GitHub Issues 留言就行", "found a bug or have a question? open an issue on that project")], "",
          [[T("这个终端是能敲命令的，输入 help 看看。", "This terminal is live, type help to see what it does."), "d"]]
        ];
      },
      projects: projectFiles
    } }
  };
  var cwd = ["home", "zach"];
  var mode = "sh", tclBuf = "", rawArgs = ""; // "sh" is the little shell, "tcl" is the Tcl prompt

  function resolve(path, base) {
    var parts = (path || "").split("/");
    var cur = path && path[0] === "/" ? [] : (path && path[0] === "~" ? ["home", "zach"] : (base || cwd).slice());
    parts.forEach(function (p) {
      if (!p || p === "." || p === "~") return;
      if (p === "..") cur.pop(); else cur.push(p);
    });
    var node = tree;
    for (var i = 0; i < cur.length; i++) {
      if (node && typeof node === "object" && Object.prototype.hasOwnProperty.call(node, cur[i])) node = node[cur[i]];
      else return null;
    }
    return { path: cur, node: node };
  }
  function isDir(n) { return n && typeof n === "object"; }
  function shortPath(p) {
    var s = "/" + p.join("/");
    return s === "/home/zach" ? "~" : s.indexOf("/home/zach/") === 0 ? "~" + s.slice(10) : s;
  }
  function renderPrompt() {
    ps.textContent = "";
    if (mode === "tcl") {
      ps.appendChild(seg([tclBuf ? "> " : "% ", "g"]));
      title.textContent = (interp && interp.tk ? "wish" : "tclsh") + " — zach@home";
      return;
    }
    [["zach@home", "g"], ":", [shortPath(cwd), "b"], "$ "].forEach(function (s) { ps.appendChild(seg(s)); });
    title.textContent = "zach@home: " + shortPath(cwd);
  }

  /* ---------- ASCII avatar for neofetch ---------- */
  function asciiAvatar(cols) {
    var img = document.querySelector("#avatar img"), rows = Math.round(cols / 2);
    var cv = document.createElement("canvas"); cv.width = cols; cv.height = rows;
    var ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0, cols, rows);
    var d = ctx.getImageData(0, 0, cols, rows).data, ramp = " .:-=+*#%@", wrap = el("div", "art");
    for (var y = 0; y < rows; y++) {
      var row = el("div");
      for (var x = 0; x < cols; x++) {
        var i = (y * cols + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        var dx = (x - (cols - 1) / 2) / (cols / 2), dy = (y - (rows - 1) / 2) / (rows / 2);
        var s = el("span", "", dx * dx + dy * dy > 1 ? " " : ramp[Math.min(9, Math.floor((0.3 * r + 0.59 * g + 0.11 * b) / 25.6))]);
        s.style.color = "rgb(" + Math.min(255, r * 1.3 | 0) + "," + Math.min(255, g * 1.3 | 0) + "," + Math.min(255, b * 1.3 | 0) + ")";
        row.appendChild(s);
      }
      wrap.appendChild(row);
    }
    return wrap;
  }
  function uptime() {
    var s = Math.floor((Date.now() - started) / 1000), m = Math.floor(s / 60);
    return m ? m + T(" 分 ", " min ") + (s % 60) + T(" 秒", " s") : s + T(" 秒", " s");
  }

  /* ---------- effects ---------- */
  var abort = false;
  function matrix() {
    return new Promise(function (res) {
      var w = body.clientWidth, h = body.clientHeight, size = 15;
      fx.width = w; fx.height = h; fx.hidden = false;
      fx.style.top = body.offsetTop + "px"; fx.style.width = w + "px"; fx.style.height = h + "px";
      var ctx = fx.getContext("2d"), cols = Math.floor(w / size), drops = [];
      var chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789ZACH";
      for (var i = 0; i < cols; i++) drops[i] = Math.random() * -40;
      var acc = getComputedStyle(term).getPropertyValue("--acc") || "#33ff66";
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      var t0 = performance.now(), last = 0;
      function frame(now) {
        if (abort || now - t0 > 9000) { fx.hidden = true; res(); return; }
        if (now - last > 45) {
          last = now;
          ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.fillRect(0, 0, w, h);
          ctx.font = size + "px monospace";
          for (var i = 0; i < cols; i++) {
            var y = drops[i] * size;
            ctx.fillStyle = "#d8ffe4";
            ctx.fillText(chars[Math.random() * chars.length | 0], i * size, y);
            ctx.fillStyle = acc;
            ctx.fillText(chars[Math.random() * chars.length | 0], i * size, y - size);
            if (y > h && Math.random() > 0.975) drops[i] = 0;
            drops[i] += 1;
          }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  function bar(label, ms) {
    var d = line([label.padEnd(26, " "), "d"], ["[          ]   0%", ""]);
    var tail = d.lastChild, n = 20, i = 0;
    return new Promise(function (res) {
      (function tick() {
        if (abort) return res();
        i++;
        var f = Math.round(i / n * 10);
        tail.textContent = "[" + "#".repeat(f) + " ".repeat(10 - f) + "] " + String(Math.round(i / n * 100)).padStart(3, " ") + "%";
        if (i >= n) return res();
        setTimeout(tick, reduce ? 0 : ms / n);
      })();
    });
  }
  function glitch() {
    if (reduce) return;
    term.classList.add("glitch");
    setTimeout(function () { term.classList.remove("glitch"); }, 600);
  }

  /* ---------- commands ---------- */
  var themes = { green: ["#d6f5de", "#33ff66"], amber: ["#ffe2a8", "#ffb000"], blue: ["#d7ecff", "#5ac8fa"], pink: ["#ffe0f0", "#ff79c6"], white: ["#f2f2f2", "#9aa0a6"] };
  var commands = {
    help: function () {
      var rows = [
        ["help", "看有哪些命令", "list the commands"],
        ["about", "简单介绍", "a short intro"],
        ["projects", "我做的东西", "what I have made"],
        ["neofetch", "系统信息，带头像", "system info, with avatar"],
        ["ls / cd / cat", "翻文件", "browse the files"],
        ["open <名称>", "打开项目，比如 open vbstools", "open a project, e.g. open vbstools"],
        ["matrix", "字符雨", "digital rain"],
        ["hack", "假装黑进五角大楼", "pretend to hack the Pentagon"],
        ["theme <颜色>", "green amber blue pink white", "green amber blue pink white"],
        ["lang <zh|en>", "切换中英文", "switch language"],
        ["clear", "清屏", "clear the screen"],
        ["tclsh", "Tcl 交互环境(自己写的迷你版)", "a Tcl prompt (a little one I wrote)"],
        ["wish [演示]", "Tcl/Tk，会弹出窗口", "Tcl/Tk with a window; try wish demos"],
        ["tcl <脚本>", "执行一行 Tcl", "run one line of Tcl"],
        ["calc <算式>", "算个数", "a calculator"],
        ["tree", "目录树", "the file tree"],
        ["cowsay <话>", "让牛说话", "make a cow talk"],
        ["cal", "本月日历", "this month's calendar"],
        ["trivia", "一条冷知识", "a random fact"],
        ["ping <主机>", "假装 ping", "pretend to ping"],
        ["sl", "火车来了", "a train goes by"],
        ["uname / uptime", "系统信息", "system info"]
      ];
      return say(rows.map(function (r) { return [[r[0] + " ".repeat(Math.max(1, 16 - wcw(r[0]))), "g"], T(r[1], r[2])]; }), 18);
    },
    about: function () { return commands.cat(["about.txt"]); },
    whoami: function () { line("zach"); },
    pwd: function () { line("/" + cwd.join("/")); },
    date: function () { line(new Date().toString()); },
    echo: function (a) { line(a.join(" ")); },
    clear: function () { out.textContent = ""; },
    history: function () { history.forEach(function (h, i) { line([String(i + 1).padStart(4, " ") + "  ", "d"], h); }); },
    ls: function (a) {
      var args = a.filter(function (x) { return x[0] !== "-"; });
      var r = resolve(args[0] || ".");
      if (!r) return line("ls: " + T("无法访问 ", "cannot access ") + "'" + args[0] + "'" + T(": 没有那个文件或目录", ": No such file or directory"));
      if (!isDir(r.node)) return line(args[0]);
      var segs = [];
      Object.keys(r.node).forEach(function (k) {
        segs.push(isDir(r.node[k]) ? [k + "/", "b"] : k, "   ");
      });
      line.apply(null, segs);
    },
    cd: function (a) {
      var r = resolve(a[0] || "~");
      if (!r) return line("cd: " + a[0] + T(": 没有那个文件或目录", ": No such file or directory"));
      if (!isDir(r.node)) return line("cd: " + a[0] + T(": 不是目录", ": Not a directory"));
      cwd = r.path; renderPrompt();
    },
    cat: function (a) {
      if (!a.length) return line("cat: " + T("缺少文件名", "missing file operand"));
      var r = resolve(a[0]);
      if (!r) return line("cat: " + a[0] + T(": 没有那个文件或目录", ": No such file or directory"));
      if (isDir(r.node)) return line("cat: " + a[0] + T(": 是一个目录", ": Is a directory"));
      return say(r.node(), 70);
    },
    projects: function () {
      var lines = [];
      PROJECTS.forEach(function (p, i) { if (i) lines.push(""); lines = lines.concat(projectLines(p)); });
      return say(lines, 90);
    },
    open: function (a) {
      var map = { vbstools: "vbstools/", "tcl-tools": GH + "/vscode-tcl-tools", tcl: GH + "/vscode-tcl-tools", daysengine: GH + "/DaysEngineForAndroid", github: GH };
      var k = (a[0] || "").toLowerCase().replace(/\.md$/, "");
      if (!map[k]) return line("open: " + T("用法 open vbstools | tcl-tools | daysengine | github", "usage: open vbstools | tcl-tools | daysengine | github"));
      line([T("正在打开 ", "Opening "), "d"], [map[k], "c", map[k]]);
      if (k === "vbstools") setTimeout(function () { location.href = map[k]; }, 400);
      else window.open(map[k], "_blank", "noopener");
    },
    neofetch: function () {
      var info = [
        [["zach", "g"], "@", ["home", "g"]],
        [["-".repeat(9), "d"]],
        [["OS      ", "g"], "Portfolio OS 1.0"],
        [["Host    ", "g"], "GitHub Pages"],
        [["Kernel  ", "g"], "HTML + CSS + WebAssembly"],
        [["Uptime  ", "g"], uptime()],
        [["Shell   ", "g"], T("自己用 JavaScript 写的，别当真", "hand-written in JavaScript, don't rely on it")],
        [["Langs   ", "g"], "Rust, TypeScript, JavaScript, Tcl, VBScript"],
        [["Projects", "g"], " " + PROJECTS.length],
        [["Makes   ", "g"], T("VS Code 插件、安卓应用", "VS Code extensions, an Android app")],
        [],
        [["███", "r"], ["███", "y"], ["███", "g"], ["███", "c"], ["███", "b"], ["███", "m"]]
      ];
      var wrap = el("div", "nf");
      try { wrap.appendChild(asciiAvatar(34)); } catch (e) { wrap.appendChild(el("pre", "art", "(avatar unavailable)")); }
      var col = el("div", "nf-info");
      wrap.appendChild(col);
      out.appendChild(wrap); toBottom();
      return info.reduce(function (p, l) {
        return p.then(function () {
          if (abort) return;
          var d = el("div", "ln");
          l.forEach(function (s) { d.appendChild(seg(s)); });
          if (!d.firstChild) d.appendChild(document.createTextNode(" "));
          col.appendChild(d); toBottom();
          return sleep(70);
        });
      }, Promise.resolve());
    },
    matrix: function () {
      line([T("按任意键退出…", "Press any key to exit…"), "d"]);
      return matrix();
    },
    hack: function () {
      var steps = [["Scanning ports", 700], ["Bypassing firewall", 900], ["Decrypting mainframe", 1000], ["Downloading the internet", 900]];
      line([T("正在黑进 pentagon.gov …", "Hacking pentagon.gov …"), "y"]);
      return steps.reduce(function (p, s) { return p.then(function () { return bar(s[0], s[1]); }); }, Promise.resolve())
        .then(function () {
          if (abort) return;
          glitch();
          line([">>> ACCESS GRANTED <<<", "g"]);
          return sleep(500).then(function () { line([T("（开玩笑的，啥也没发生。）", "(just kidding, nothing happened.)"), "d"]); });
        });
    },
    theme: function (a) {
      var t = themes[(a[0] || "").toLowerCase()];
      if (!t) return line("theme: " + Object.keys(themes).join(" | "));
      term.style.setProperty("--fg", t[0]); term.style.setProperty("--acc", t[1]);
      line([T("换好了。", "Done."), "g"]);
    },
    lang: function (a) {
      var l = (a[0] || "").toLowerCase();
      if (l !== "zh" && l !== "en") return line("lang: zh | en");
      if (root.dataset.lang !== l) document.getElementById("lang").click();
      line([l === "zh" ? "已切换到中文。" : "Switched to English.", "g"]);
    },
    sudo: function () { line("zach " + T("不在 sudoers 文件中。此事将被报告。", "is not in the sudoers file. This incident will be reported.")); },
    rm: function (a) {
      if (a.join(" ").indexOf("/") !== -1 && a.some(function (x) { return /^-.*r/.test(x); })) {
        glitch(); line([T("想得美。", "Nice try."), "r"]);
      } else line("rm: " + T("操作不允许", "operation not permitted"));
    },
    exit: function () { line([T("想退出？往下滚就行。", "Want out? Just scroll down."), "d"]); },
    vim: function () { line([T("别试，进去就出不来了。", "Don't. You won't get out."), "d"]); }
  };

  /* ---------- more shell commands ---------- */
  function wcw(str) { var w = 0; Array.from(str).forEach(function (c) { w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(c) ? 2 : 1; }); return w; }
  function charWidth() { // width of one monospace character, in layout pixels
    var m = el("span", "", "0".repeat(40)); m.style.position = "absolute"; m.style.visibility = "hidden"; m.style.whiteSpace = "pre"; body.appendChild(m);
    var w = m.offsetWidth / 40; body.removeChild(m);
    return w || 9;
  }
  commands.tree = function (a) {
    var r = resolve(a[0] || ".");
    if (!r || !isDir(r.node)) return line("tree: " + T("没有这个目录", "no such directory"));
    var lines = [[[shortPath(r.path), "b"]]], dirs = 0, files = 0;
    (function walk(node, prefix) {
      var keys = Object.keys(node);
      keys.forEach(function (k, i) {
        var last = i === keys.length - 1, d = isDir(node[k]);
        if (d) dirs++; else files++;
        lines.push([prefix + (last ? "└── " : "├── "), d ? [k + "/", "b"] : k]);
        if (d) walk(node[k], prefix + (last ? "    " : "│   "));
      });
    })(r.node, "");
    lines.push("");
    lines.push(dirs + T(" 个目录，", " directories, ") + files + T(" 个文件", " files"));
    return say(lines, 30);
  };
  commands.cowsay = function (a) {
    var words = (a.join(" ") || "Moo!"), max = 30, rows = [], cur = "";
    Array.from(words).forEach(function (c) {
      if (wcw(cur + c) > max || (c === " " && wcw(cur) >= max - 4)) { rows.push(cur.replace(/\s+$/, "")); cur = c === " " ? "" : c; } else cur += c;
    });
    if (cur) rows.push(cur);
    var w = Math.max.apply(null, rows.map(wcw)), out2 = [" " + "_".repeat(w + 2)];
    rows.forEach(function (r, i) {
      var pad = " ".repeat(w - wcw(r)), l = rows.length === 1 ? ["<", ">"] : i === 0 ? ["/", "\\"] : i === rows.length - 1 ? ["\\", "/"] : ["|", "|"];
      out2.push(l[0] + " " + r + pad + " " + l[1]);
    });
    out2.push(" " + "-".repeat(w + 2));
    out2 = out2.concat(["        \\   ^__^", "         \\  (oo)\\_______", "            (__)\\       )\\/\\", "                ||----w |", "                ||     ||"]);
    return say(out2, 35);
  };
  commands.cal = function () {
    var d = new Date(), y = d.getFullYear(), m = d.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var head = T(y + " 年 " + (m + 1) + " 月", MON[m] + " " + y);
    var lines = [" ".repeat(Math.max(0, Math.floor((20 - wcw(head)) / 2))) + head, T("日 一 二 三 四 五 六", "Su Mo Tu We Th Fr Sa")], row = [], i;
    for (i = 0; i < first; i++) row.push("   ");
    for (var n = 1; n <= days; n++) {
      var cell = String(n).padStart(2, " ") + " ";
      row.push(n === d.getDate() ? [cell, "g"] : cell);
      if (row.length === 7) { lines.push(row); row = []; }
    }
    if (row.length) lines.push(row);
    return say(lines, 40);
  };
  commands.uname = function (a) { line(a.indexOf("-a") >= 0 ? "ZachOS home 1.0 #1 HTML+WebAssembly " + (navigator.platform || "browser") : "ZachOS"); };
  commands.uptime = function () {
    var d = new Date(), p2 = function (n) { return String(n).padStart(2, "0"); };
    line(" " + p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds()) + "  up " + uptime() + ",  1 user,  load average: 0.00, 0.01, 0.05");
  };
  commands.ping = function (a) {
    if (!a[0]) return line("usage: ping host");
    var host = a[0], times = [], n = 0;
    line([T("PING " + host + "（模拟的，没有真的发包）", "PING " + host + " (simulated, no packets are sent)"), "d"]);
    return [0, 1, 2, 3].reduce(function (p, i) {
      return p.then(function () {
        if (abort) return;
        var t = 18 + Math.random() * 40; times.push(t);
        line("64 bytes from " + host + ": icmp_seq=" + i + " ttl=57 time=" + t.toFixed(1) + " ms");
        return sleep(450);
      });
    }, Promise.resolve()).then(function () {
      if (abort) return;
      var mn = Math.min.apply(null, times), mx = Math.max.apply(null, times), av = times.reduce(function (x, y) { return x + y; }, 0) / times.length;
      line(""); line("--- " + host + " ping statistics ---");
      line("4 packets transmitted, 4 received, 0% packet loss");
      line("round-trip min/avg/max = " + mn.toFixed(1) + "/" + av.toFixed(1) + "/" + mx.toFixed(1) + " ms");
    });
  };
  var FACTS = [
    ["Tcl 全称 Tool Command Language，1988 年由 John Ousterhout 在加州大学伯克利分校创造。", "Tcl stands for Tool Command Language. John Ousterhout created it at UC Berkeley in 1988."],
    ["Tk 是 Tcl 配套的图形界面工具包，后来 Python 的 tkinter 等也在用它。", "Tk is Tcl's GUI toolkit. Python's tkinter and others reuse it too."],
    ["VBScript 是微软 1996 年前后随 IE 3 推出的脚本语言。", "VBScript is Microsoft's scripting language, introduced around 1996 with Internet Explorer 3."],
    ["Tcl 的一条基本思路是“一切皆字符串”，命令、列表、数字，在语言层面都是字符串。", "A core idea in Tcl is that everything is a string: commands, lists and numbers all are, at the language level."],
    ["cscript.exe 和 wscript.exe 都属于 Windows Script Host，区别是一个在控制台输出，一个弹窗输出。", "cscript.exe and wscript.exe both belong to Windows Script Host; one writes to the console, the other pops up dialogs."],
    ["Tcl 8.6 起自带面向对象系统 TclOO。", "Since Tcl 8.6 the object system TclOO is built in."]
  ];
  commands.trivia = function () { var f = FACTS[Math.floor(Math.random() * FACTS.length)]; line(T(f[0], f[1])); };
  commands.fortune = commands.trivia;
  commands.sl = function () {
    var art = [
      "   _____            ____________   ____________",
      "  |     |_         |  VbsTools  |_|  Tcl Tools |",
      "  |_____|_|========|____________|_|____________|",
      "   (o)(o)            o  o  o        o  o  o"
    ], width = art[1].length;
    var cols = Math.max(30, Math.floor(body.clientWidth / charWidth()) - 2), rowsEl = art.map(function () { var d = el("div", "ln"); d.style.whiteSpace = "pre"; out.appendChild(d); return d; });
    toBottom();
    return new Promise(function (res) {
      var x = cols;
      (function frame() {
        if (abort || x < -width) { rowsEl.forEach(function (d) { d.textContent = ""; }); res(); return; }
        art.forEach(function (r, i) { rowsEl[i].textContent = x >= 0 ? (" ".repeat(x) + r).slice(0, cols) : r.slice(-x, -x + cols); });
        x -= 2;
        setTimeout(frame, reduce ? 0 : 35);
      })();
    });
  };

  /* ---------- Tcl: a little interpreter (tcl.js, loaded the first time it is needed) ---------- */
  var interp = null, tclLoading = null, pending = "", timers = {}, timerN = 0, wishStarted = false;
  function loadTcl() {
    if (window.MiniTcl) return Promise.resolve();
    if (tclLoading) return tclLoading;
    tclLoading = new Promise(function (res, rej) {
      var sc = document.createElement("script");
      sc.src = "tcl.js"; sc.onload = res; sc.onerror = function () { tclLoading = null; rej(new Error("tcl.js")); };
      document.head.appendChild(sc);
    });
    return tclLoading;
  }
  function withTcl(fn) {
    return loadTcl().then(function () {
      if (!interp) interp = new MiniTcl.Interp(tclHost);
      return fn(interp);
    }, function () { line([T("Tcl 没加载出来，刷新页面再试试。", "Could not load Tcl. Try reloading the page."), "r"]); });
  }
  function flushPending() { if (pending) { line(pending); pending = ""; } }
  function tkWindow() {
    var wrap = el("div", "tkwin"), bar = el("div", "tkbar"), ttl = el("span", "", "wish"), x = el("button", "tkx", "×"), content = el("div", "tkbody");
    x.type = "button"; x.setAttribute("aria-label", "close");
    bar.appendChild(ttl); bar.appendChild(x); wrap.appendChild(bar); wrap.appendChild(content); term.appendChild(wrap);
    wrap.style.right = "28px"; wrap.style.top = "64px";
    var api = {
      content: content, title: "wish", onclose: null,
      setTitle: function (t) { ttl.textContent = t; api.title = t; },
      setSize: function (w, h) { content.style.width = w + "px"; content.style.height = h + "px"; },
      close: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
    x.addEventListener("click", function () { api.close(); if (api.onclose) api.onclose(); });
    bar.addEventListener("pointerdown", function (e) {
      if (e.target === x) return;
      var r = wrap.getBoundingClientRect(), tr = term.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      bar.setPointerCapture(e.pointerId);
      function mv(ev) {
        wrap.style.left = Math.max(0, Math.min(tr.width - r.width, ev.clientX - tr.left - dx)) + "px";
        wrap.style.top = Math.max(0, Math.min(tr.height - 40, ev.clientY - tr.top - dy)) + "px";
        wrap.style.right = "auto";
      }
      function up() { bar.removeEventListener("pointermove", mv); bar.removeEventListener("pointerup", up); }
      bar.addEventListener("pointermove", mv); bar.addEventListener("pointerup", up);
    });
    return api;
  }
  var tclHost = {
    puts: function (text, nl, chan) {
      if (chan === "stderr") { flushPending(); String(text).split("\n").forEach(function (l) { line([l, "r"]); }); return; }
      pending += text;
      if (nl) { pending.split("\n").forEach(function (l) { line(l); }); pending = ""; }
    },
    error: function (m) { flushPending(); line([m, "r"]); },
    after: function (ms, fn) { var id = "after#" + (++timerN); timers[id] = setTimeout(function () { delete timers[id]; fn(); flushPending(); }, ms); return id; },
    cancel: function (id) { clearTimeout(timers[id]); delete timers[id]; },
    cancelAll: function () { Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); }); timers = {}; },
    exit: function () { leaveTcl(); },
    tkWindow: tkWindow,
    tkClosed: function () { if (wishStarted) leaveTcl(); }
  };
  function enterTcl() { mode = "tcl"; tclBuf = ""; renderPrompt(); }
  function leaveTcl() {
    wishStarted = false;
    if (interp && interp.tk) interp.unloadTk();
    tclHost.cancelAll(); pending = ""; tclBuf = "";
    if (mode === "tcl") { mode = "sh"; renderPrompt(); }
  }
  function tclRun(script) {
    try { var r = interp.run(script); flushPending(); if (r !== "") line(r); }
    catch (e) {
      flushPending();
      if (e instanceof MiniTcl.Exit) leaveTcl();
      else line([e && e.tclError ? e.message : "internal error: " + e, "r"]);
    }
  }
  function tclLine(text) {
    echoCommand(text);
    if (!text.trim() && !tclBuf) return;
    if (text.trim()) { history.push(text); hpos = history.length; }
    tclBuf += (tclBuf ? "\n" : "") + text;
    if (!interp.complete(tclBuf)) { renderPrompt(); return; }
    var script = tclBuf; tclBuf = "";
    tclRun(script);
    if (mode === "tcl") renderPrompt();
  }
  commands.tclsh = function () {
    return withTcl(function () {
      line([T("一个迷你 Tcl，我自己用 JavaScript 写的，不是官方那个。", "A little Tcl I wrote in JavaScript. Not the real one."), "d"]);
      line([T("试试 expr 6*7、proc、foreach、puts。输入 exit 退出。", "Try expr 6*7, proc, foreach, puts. Type exit to leave."), "d"]);
      enterTcl();
    });
  };
  commands.tcl = function () {
    if (!rawArgs) return line("usage: tcl script   " + T("(例如 tcl expr 6*7)", "(for example: tcl expr 6*7)"));
    var script = rawArgs;
    return withTcl(function () { tclRun(script); });
  };
  commands.calc = function () {
    if (!rawArgs) return line("usage: calc 2*(3+4)");
    var text = rawArgs;
    return withTcl(function (I) { try { line(I.exprStr(text)); } catch (e) { line([e.message || String(e), "r"]); } });
  };
  var DEMOS = {
    counter: ['wm title . Counter', 'set n 0', 'label .l -textvariable n -font {Helvetica 28}', 'button .b -text "+1" -command {incr n}', 'button .r -text Reset -command {set n 0}', 'pack .l -padx 40 -pady 8', 'pack .b .r -fill x -padx 12 -pady 2'],
    hello: ['wm title . Hello', 'label .l -text "Hello from Tk!" -font {Helvetica 16}', 'button .b -text "Click me" -command {tk_messageBox -message "Hi there!"}', 'pack .l -padx 30 -pady 10', 'pack .b -pady 8'],
    draw: ['wm title . Draw', 'canvas .c -width 280 -height 170 -background white', 'pack .c', 'bind .c <B1-Motion> {.c create oval [expr %x-3] [expr %y-3] [expr %x+3] [expr %y+3] -fill hotpink -outline hotpink}', 'button .x -text Clear -command {.c delete all}', 'pack .x -pady 4'],
    clock: ['wm title . Clock', 'label .t -font {Courier 24} -width 10', 'pack .t -padx 24 -pady 14', 'proc tick {} {.t configure -text [clock format [clock seconds] -format %H:%M:%S]; after 1000 tick}', 'tick']
  };
  commands.wish = function (a) {
    var name = a[0];
    if (name === "demos" || (name && !DEMOS[name])) { line([T("可选的演示：", "Demos: ") + Object.keys(DEMOS).join("  ") + T("   用法：wish counter", "   usage: wish counter"), "d"]); return; }
    return withTcl(function (I) {
      wishStarted = true;
      try { I.loadTk(); } catch (e) { wishStarted = false; line([e.message, "r"]); return; }
      line([T("Tk 窗口开了。在终端里继续敲 Tcl，就能控制它。", "A Tk window is open. Keep typing Tcl here to drive it."), "d"]);
      enterTcl();
      if (!name) { line([T("试试： button .b -text 你好 -command {puts hi}   然后 pack .b      (或者 wish demos)", "Try: button .b -text Hi -command {puts hi}   then   pack .b      (or wish demos)"), "d"]); return; }
      return DEMOS[name].reduce(function (p, l) {
        return p.then(function () { if (abort) return; echoCommand(l); tclRun(l); return sleep(200); });
      }, Promise.resolve());
    });
  };
  commands.ll = commands.ls;

  /* ---------- the prompt ---------- */
  var busy = false, scened = false, history = [], hpos = 0;
  function echoCommand(text) {
    var d = el("div", "ln");
    [].forEach.call(ps.childNodes, function (n) { d.appendChild(n.cloneNode(true)); });
    d.appendChild(document.createTextNode(text));
    out.appendChild(d); toBottom();
  }
  function run(text) {
    var trimmed = text.trim();
    echoCommand(text);
    if (!trimmed) return;
    history.push(trimmed); hpos = history.length;
    var parts = trimmed.split(/\s+/), name = parts.shift();
    rawArgs = trimmed.slice(name.length).trim();
    var fn = Object.prototype.hasOwnProperty.call(commands, name) ? commands[name] : null;
    if (!fn) { line(name + ": " + T("找不到命令。试试 help", "command not found. Try help")); return; }
    busy = true; abort = false; term.classList.add("busy");
    var done = function () { if (scened) return; busy = false; abort = false; term.classList.remove("busy"); toBottom(); };
    var r;
    try { r = fn(parts); } catch (e) { line([String(e), "r"]); done(); return; }
    Promise.resolve(r).then(done, function (e) { line([String(e), "r"]); done(); });
  }
  function complete() {
    var v = input.value, i = v.lastIndexOf(" "), head = v.slice(0, i + 1), word = v.slice(i + 1), names;
    if (mode === "tcl") names = i < 0 && interp ? Object.keys(interp.cmds) : [];
    else if (i < 0) names = Object.keys(commands);
    else {
      var slash = word.lastIndexOf("/"), dir = resolve(slash < 0 ? "." : word.slice(0, slash + 1));
      names = dir && isDir(dir.node) ? Object.keys(dir.node).map(function (k) { return (slash < 0 ? "" : word.slice(0, slash + 1)) + k + (isDir(dir.node[k]) ? "/" : ""); }) : [];
    }
    var hits = names.filter(function (n) { return n.indexOf(word) === 0; });
    if (hits.length === 1) input.value = head + hits[0] + (i < 0 ? " " : "");
    else if (hits.length > 1) { echoCommand(v); line.apply(null, hits.reduce(function (a, h) { return a.concat([h, "   "]); }, [])); }
  }
  input.addEventListener("keydown", function (e) {
    if (scened) { e.preventDefault(); return; }
    if (busy) { abort = true; e.preventDefault(); return; }
    if (e.key === "Enter") { var t = input.value; input.value = ""; if (mode === "tcl") tclLine(t); else run(t); }
    else if (e.key === "ArrowUp") { if (hpos > 0) input.value = history[--hpos]; e.preventDefault(); }
    else if (e.key === "ArrowDown") { hpos = Math.min(history.length, hpos + 1); input.value = history[hpos] || ""; e.preventDefault(); }
    else if (e.key === "Tab") { complete(); e.preventDefault(); }
    else if (e.ctrlKey && e.key === "l") { out.textContent = ""; e.preventDefault(); }
    else if (e.ctrlKey && e.key === "c") { echoCommand(input.value + "^C"); input.value = ""; tclBuf = ""; if (mode === "tcl") renderPrompt(); e.preventDefault(); }
  });
  term.addEventListener("pointerdown", function () { if (busy && !scened) abort = true; });
  term.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest(".tkwin")) return;
    if (!getSelection().toString()) input.focus({ preventScroll: true });
  });

  /* ---------- scroll-driven scenes ---------- */
  var SCENES = [
    { text: "neofetch", cmd: "neofetch", args: [] },
    { text: "cat about.txt", cmd: "cat", args: ["about.txt"] },
    { text: "cat notes.txt", cmd: "cat", args: ["notes.txt"] },
    { text: "projects", cmd: "projects", args: [] },
    { text: "cat contact.txt", cmd: "cat", args: ["contact.txt"] }
  ];
  var N = SCENES.length, wantScene = -1, shownScene = -1, runner = null, started0 = false;

  function setDots(k) {
    [].forEach.call(dots, function (d, i) { d.classList.toggle("on", i === k); d.setAttribute("aria-current", i === k ? "true" : "false"); });
    [].forEach.call(document.querySelectorAll("a[data-scene]"), function (a) { a.classList.toggle("on", +a.dataset.scene === k); });
  }
  function type(text) {
    input.value = "";
    return text.split("").reduce(function (p, ch) {
      return p.then(function () { if (abort) return; input.value += ch; return sleep(55); });
    }, Promise.resolve());
  }
  function runScene(k) {
    var s = SCENES[k];
    scened = busy = true; term.classList.add("busy");
    leaveTcl(); cwd = ["home", "zach"]; renderPrompt();
    out.textContent = ""; setDots(k);
    return sleep(160).then(function () { return type(s.text); }).then(function () {
      if (abort) return;
      input.value = "";
      echoCommand(s.text); history.push(s.text); hpos = history.length;
      return commands[s.cmd](s.args);
    });
  }
  function loop() {
    return new Promise(function (res) {
      (function next() {
        if (shownScene === wantScene) {
          scened = busy = false; abort = false; fast = false; term.classList.remove("busy");
          input.value = ""; runner = null; toBottom(); return res();
        }
        shownScene = wantScene; abort = false;
        runScene(shownScene).then(next, next);
      })();
    });
  }
  function request(k) {
    if (k === wantScene) return;
    wantScene = k; abort = true;
    if (!runner) runner = loop();
  }
  function rerender() { fast = true; shownScene = -1; abort = true; if (!runner) runner = loop(); }
  document.getElementById("lang").addEventListener("click", function () { if (wantScene >= 0) rerender(); });

  /* ---------- scroll: scene selection + tilt ---------- */
  var ticking = false, debounce = null;
  function range() { return Math.max(1, sec.offsetHeight - window.innerHeight); }
  function sceneFromScroll() {
    var r = sec.getBoundingClientRect();
    var p = r.top >= 0 ? 0 : Math.min(0.9999, -r.top / range());
    return Math.floor(p * N);
  }
  function tilt() {
    ticking = false;
    var vh = window.innerHeight, r = term.getBoundingClientRect();
    if (!started0 && r.top < vh * 0.7) started0 = true;   // the terminal is coming into view
    if (!reduce) {
      var p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)));
      var e = 1 - Math.pow(1 - p, 3);
      term.style.transform = "perspective(1400px) rotateX(" + (18 * (1 - e)).toFixed(2) + "deg) scale(" + (0.9 + 0.1 * e).toFixed(3) + ")";
      term.style.opacity = (0.15 + 0.85 * Math.min(1, p * 1.6)).toFixed(3);
      term.style.setProperty("--glow", e.toFixed(3));
    }
    if (!started0) return;
    clearTimeout(debounce);
    if (wantScene < 0) request(sceneFromScroll());
    else debounce = setTimeout(function () { request(sceneFromScroll()); }, 140);
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(tilt); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  /* ---------- ratchet: one gesture = exactly one scene ---------- */
  var animating = false, animTarget = -1, animToken = 0;
  function secTop() { return sec.getBoundingClientRect().top + window.scrollY; }
  function sceneY(k) { return secTop() + (k + 0.5) / N * range(); }
  function goScene(k) {
    k = Math.max(0, Math.min(N - 1, k));
    var token = ++animToken, y = sceneY(k), y0 = window.scrollY;
    animTarget = k; request(k);
    if (reduce || Math.abs(y - y0) < 2) {
      window.scrollTo({ top: y, behavior: "instant" }); animating = false; animTarget = -1; return;
    }
    animating = true;
    var t0 = performance.now(), ms = 640;
    (function frame(now) {
      if (token !== animToken) return;                     // a newer move took over
      var t = Math.min(1, ((now || performance.now()) - t0) / ms);
      var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      window.scrollTo({ top: y0 + (y - y0) * e, behavior: "instant" });
      if (t < 1) requestAnimationFrame(frame); else { animating = false; animTarget = -1; }
    })(t0);
  }
  function pinned() {
    var r = sec.getBoundingClientRect();
    return r.top <= 0.5 && r.bottom >= window.innerHeight - 0.5;
  }
  function current() { return animating ? animTarget : sceneFromScroll(); }
  // at the first/last scene the page scrolls on normally
  function atEdge(dir) { var c = current(); return (dir > 0 && c >= N - 1) || (dir < 0 && c <= 0); }
  function step(dir) { goScene(current() + dir); }

  var acc = 0, lastWheel = 0, locked = false;
  window.addEventListener("wheel", function (e) {
    if (e.ctrlKey || !pinned()) return;
    var d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
    if (!d) return;
    var dir = d > 0 ? 1 : -1;
    if (atEdge(dir)) return;
    e.preventDefault();
    var now = performance.now(), gap = now - lastWheel;
    lastWheel = now;
    if (gap > 350) acc = 0;                                // a new, slow gesture
    if (locked && !animating && gap > 120) locked = false; // inertia has died down
    if (locked) return;
    acc += d;
    if (Math.abs(acc) < 40) return;                        // ignore accidental nudges
    acc = 0; locked = true; step(dir);
  }, { passive: false });

  window.addEventListener("keydown", function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.altKey || e.ctrlKey || e.metaKey || !pinned()) return;
    var dir = e.key === "ArrowDown" || e.key === "PageDown" || (e.key === " " && !e.shiftKey) ? 1
            : e.key === "ArrowUp" || e.key === "PageUp" || (e.key === " " && e.shiftKey) ? -1 : 0;
    if (!dir || atEdge(dir)) return;
    e.preventDefault();
    if (!animating) step(dir);
  });

  var ty = null, tdone = false;
  window.addEventListener("touchstart", function (e) {
    ty = pinned() && e.touches.length === 1 && !(e.target.closest && e.target.closest(".tkwin")) ? e.touches[0].clientY : null; tdone = false;
  }, { passive: true });
  window.addEventListener("touchmove", function (e) {
    if (ty === null) return;
    var dy = ty - e.touches[0].clientY, dir = dy > 0 ? 1 : -1;
    if (!tdone && atEdge(dir)) { ty = null; return; }      // let the page scroll on
    if (e.cancelable) e.preventDefault();
    if (!tdone && !animating && Math.abs(dy) > 36) { tdone = true; step(dir); }
  }, { passive: false });
  window.addEventListener("touchend", function () { ty = null; }, { passive: true });

  function jump(k) { goScene(k); }
  [].forEach.call(document.querySelectorAll("[data-scene]"), function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); jump(+a.dataset.scene); });
  });

  renderPrompt();
  tilt();
})();
