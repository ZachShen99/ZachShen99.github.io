/* A small Tcl interpreter (and a toy Tk) written from scratch for the terminal on this page.
   It is not the real Tcl: it covers the everyday core (variables, procs, control flow, lists,
   strings, expr, regexp, array, dict, catch, after ...) so that people can play with it.
   Everything is a string, as in Tcl; integers are BigInt, so they do not overflow. */
(function (global) {
  "use strict";

  /* ---------- errors and control flow ---------- */
  function TclError(msg, incomplete) { this.message = msg; this.tclError = true; this.incomplete = !!incomplete; }
  TclError.prototype = Object.create(Error.prototype);
  TclError.prototype.name = "TclError";
  function err(msg, incomplete) { return new TclError(msg, incomplete); }
  function Ctl(kind, value) { this.kind = kind; this.value = value === undefined ? "" : value; }
  function Exit(code) { this.exit = true; this.code = code || 0; }

  /* ---------- backslashes, lists ---------- */
  function backslash(s, i) { // s[i] === "\\"; returns {text, next}
    var c = s[i + 1];
    if (c === undefined) return { text: "\\", next: i + 1 };
    var simple = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", f: "\f", v: "\v" };
    if (simple[c] !== undefined) return { text: simple[c], next: i + 2 };
    if (c === "\n") { var j = i + 2; while (s[j] === " " || s[j] === "\t") j++; return { text: " ", next: j }; }
    var m;
    if (c === "x" && (m = /^[0-9a-fA-F]{1,2}/.exec(s.slice(i + 2)))) return { text: String.fromCharCode(parseInt(m[0], 16)), next: i + 2 + m[0].length };
    if (c === "u" && (m = /^[0-9a-fA-F]{1,4}/.exec(s.slice(i + 2)))) return { text: String.fromCharCode(parseInt(m[0], 16)), next: i + 2 + m[0].length };
    if ((m = /^[0-7]{1,3}/.exec(s.slice(i + 1)))) return { text: String.fromCharCode(parseInt(m[0], 8)), next: i + 1 + m[0].length };
    return { text: c, next: i + 2 };
  }
  function parseList(s) {
    var out = [], i = 0, n = s.length, c, j, depth, buf, r;
    while (i < n) {
      while (i < n && /\s/.test(s[i])) i++;
      if (i >= n) break;
      c = s[i];
      if (c === "{") {
        depth = 1; j = i + 1; buf = "";
        while (j < n) {
          if (s[j] === "\\" && j + 1 < n) { buf += s[j] + s[j + 1]; j += 2; continue; }
          if (s[j] === "{") depth++;
          else if (s[j] === "}") { depth--; if (!depth) break; }
          buf += s[j]; j++;
        }
        if (depth) throw err("unmatched open brace in list");
        out.push(buf); i = j + 1;
        if (i < n && !/\s/.test(s[i])) throw err('list element in braces followed by "' + s[i] + '" instead of space');
      } else if (c === '"') {
        j = i + 1; buf = "";
        while (j < n && s[j] !== '"') {
          if (s[j] === "\\") { r = backslash(s, j); buf += r.text; j = r.next; continue; }
          buf += s[j]; j++;
        }
        if (j >= n) throw err("unmatched open quote in list");
        out.push(buf); i = j + 1;
      } else {
        buf = "";
        while (i < n && !/\s/.test(s[i])) {
          if (s[i] === "\\") { r = backslash(s, i); buf += r.text; i = r.next; continue; }
          buf += s[i]; i++;
        }
        out.push(buf);
      }
    }
    return out;
  }
  function braceBalanced(s) {
    var d = 0;
    for (var i = 0; i < s.length; i++) {
      if (s[i] === "\\") return false;
      if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (d < 0) return false; }
    }
    return d === 0;
  }
  function quoteElem(s) {
    if (s === "") return "{}";
    if (!/[\s{}"\\\[\]$;]/.test(s)) return s;
    if (braceBalanced(s)) return "{" + s + "}";
    return s.replace(/[\s{}"\\\[\]$;]/g, function (c) { return c === "\n" ? "\\n" : c === "\t" ? "\\t" : "\\" + c; });
  }
  function formatList(a) { return a.map(quoteElem).join(" "); }

  /* ---------- numbers ---------- */
  function toNumber(s) { // BigInt | Number | null
    if (typeof s === "bigint" || typeof s === "number") return s;
    var t = String(s).trim(), m;
    if (!t) return null;
    if (/^[+-]?\d+$/.test(t)) return BigInt(t.replace(/^\+/, ""));
    if ((m = /^([+-]?)0[xX]([0-9a-fA-F]+)$/.exec(t))) return (m[1] === "-" ? -1n : 1n) * BigInt("0x" + m[2]);
    if ((m = /^([+-]?)0[bB]([01]+)$/.exec(t))) return (m[1] === "-" ? -1n : 1n) * BigInt("0b" + m[2]);
    if ((m = /^([+-]?)0[oO]([0-7]+)$/.exec(t))) return (m[1] === "-" ? -1n : 1n) * BigInt("0o" + m[2]);
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
    if (/^[+-]?inf(inity)?$/i.test(t)) return t[0] === "-" ? -Infinity : Infinity;
    if (/^nan$/i.test(t)) return NaN;
    return null;
  }
  function fmtD(x) {
    if (x === Infinity) return "Inf";
    if (x === -Infinity) return "-Inf";
    if (x !== x) return "NaN";
    if (Number.isInteger(x) && Math.abs(x) < 1e17) return x.toFixed(1);
    return String(x);
  }
  function fmtVal(v) {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "number") return fmtD(v);
    return String(v);
  }
  function toBool(v, what) {
    if (typeof v === "bigint") return v !== 0n;
    if (typeof v === "number") return v !== 0;
    var t = String(v).trim().toLowerCase();
    if (t === "true" || t === "yes" || t === "on") return true;
    if (t === "false" || t === "no" || t === "off") return false;
    var n = toNumber(t);
    if (n !== null) return typeof n === "bigint" ? n !== 0n : n !== 0;
    throw err('expected boolean value but got "' + v + '"');
  }

  /* ---------- glob ---------- */
  function globToRegExp(p, nocase) {
    var re = "^", i = 0;
    while (i < p.length) {
      var c = p[i];
      if (c === "*") re += ".*";
      else if (c === "?") re += ".";
      else if (c === "[") { var j = p.indexOf("]", i + 1); if (j < 0) re += "\\["; else { re += "[" + p.slice(i + 1, j).replace(/\\/g, "\\\\") + "]"; i = j; } }
      else if (c === "\\" && i + 1 < p.length) { i++; re += p[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
      else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i++;
    }
    return new RegExp(re + "$", (nocase ? "i" : "") + "s");
  }

  /* ---------- the interpreter ---------- */
  function Frame(up) { this.vars = Object.create(null); this.up = up; }
  function Interp(host) {
    this.host = host || {};
    this.globals = new Frame(null);
    this.frame = this.globals;
    this.cmds = Object.create(null);
    this.depth = 0; this.ticks = 0; this.deadline = Infinity; this.limitMs = 3000;
    this.dry = false;
    this.tk = null;
    installCore(this);
  }
  var P = Interp.prototype;

  /* variables */
  P.splitName = function (name) {
    var m = /^([^(]*)\((.*)\)$/.exec(name);
    return m ? { base: m[1], idx: m[2] } : { base: name, idx: null };
  };
  P.frameFor = function (name) { return name.slice(0, 2) === "::" ? this.globals : this.frame; };
  P.varObj = function (base, create) {
    var f = this.frameFor(base), key = base.replace(/^::/, ""), v = f.vars[key];
    if (!v && create) v = f.vars[key] = { v: undefined, a: null, w: null };
    return v;
  };
  P.getVar = function (name) {
    var p = this.splitName(name), v = this.varObj(p.base, false);
    if (!v) throw err('can\'t read "' + name + '": no such variable');
    if (p.idx === null) {
      if (v.a) throw err('can\'t read "' + name + '": variable is array');
      if (v.v === undefined) throw err('can\'t read "' + name + '": no such variable');
      return v.v;
    }
    if (!v.a) throw err('can\'t read "' + name + '": variable isn\'t array');
    if (!v.a.has(p.idx)) throw err('can\'t read "' + name + '": no such element in array');
    return v.a.get(p.idx);
  };
  P.hasVar = function (name) {
    var p = this.splitName(name), v = this.varObj(p.base, false);
    if (!v) return false;
    if (p.idx === null) return v.a ? true : v.v !== undefined;
    return !!(v.a && v.a.has(p.idx));
  };
  P.setVar = function (name, value) {
    var p = this.splitName(name), v = this.varObj(p.base, true);
    value = String(value);
    if (p.idx === null) {
      if (v.a) throw err('can\'t set "' + name + '": variable is array');
      v.v = value;
    } else {
      if (!v.a) { if (v.v !== undefined) throw err('can\'t set "' + name + '": variable isn\'t array'); v.a = new Map(); }
      v.a.set(p.idx, value);
    }
    if (v.w) v.w.forEach(function (fn) { fn(value); });
    return value;
  };
  P.unsetVar = function (name, nocomplain) {
    var p = this.splitName(name), v = this.varObj(p.base, false);
    if (!v || (p.idx !== null && !(v.a && v.a.has(p.idx)))) {
      if (nocomplain) return;
      throw err('can\'t unset "' + name + '": no such variable');
    }
    if (p.idx === null) { var f = this.frameFor(p.base); delete f.vars[p.base.replace(/^::/, "")]; } else v.a.delete(p.idx);
  };
  P.watchVar = function (name, fn) { var v = this.varObj(name, true); (v.w = v.w || []).push(fn); };

  /* scanning helpers */
  function matchBrace(s, i) { // s[i] === "{"; returns index of the matching "}"
    var d = 0;
    for (var j = i; j < s.length; j++) {
      if (s[j] === "\\") { j++; continue; }
      if (s[j] === "{") d++;
      else if (s[j] === "}") { d--; if (!d) return j; }
    }
    throw err("missing close-brace", true);
  }
  function matchBracket(s, i) { // s[i] === "["
    var d = 0;
    for (var j = i; j < s.length; j++) {
      var c = s[j];
      if (c === "\\") { j++; continue; }
      if (c === "{") { j = matchBrace(s, j); continue; }
      if (c === '"') {
        j++;
        while (j < s.length && s[j] !== '"') { if (s[j] === "\\") j++; else if (s[j] === "[") j = matchBracket(s, j); j++; }
        if (j >= s.length) throw err("missing \"", true);
        continue;
      }
      if (c === "[") d++;
      else if (c === "]") { d--; if (!d) return j; }
    }
    throw err("missing close-bracket", true);
  }

  /* substitution at s[i] for "$", "[" or "\\" */
  P.substAt = function (s, i) {
    var c = s[i], j, r;
    if (c === "\\") return backslash(s, i);
    if (c === "[") {
      j = matchBracket(s, i);
      return { text: this.dry ? "" : this.eval(s.slice(i + 1, j)), next: j + 1 };
    }
    // "$"
    j = i + 1;
    if (s[j] === "{") {
      var k = s.indexOf("}", j);
      if (k < 0) throw err("missing close-brace for variable name", true);
      return { text: this.dry ? "" : this.getVar(s.slice(j + 1, k)), next: k + 1 };
    }
    var st = j;
    while (j < s.length && (/[A-Za-z0-9_]/.test(s[j]) || (s[j] === ":" && s[j + 1] === ":" && /[A-Za-z0-9_]/.test(s[j + 2] || "")) || (s[j] === ":" && s[j - 1] === ":" ))) j++;
    if (j === st) return { text: "$", next: i + 1 };
    var name = s.slice(st, j);
    if (s[j] === "(") {
      var d = 0, e = j;
      for (; e < s.length; e++) {
        if (s[e] === "\\") { e++; continue; }
        if (s[e] === "(") d++; else if (s[e] === ")") { d--; if (!d) break; }
      }
      if (e >= s.length) throw err("missing )", true);
      var idx = this.dry ? "" : this.substAll(s.slice(j + 1, e));
      return { text: this.dry ? "" : this.getVar(name + "(" + idx + ")"), next: e + 1 };
    }
    return { text: this.dry ? "" : this.getVar(name), next: j };
  };
  P.substAll = function (s) {
    var out = "", i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === "$" || c === "[" || c === "\\") { var r = this.substAt(s, i); out += r.text; i = r.next; }
      else { out += c; i++; }
    }
    return out;
  };

  /* one word of a command; returns {text, next, expand} */
  P.parseWord = function (s, i) {
    var c = s[i], n = s.length, r, j, out = "";
    var atEnd = function (k) { return k >= n || s[k] === " " || s[k] === "\t" || s[k] === "\r" || s[k] === "\n" || s[k] === ";" || (s[k] === "\\" && s[k + 1] === "\n"); };
    if (c === "{" && s.slice(i, i + 3) === "{*}" && !atEnd(i + 3)) { r = this.parseWord(s, i + 3); r.expand = true; return r; }
    if (c === "{") {
      j = matchBrace(s, i);
      if (!atEnd(j + 1)) throw err("extra characters after close-brace");
      return { text: s.slice(i + 1, j), next: j + 1 };
    }
    if (c === '"') {
      j = i + 1;
      while (j < n && s[j] !== '"') {
        if (s[j] === "$" || s[j] === "[" || s[j] === "\\") { r = this.substAt(s, j); out += r.text; j = r.next; }
        else { out += s[j]; j++; }
      }
      if (j >= n) throw err('missing "', true);
      if (!atEnd(j + 1)) throw err("extra characters after close-quote");
      return { text: out, next: j + 1 };
    }
    j = i;
    while (!atEnd(j)) {
      if (s[j] === "$" || s[j] === "[" || s[j] === "\\") { r = this.substAt(s, j); out += r.text; j = r.next; }
      else { out += s[j]; j++; }
    }
    return { text: out, next: j };
  };

  P.checkTime = function () {
    if (++this.ticks % 256 === 0 && performance.now() > this.deadline) throw err("script ran too long (this demo stops scripts after " + this.limitMs / 1000 + " seconds)");
  };

  /* evaluate a script; returns the result of the last command */
  P.eval = function (src) {
    var i = 0, n = src.length, result = "";
    while (i < n) {
      while (i < n && (src[i] === " " || src[i] === "\t" || src[i] === "\r" || src[i] === "\n" || src[i] === ";")) i++;
      if (i >= n) break;
      if (src[i] === "#") {
        while (i < n && src[i] !== "\n") { if (src[i] === "\\") i++; i++; }
        continue;
      }
      var words = [];
      for (;;) {
        while (i < n && (src[i] === " " || src[i] === "\t" || src[i] === "\r" || (src[i] === "\\" && src[i + 1] === "\n"))) i += src[i] === "\\" ? 2 : 1;
        if (i >= n || src[i] === "\n" || src[i] === ";") break;
        var w = this.parseWord(src, i);
        if (w.expand) { var els = this.dry ? [] : parseList(w.text); for (var k = 0; k < els.length; k++) words.push(els[k]); }
        else words.push(w.text);
        i = w.next;
      }
      if (words.length && !this.dry) result = this.invoke(words);
    }
    return result;
  };
  P.invoke = function (words) {
    this.checkTime();
    var fn = this.cmds[words[0]];
    if (!fn) {
      if (this.cmds.unknown) return this.cmds.unknown.call(this, ["unknown"].concat(words));
      throw err('invalid command name "' + words[0] + '"');
    }
    return fn.call(this, words);
  };
  /* top-level entry: sets the time limit */
  P.run = function (src) {
    var top = this.depth === 0 && !this.running;
    if (top) { this.deadline = performance.now() + this.limitMs; this.running = true; }
    try { return this.eval(src); }
    finally { if (top) this.running = false; }
  };
  P.complete = function (src) {
    var was = this.dry; this.dry = true;
    try { this.eval(src); return true; }
    catch (e) { return !(e && e.incomplete); }
    finally { this.dry = was; }
  };
  P.inFrame = function (frame, fn) {
    var save = this.frame; this.frame = frame;
    try { return fn.call(this); } finally { this.frame = save; }
  };
  /* run a script as the body of a loop / if: break and continue pass through as exceptions */
  P.body = function (script) { return this.eval(script); };

  /* ---------- expr ---------- */
  var FUNCS = {
    abs: function (a) { return typeof a === "bigint" ? (a < 0n ? -a : a) : Math.abs(a); },
    int: function (a) { return typeof a === "bigint" ? a : BigInt(Math.trunc(a)); },
    wide: function (a) { return FUNCS.int(a); },
    double: function (a) { return Number(a); },
    round: function (a) { return typeof a === "bigint" ? a : BigInt(a < 0 ? -Math.round(-a) : Math.round(a)); },
    floor: function (a) { return Math.floor(Number(a)); },
    ceil: function (a) { return Math.ceil(Number(a)); },
    sqrt: function (a) { a = Number(a); if (a < 0) throw err("domain error: argument not in valid range"); return Math.sqrt(a); },
    pow: function (a, b) { return Math.pow(Number(a), Number(b)); },
    exp: function (a) { return Math.exp(Number(a)); },
    log: function (a) { return Math.log(Number(a)); },
    log10: function (a) { return Math.log10(Number(a)); },
    sin: function (a) { return Math.sin(Number(a)); }, cos: function (a) { return Math.cos(Number(a)); }, tan: function (a) { return Math.tan(Number(a)); },
    asin: function (a) { return Math.asin(Number(a)); }, acos: function (a) { return Math.acos(Number(a)); }, atan: function (a) { return Math.atan(Number(a)); },
    atan2: function (a, b) { return Math.atan2(Number(a), Number(b)); },
    hypot: function (a, b) { return Math.hypot(Number(a), Number(b)); },
    fmod: function (a, b) { return Number(a) % Number(b); },
    rand: function () { return Math.random(); },
    srand: function () { return 0n; },
    isqrt: function (a) { return BigInt(Math.floor(Math.sqrt(Number(a)))); },
    max: function () { var a = [].slice.call(arguments); return a.reduce(function (m, x) { return x > m ? x : m; }); },
    min: function () { var a = [].slice.call(arguments); return a.reduce(function (m, x) { return x < m ? x : m; }); }
  };
  var BINPREC = { "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "in": 6, "ni": 6, "eq": 7, "ne": 7, "==": 8, "!=": 8, "<": 9, ">": 9, "<=": 9, ">=": 9, "<<": 10, ">>": 10, "+": 11, "-": 11, "*": 12, "/": 12, "%": 12, "**": 13 };

  function ExprParser(interp, text) { this.ip = interp; this.s = text; this.i = 0; }
  var EP = ExprParser.prototype;
  EP.ws = function () { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; };
  EP.parse = function () {
    var t = this.ternary(); this.ws();
    if (this.i < this.s.length) throw err('syntax error in expression "' + this.s + '"');
    return t;
  };
  EP.ternary = function () {
    var c = this.binary(1); this.ws();
    if (this.s[this.i] === "?") {
      this.i++; var a = this.ternary(); this.ws();
      if (this.s[this.i] !== ":") throw err('syntax error in expression "' + this.s + '"');
      this.i++; var b = this.ternary();
      return { op: "?:", a: c, b: a, c: b };
    }
    return c;
  };
  EP.peekOp = function () {
    this.ws();
    var rest = this.s.slice(this.i, this.i + 3), m;
    if ((m = /^(\*\*|\|\||&&|==|!=|<=|>=|<<|>>)/.exec(rest))) return m[0];
    if ((m = /^(eq|ne|in|ni)(?![A-Za-z0-9_])/.exec(this.s.slice(this.i, this.i + 3)))) return m[0];
    if (/^[-+*\/%<>&|^]/.test(rest)) return rest[0];
    return null;
  };
  EP.binary = function (min) {
    var left = this.unary();
    for (;;) {
      var op = this.peekOp();
      if (!op || BINPREC[op] < min) return left;
      this.i += op.length;
      var right = op === "**" ? this.binary(BINPREC[op]) : this.binary(BINPREC[op] + 1);
      left = { op: op, a: left, b: right };
    }
  };
  EP.unary = function () {
    this.ws();
    var c = this.s[this.i];
    if (c === "-" || c === "+" || c === "!" || c === "~") { this.i++; return { op: "u" + c, a: this.unary() }; }
    return this.primary();
  };
  EP.primary = function () {
    this.ws();
    var s = this.s, c = s[this.i], m, r;
    if (c === "(") {
      this.i++; var e = this.ternary(); this.ws();
      if (s[this.i] !== ")") throw err('unbalanced open paren in expression "' + s + '"');
      this.i++; return e;
    }
    if (c === "$" || c === "[") {                       // find where it ends without evaluating it yet
      var was = this.ip.dry, nx;
      this.ip.dry = true;
      try { nx = this.ip.substAt(s, this.i).next; } finally { this.ip.dry = was; }
      var src = s.slice(this.i, nx); this.i = nx;
      return { t: "sub", src: src };
    }
    if (c === '"') {
      var k = this.i + 1;
      while (k < s.length && s[k] !== '"') { if (s[k] === "\\") k++; else if (s[k] === "[") k = matchBracket(s, k); k++; }
      var raw = s.slice(this.i + 1, k); this.i = k + 1; return { t: "qstr", src: raw };
    }
    if (c === "{") { var q = matchBrace(s, this.i); var lit = s.slice(this.i + 1, q); this.i = q + 1; return { t: "lit", v: lit }; }
    if ((m = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(s.slice(this.i)))) {
      this.i += m[0].length;
      return { t: "num", v: toNumber(m[0]) };
    }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(this.i)))) {
      var name = m[0]; this.i += name.length; this.ws();
      if (s[this.i] === "(") {
        this.i++; var args = []; this.ws();
        if (s[this.i] === ")") this.i++;
        else for (;;) {
          args.push(this.ternary()); this.ws();
          if (s[this.i] === ",") { this.i++; continue; }
          if (s[this.i] === ")") { this.i++; break; }
          throw err('syntax error in expression "' + s + '"');
        }
        if (!FUNCS[name]) throw err('invalid command name "' + name + '"');
        return { t: "call", name: name, args: args };
      }
      var low = name.toLowerCase();
      if (low === "true" || low === "yes" || low === "on") return { t: "num", v: 1n };
      if (low === "false" || low === "no" || low === "off") return { t: "num", v: 0n };
      if (low === "inf") return { t: "num", v: Infinity };
      if (low === "nan") return { t: "num", v: NaN };
      throw err('invalid bareword "' + name + '"');
    }
    throw err('syntax error in expression "' + s + '"');
  };

  function numOrStr(str) { var n = toNumber(str); return n === null ? str : n; }
  function needNum(v, op) {
    if (typeof v === "bigint" || typeof v === "number") return v;
    var n = toNumber(v);
    if (n === null) throw err('can\'t use non-numeric string as operand of "' + op + '"');
    return n;
  }
  function floorDiv(a, b) { var q = a / b; if (a % b !== 0n && ((a < 0n) !== (b < 0n))) q -= 1n; return q; }
  function floorMod(a, b) { var r = a % b; if (r !== 0n && ((r < 0n) !== (b < 0n))) r += b; return r; }

  P.evalNode = function (nd) {
    var self = this, a, b;
    if (nd.t === "num") return nd.v;
    if (nd.t === "lit") return numOrStr(nd.v);
    if (nd.t === "sub") return numOrStr(this.substAll(nd.src));
    if (nd.t === "qstr") return numOrStr(this.substAll(nd.src));
    if (nd.t === "call") {
      var args = nd.args.map(function (x) { return needNum(self.evalNode(x), nd.name + "()"); });
      return FUNCS[nd.name].apply(null, args);
    }
    var op = nd.op;
    if (op === "?:") return toBool(this.evalNode(nd.a)) ? this.evalNode(nd.b) : this.evalNode(nd.c);
    if (op === "&&") return toBool(this.evalNode(nd.a)) && toBool(this.evalNode(nd.b)) ? 1n : 0n;
    if (op === "||") return toBool(this.evalNode(nd.a)) || toBool(this.evalNode(nd.b)) ? 1n : 0n;
    if (op === "u-") { a = needNum(this.evalNode(nd.a), "-"); return -a; }
    if (op === "u+") return needNum(this.evalNode(nd.a), "+");
    if (op === "u!") return toBool(this.evalNode(nd.a)) ? 0n : 1n;
    if (op === "u~") { a = needNum(this.evalNode(nd.a), "~"); if (typeof a !== "bigint") throw err("can't use floating-point value as operand of \"~\""); return ~a; }
    a = this.evalNode(nd.a); b = this.evalNode(nd.b);
    if (op === "eq") return fmtVal(a) === fmtVal(b) ? 1n : 0n;
    if (op === "ne") return fmtVal(a) !== fmtVal(b) ? 1n : 0n;
    if (op === "in" || op === "ni") { var has = parseList(fmtVal(b)).indexOf(fmtVal(a)) >= 0; return (op === "in") === has ? 1n : 0n; }
    var na = toNumber(a), nb = toNumber(b);
    if (op === "==" || op === "!=" || op === "<" || op === ">" || op === "<=" || op === ">=") {
      var x, y;
      if (na !== null && nb !== null) { x = na; y = nb; } else { x = fmtVal(a); y = fmtVal(b); }
      var res = op === "==" ? x == y : op === "!=" ? x != y : op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y; // eslint-disable-line eqeqeq
      return res ? 1n : 0n;
    }
    na = needNum(a, op); nb = needNum(b, op);
    var big = typeof na === "bigint" && typeof nb === "bigint";
    if (!big) { na = Number(na); nb = Number(nb); }
    switch (op) {
      case "+": return na + nb;
      case "-": return na - nb;
      case "*": return na * nb;
      case "/":
        if (big) { if (nb === 0n) throw err("divide by zero"); return floorDiv(na, nb); }
        return na / nb;
      case "%":
        if (!big) throw err('can\'t use floating-point value as operand of "%"');
        if (nb === 0n) throw err("divide by zero");
        return floorMod(na, nb);
      case "**":
        if (big && nb >= 0n) return na ** nb;
        return Math.pow(Number(na), Number(nb));
      case "<<": case ">>": case "&": case "|": case "^":
        if (!big) throw err('can\'t use floating-point value as operand of "' + op + '"');
        return op === "<<" ? na << nb : op === ">>" ? na >> nb : op === "&" ? na & nb : op === "|" ? na | nb : na ^ nb;
    }
    throw err('syntax error in expression');
  };
  P.expr = function (text) {
    var ast = new ExprParser(this, text).parse();
    return this.dry ? 0n : this.evalNode(ast);
  };
  P.exprStr = function (text) { return fmtVal(this.expr(text)); };
  P.cond = function (text) { return toBool(this.expr(text)); };

  /* ---------- procs ---------- */
  function wrongArgs(name, usage) { return err('wrong # args: should be "' + name + (usage ? " " + usage : "") + '"'); }
  function makeProc(interp, name, argSpec, body) {
    var specs = parseList(argSpec).map(function (a) { var p = parseList(a); return { name: p[0], def: p.length > 1 ? p[1] : undefined, hasDef: p.length > 1 }; });
    var usage = specs.map(function (s) { return s.name === "args" ? "?arg ...?" : s.hasDef ? "?" + s.name + "?" : s.name; }).join(" ");
    return function (argv) {
      var interp2 = this, frame = new Frame(interp2.frame), args = argv.slice(1), i;
      for (i = 0; i < specs.length; i++) {
        var sp = specs[i];
        if (sp.name === "args" && i === specs.length - 1) { frame.vars.args = { v: formatList(args.slice(i)), a: null, w: null }; args = []; break; }
        if (i < args.length) frame.vars[sp.name] = { v: args[i], a: null, w: null };
        else if (sp.hasDef) frame.vars[sp.name] = { v: sp.def, a: null, w: null };
        else throw wrongArgs(name, usage);
      }
      if (args.length > specs.length && !(specs.length && specs[specs.length - 1].name === "args")) throw wrongArgs(name, usage);
      if (interp2.depth > 200) throw err("too many nested evaluations (infinite recursion?)");
      interp2.depth++;
      var save = interp2.frame; interp2.frame = frame;
      try { return interp2.eval(body); }
      catch (e) {
        if (e instanceof Ctl) {
          if (e.kind === "return") return e.value;
          throw err('invoked "' + e.kind + '" outside of a loop');
        }
        throw e;
      } finally { interp2.frame = save; interp2.depth--; }
    };
  }

  /* ---------- helpers for the commands ---------- */
  function listIndex(s, len) {
    var m;
    s = String(s).trim();
    if (s === "end") return len - 1;
    if ((m = /^end-(\d+)$/.exec(s))) return len - 1 - parseInt(m[1], 10);
    if ((m = /^end\+(\d+)$/.exec(s))) return len - 1 + parseInt(m[1], 10);
    if ((m = /^(\d+)([+-])(\d+)$/.exec(s))) return parseInt(m[1], 10) + (m[2] === "+" ? 1 : -1) * parseInt(m[3], 10);
    if (/^[+-]?\d+$/.test(s)) return parseInt(s, 10);
    throw err('bad index "' + s + '": must be integer?[+-]integer? or end?[+-]integer?');
  }
  function fmtFormat(fmt, args) {
    var ai = 0;
    return fmt.replace(/%([-+ 0#]*)(\*|\d+)?(?:\.(\d+))?([diuoxXeEfgGscb%])/g, function (all, flags, width, prec, conv) {
      if (conv === "%") return "%";
      if (ai >= args.length) throw err("not enough arguments for all format specifiers");
      if (width === "*") width = String(args[ai++]);
      var a = args[ai++], s, num;
      if (conv === "s") { s = String(a); if (prec !== undefined) s = s.slice(0, +prec); }
      else if (conv === "c") s = String.fromCharCode(Number(toNumber(a)));
      else {
        num = toNumber(a);
        if (num === null) throw err('expected number but got "' + a + '"');
        if (/[diuoxXb]/.test(conv)) {
          var bi = typeof num === "bigint" ? num : BigInt(Math.trunc(num)), neg = bi < 0n, mag = neg ? -bi : bi;
          s = conv === "o" ? mag.toString(8) : conv === "x" ? mag.toString(16) : conv === "X" ? mag.toString(16).toUpperCase() : conv === "b" ? mag.toString(2) : mag.toString();
          if (prec !== undefined) s = s.padStart(+prec, "0");
          if (flags.indexOf("#") >= 0 && conv === "x") s = "0x" + s;
          if (neg) s = "-" + s; else if (flags.indexOf("+") >= 0) s = "+" + s; else if (flags.indexOf(" ") >= 0) s = " " + s;
        } else {
          var d = Number(num), p = prec === undefined ? 6 : +prec;
          s = conv === "f" ? Math.abs(d).toFixed(p) : conv === "e" || conv === "E" ? Math.abs(d).toExponential(p).replace(/e([+-])(\d)$/, "e$10$2") : String(+Math.abs(d).toPrecision(p || 1));
          if (conv === "E") s = s.toUpperCase();
          if (d < 0) s = "-" + s; else if (flags.indexOf("+") >= 0) s = "+" + s; else if (flags.indexOf(" ") >= 0) s = " " + s;
        }
      }
      if (width && s.length < +width) {
        if (flags.indexOf("-") >= 0) s = s.padEnd(+width, " ");
        else if (flags.indexOf("0") >= 0 && conv !== "s" && conv !== "c") { var sign = /^[+-]/.test(s) ? s[0] : ""; s = sign + s.slice(sign.length).padStart(+width - sign.length, "0"); }
        else s = s.padStart(+width, " ");
      }
      return s;
    });
  }
  function jsRegExp(pat, flags) {
    try { return new RegExp(pat.replace(/\(\?e\)/g, "").replace(/\[:alpha:\]/g, "A-Za-z").replace(/\[:digit:\]/g, "0-9").replace(/\[:space:\]/g, "\\s").replace(/\[:alnum:\]/g, "A-Za-z0-9").replace(/\[:upper:\]/g, "A-Z").replace(/\[:lower:\]/g, "a-z"), flags); }
    catch (e) { throw err("couldn't compile regular expression pattern: " + e.message); }
  }
  function cmpVals(a, b, mode) {
    if (mode === "integer" || mode === "real") { var x = Number(toNumber(a)), y = Number(toNumber(b)); return x < y ? -1 : x > y ? 1 : 0; }
    if (mode === "dictionary") { var la = a.toLowerCase(), lb = b.toLowerCase(); return la < lb ? -1 : la > lb ? 1 : a < b ? -1 : a > b ? 1 : 0; }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function dictFrom(s) {
    var l = parseList(s), m = new Map();
    if (l.length % 2) throw err("missing value to go with key");
    for (var i = 0; i < l.length; i += 2) m.set(l[i], l[i + 1]);
    return m;
  }
  function dictTo(m) { var a = []; m.forEach(function (v, k) { a.push(k, v); }); return formatList(a); }

  /* ---------- the built-in commands ---------- */
  function installCore(I) {
    var C = I.cmds;
    function need(argv, min, max, usage) {
      if (argv.length - 1 < min || (max >= 0 && argv.length - 1 > max)) throw wrongArgs(argv[0], usage);
    }
    function def(names, fn) { names.split(" ").forEach(function (n) { C[n] = fn; }); }
    function loopBody(self, script) { // returns "break" or "" ; propagates errors
      try { self.eval(script); }
      catch (e) {
        if (e instanceof Ctl) { if (e.kind === "break") return "break"; if (e.kind === "continue") return ""; }
        throw e;
      }
      return "";
    }

    def("set", function (a) { need(a, 1, 2, "varName ?newValue?"); return a.length === 2 ? this.getVar(a[1]) : this.setVar(a[1], a[2]); });
    def("unset", function (a) { var i = 1, nc = false; if (a[1] === "-nocomplain") { nc = true; i = 2; } if (a[i] === "--") i++; for (; i < a.length; i++) this.unsetVar(a[i], nc); return ""; });
    def("puts", function (a) {
      var i = 1, nl = true, chan = "stdout";
      if (a[i] === "-nonewline") { nl = false; i++; }
      if (a.length - i === 2) { chan = a[i]; i++; }
      if (a.length - i !== 1) throw wrongArgs("puts", "?-nonewline? ?channelId? string");
      if (chan !== "stdout" && chan !== "stderr") throw err('can\'t find channel named "' + chan + '"');
      if (this.host.puts) this.host.puts(a[i], nl, chan);
      return "";
    });
    def("expr", function (a) { need(a, 1, -1, "arg ?arg ...?"); return this.exprStr(a.slice(1).join(" ")); });
    def("if", function (a) {
      var i = 1;
      for (;;) {
        if (i >= a.length) throw wrongArgs("if", "expression ?then? body ?elseif expression ?then? body ...? ?else? ?body?");
        var c = this.cond(a[i++]);
        if (a[i] === "then") i++;
        if (i >= a.length) throw wrongArgs("if", "expression ?then? body ?elseif ...? ?else? ?body?");
        var body = a[i++];
        if (c) return this.eval(body);
        if (i >= a.length) return "";
        if (a[i] === "elseif") { i++; continue; }
        if (a[i] === "else") i++;
        if (i >= a.length) throw wrongArgs("if", "expression ?then? body ?elseif ...? ?else? ?body?");
        return this.eval(a[i]);
      }
    });
    def("while", function (a) {
      need(a, 2, 2, "test command");
      while (this.cond(a[1])) { this.checkTime(); if (loopBody(this, a[2]) === "break") break; }
      return "";
    });
    def("for", function (a) {
      need(a, 4, 4, "start test next command");
      this.eval(a[1]);
      while (this.cond(a[2])) { this.checkTime(); if (loopBody(this, a[4]) === "break") break; this.eval(a[3]); }
      return "";
    });
    def("foreach", function (a) {
      if (a.length < 4 || a.length % 2 !== 0) throw wrongArgs("foreach", "varList list ?varList list ...? command");
      var vars = [], lists = [], i;
      for (i = 1; i < a.length - 1; i += 2) { vars.push(parseList(a[i])); lists.push(parseList(a[i + 1])); }
      var rounds = 0;
      for (i = 0; i < vars.length; i++) rounds = Math.max(rounds, Math.ceil(lists[i].length / vars[i].length));
      for (var r = 0; r < rounds; r++) {
        for (i = 0; i < vars.length; i++) for (var k = 0; k < vars[i].length; k++) { var v = lists[i][r * vars[i].length + k]; this.setVar(vars[i][k], v === undefined ? "" : v); }
        this.checkTime();
        if (loopBody(this, a[a.length - 1]) === "break") break;
      }
      return "";
    });
    def("lmap", function (a) {
      if (a.length !== 4) throw wrongArgs("lmap", "varList list command");
      var vars = parseList(a[1]), list = parseList(a[2]), out = [];
      for (var r = 0; r < list.length; r += vars.length) {
        for (var k = 0; k < vars.length; k++) this.setVar(vars[k], list[r + k] === undefined ? "" : list[r + k]);
        try { out.push(this.eval(a[3])); } catch (e) { if (e instanceof Ctl && e.kind === "continue") continue; if (e instanceof Ctl && e.kind === "break") break; throw e; }
      }
      return formatList(out);
    });
    def("break", function () { throw new Ctl("break"); });
    def("continue", function () { throw new Ctl("continue"); });
    def("return", function (a) {
      var i = 1;
      while (a[i] && a[i][0] === "-" && a.length - i > 1 && (a[i] === "-code" || a[i] === "-level" || a[i] === "-errorcode")) i += 2;
      throw new Ctl("return", a.length > i ? a[i] : "");
    });
    def("proc", function (a) { need(a, 3, 3, "name args body"); var fn = makeProc(this, a[1], a[2], a[3]); fn.isProc = true; this.cmds[a[1]] = fn; return ""; });
    def("rename", function (a) { need(a, 2, 2, "oldName newName"); if (!this.cmds[a[1]]) throw err('can\'t rename "' + a[1] + '": command doesn\'t exist'); if (a[2] === "") delete this.cmds[a[1]]; else { this.cmds[a[2]] = this.cmds[a[1]]; delete this.cmds[a[1]]; } return ""; });
    def("incr", function (a) {
      need(a, 1, 2, "varName ?increment?");
      var cur = this.hasVar(a[1]) ? toNumber(this.getVar(a[1])) : 0n, inc = a.length > 2 ? toNumber(a[2]) : 1n;
      if (typeof cur !== "bigint" || typeof inc !== "bigint") throw err('expected integer but got "' + (this.hasVar(a[1]) ? this.getVar(a[1]) : a[2]) + '"');
      return this.setVar(a[1], (cur + inc).toString());
    });
    def("append", function (a) { need(a, 1, -1, "varName ?value ...?"); var cur = this.hasVar(a[1]) ? this.getVar(a[1]) : ""; return this.setVar(a[1], cur + a.slice(2).join("")); });
    def("global", function (a) { for (var i = 1; i < a.length; i++) { var g = this.varObj("::" + a[i], true); this.frame.vars[a[i]] = g; } return ""; });
    def("variable", function (a) { for (var i = 1; i < a.length; i += 2) { var g = this.varObj("::" + a[i], true); this.frame.vars[a[i]] = g; if (i + 1 < a.length) g.v = a[i + 1]; } return ""; });
    def("upvar", function (a) {
      var i = 1, level = 1;
      if (/^#?\d+$/.test(a[1] || "")) { level = a[1][0] === "#" ? -parseInt(a[1].slice(1), 10) - 1 : parseInt(a[1], 10); i = 2; }
      var target = this.frame;
      if (level < 0) target = this.globals; else for (var k = 0; k < level && target.up; k++) target = target.up;
      for (; i + 1 < a.length; i += 2) {
        var save = this.frame; this.frame = target; var o = this.varObj(a[i], true); this.frame = save;
        this.frame.vars[a[i + 1]] = o;
      }
      return "";
    });
    def("uplevel", function (a) {
      var i = 1, level = 1;
      if (/^#?\d+$/.test(a[1] || "") && a.length > 2) { level = a[1][0] === "#" ? -parseInt(a[1].slice(1), 10) - 1 : parseInt(a[1], 10); i = 2; }
      var target = this.frame;
      if (level < 0) target = this.globals; else for (var k = 0; k < level && target.up; k++) target = target.up;
      var script = a.slice(i).join(" ");
      return this.inFrame(target, function () { return this.eval(script); });
    });
    def("eval", function (a) { need(a, 1, -1, "arg ?arg ...?"); return this.eval(a.slice(1).join(" ")); });
    def("subst", function (a) { need(a, 1, 1, "string"); return this.substAll(a[1]); });
    def("catch", function (a) {
      need(a, 1, 3, "script ?resultVarName? ?optionsVarName?");
      var code = 0, res;
      try { res = this.eval(a[1]); }
      catch (e) {
        if (e instanceof Ctl) { code = e.kind === "return" ? 2 : e.kind === "break" ? 3 : 4; res = e.value; }
        else if (e && e.tclError) { code = 1; res = e.message; }
        else throw e;
      }
      if (a[2]) this.setVar(a[2], res);
      if (a[3]) this.setVar(a[3], formatList(["-code", String(code)]));
      return String(code);
    });
    def("error", function (a) { need(a, 1, 3, "message ?info? ?code?"); throw err(a[1]); });
    def("exit", function (a) { throw new Exit(a[1] ? parseInt(a[1], 10) : 0); });
    def("update", function () { return ""; });
    def("package", function (a) {
      if (a[1] === "require") {
        if (a[2] === "Tk") { if (!this.loadTk) throw err("Tk is not available here"); this.loadTk(); return "8.6"; }
        if (/^(Tcl|http|msgcat|struct|control)$/.test(a[2])) return "8.6";
        throw err("can't find package " + a[2]);
      }
      return "";
    });
    def("namespace", function (a) { if (a[1] === "eval") return this.eval(a.slice(3).join(" ")); return ""; });

    /* lists */
    def("list", function (a) { return formatList(a.slice(1)); });
    def("llength", function (a) { need(a, 1, 1, "list"); return String(parseList(a[1]).length); });
    def("lindex", function (a) {
      need(a, 1, -1, "list ?index ...?");
      var cur = a[1];
      for (var i = 2; i < a.length; i++) { var l = parseList(cur), ix = listIndex(a[i], l.length); cur = ix >= 0 && ix < l.length ? l[ix] : ""; }
      return cur;
    });
    def("lrange", function (a) { need(a, 3, 3, "list first last"); var l = parseList(a[1]), f = Math.max(0, listIndex(a[2], l.length)), t = Math.min(l.length - 1, listIndex(a[3], l.length)); return formatList(l.slice(f, t + 1)); });
    def("lappend", function (a) { need(a, 1, -1, "varName ?value ...?"); var cur = this.hasVar(a[1]) ? parseList(this.getVar(a[1])) : []; return this.setVar(a[1], formatList(cur.concat(a.slice(2)))); });
    def("lreverse", function (a) { need(a, 1, 1, "list"); return formatList(parseList(a[1]).reverse()); });
    def("lrepeat", function (a) { var n = parseInt(a[1], 10), out = []; for (var i = 0; i < n; i++) out = out.concat(a.slice(2)); return formatList(out); });
    def("concat", function (a) { return a.slice(1).map(function (s) { return s.trim(); }).filter(Boolean).join(" "); });
    def("join", function (a) { need(a, 1, 2, "list ?joinString?"); return parseList(a[1]).join(a.length > 2 ? a[2] : " "); });
    def("split", function (a) {
      need(a, 1, 2, "string ?splitChars?");
      var s = a[1], chars = a.length > 2 ? a[2] : " \t\n\r";
      if (chars === "") return formatList(s.split(""));
      var out = [], cur = "";
      for (var i = 0; i < s.length; i++) { if (chars.indexOf(s[i]) >= 0) { out.push(cur); cur = ""; } else cur += s[i]; }
      out.push(cur);
      return formatList(out);
    });
    def("linsert", function (a) { need(a, 3, -1, "list index element ?element ...?"); var l = parseList(a[1]), ix = Math.max(0, Math.min(l.length, listIndex(a[2], l.length + 1) )); l.splice.apply(l, [ix, 0].concat(a.slice(3))); return formatList(l); });
    def("lreplace", function (a) { need(a, 3, -1, "list first last ?element ...?"); var l = parseList(a[1]), f = Math.max(0, listIndex(a[2], l.length)), t = listIndex(a[3], l.length); l.splice.apply(l, [f, Math.max(0, t - f + 1)].concat(a.slice(4))); return formatList(l); });
    def("lset", function (a) { need(a, 3, 3, "listVar index value"); var l = parseList(this.getVar(a[1])), ix = listIndex(a[2], l.length); if (ix < 0 || ix >= l.length) throw err("list index out of range"); l[ix] = a[3]; return this.setVar(a[1], formatList(l)); });
    def("lassign", function (a) { need(a, 2, -1, "list ?varName ...?"); var l = parseList(a[1]); for (var i = 2; i < a.length; i++) this.setVar(a[i], l[i - 2] === undefined ? "" : l[i - 2]); return formatList(l.slice(a.length - 2)); });
    def("lsearch", function (a) {
      var i = 1, mode = "glob", all = false, inline = false, nocase = false;
      for (; i < a.length - 2 && a[i][0] === "-"; i++) { if (a[i] === "-exact") mode = "exact"; else if (a[i] === "-glob") mode = "glob"; else if (a[i] === "-regexp") mode = "regexp"; else if (a[i] === "-all") all = true; else if (a[i] === "-inline") inline = true; else if (a[i] === "-nocase") nocase = true; }
      var l = parseList(a[i]), pat = a[i + 1], out = [];
      var test = mode === "exact" ? function (x) { return nocase ? x.toLowerCase() === pat.toLowerCase() : x === pat; }
        : mode === "regexp" ? (function () { var re = jsRegExp(pat, nocase ? "i" : ""); return function (x) { return re.test(x); }; })()
        : (function () { var re = globToRegExp(pat, nocase); return function (x) { return re.test(x); }; })();
      for (var k = 0; k < l.length; k++) if (test(l[k])) { out.push(inline ? l[k] : String(k)); if (!all) break; }
      return all ? formatList(out) : inline ? (out[0] || "") : (out.length ? out[0] : "-1");
    });
    def("lsort", function (a) {
      var mode = "ascii", dec = false, uniq = false, idx = null, i = 1;
      for (; i < a.length - 1; i++) {
        if (a[i] === "-integer") mode = "integer"; else if (a[i] === "-real") mode = "real"; else if (a[i] === "-ascii") mode = "ascii"; else if (a[i] === "-dictionary") mode = "dictionary";
        else if (a[i] === "-decreasing") dec = true; else if (a[i] === "-increasing") dec = false; else if (a[i] === "-unique") uniq = true;
        else if (a[i] === "-index") { idx = a[++i]; } else throw err('bad option "' + a[i] + '": must be -ascii, -command, -decreasing, -dictionary, -increasing, -index, -indices, -integer, -nocase, -real, or -unique');
      }
      var l = parseList(a[i]);
      var key = function (x) { return idx === null ? x : (parseList(x)[listIndex(idx, parseList(x).length)] || ""); };
      l = l.map(function (x, n) { return { x: x, k: key(x), n: n }; });
      l.sort(function (p, q) { var c = cmpVals(p.k, q.k, mode); if (dec) c = -c; return c || p.n - q.n; });
      var out = l.map(function (o) { return o.x; });
      if (uniq) out = out.filter(function (x, n) { return n === 0 || cmpVals(key(x), key(out[n - 1]), mode) !== 0; });
      return formatList(out);
    });

    /* strings */
    def("string", function (a) {
      need(a, 1, -1, "subcommand ?arg ...?");
      var sub = a[1], s = a[2];
      switch (sub) {
        case "length": return String(Array.from(s).length);
        case "tolower": return s.toLowerCase();
        case "toupper": return s.toUpperCase();
        case "totitle": return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        case "trim": case "trimleft": case "trimright": {
          var chars = a[3] === undefined ? " \t\n\r" : a[3], b = 0, e = s.length;
          if (sub !== "trimright") while (b < e && chars.indexOf(s[b]) >= 0) b++;
          if (sub !== "trimleft") while (e > b && chars.indexOf(s[e - 1]) >= 0) e--;
          return s.slice(b, e);
        }
        case "index": { var ix = listIndex(a[3], s.length); return ix >= 0 && ix < s.length ? s[ix] : ""; }
        case "range": { var f = Math.max(0, listIndex(a[3], s.length)), t = Math.min(s.length - 1, listIndex(a[4], s.length)); return s.slice(f, t + 1); }
        case "repeat": return s.repeat(Math.max(0, parseInt(a[3], 10)));
        case "reverse": return Array.from(s).reverse().join("");
        case "equal": { var nc = a[2] === "-nocase"; var x = nc ? a[3] : a[2], y = nc ? a[4] : a[3]; return (nc ? x.toLowerCase() === y.toLowerCase() : x === y) ? "1" : "0"; }
        case "compare": return String(cmpVals(a[2], a[3], "ascii"));
        case "first": { var r = a[3].indexOf(a[2], a[4] ? parseInt(a[4], 10) : 0); return String(r); }
        case "last": return String(a[3].lastIndexOf(a[2]));
        case "match": { var nc2 = a[2] === "-nocase"; return globToRegExp(nc2 ? a[3] : a[2], nc2).test(nc2 ? a[4] : a[3]) ? "1" : "0"; }
        case "map": {
          var pairs = parseList(a[2]), str = a[3], out = "", i2 = 0;
          outer: while (i2 < str.length) {
            for (var p = 0; p < pairs.length; p += 2) if (pairs[p] && str.startsWith(pairs[p], i2)) { out += pairs[p + 1]; i2 += pairs[p].length; continue outer; }
            out += str[i2++];
          }
          return out;
        }
        case "replace": { var f2 = listIndex(a[3], s.length), t2 = listIndex(a[4], s.length); return s.slice(0, f2) + (a[5] || "") + s.slice(t2 + 1); }
        case "cat": return a.slice(2).join("");
        case "is": {
          var cls = a[2], v = a[a.length - 1];
          if (cls === "integer") return /^\s*[+-]?\d+\s*$/.test(v) ? "1" : "0";
          if (cls === "double") return toNumber(v) !== null ? "1" : "0";
          if (cls === "alpha") return /^[A-Za-z]+$/.test(v) ? "1" : "0";
          if (cls === "digit") return /^\d+$/.test(v) ? "1" : "0";
          if (cls === "alnum") return /^[A-Za-z0-9]+$/.test(v) ? "1" : "0";
          if (cls === "space") return /^\s+$/.test(v) ? "1" : "0";
          if (cls === "boolean") { try { toBool(v); return "1"; } catch (e) { return "0"; } }
          return "0";
        }
      }
      throw err('unknown or ambiguous subcommand "' + sub + '": must be cat, compare, equal, first, index, is, last, length, map, match, range, repeat, replace, reverse, tolower, totitle, toupper, trim, trimleft, or trimright');
    });
    def("format", function (a) { need(a, 1, -1, "formatString ?arg ...?"); return fmtFormat(a[1], a.slice(2)); });
    def("regexp", function (a) {
      var i = 1, nocase = false, all = false, inline = false;
      for (; i < a.length - 2 && a[i][0] === "-"; i++) { if (a[i] === "-nocase") nocase = true; else if (a[i] === "-all") all = true; else if (a[i] === "-inline") inline = true; else if (a[i] === "--") { i++; break; } }
      var re = jsRegExp(a[i], (nocase ? "i" : "") + (all ? "g" : "")), str = a[i + 1], vars = a.slice(i + 2);
      if (all) {
        var ms = str.match(re);
        if (inline) return formatList(ms || []);
        if (vars[0]) this.setVar(vars[0], ms ? ms[0] : "");
        return String(ms ? ms.length : 0);
      }
      var m = re.exec(str);
      if (inline) return m ? formatList(Array.from(m, function (x) { return x === undefined ? "" : x; })) : "";
      if (!m) return "0";
      for (var k = 0; k < vars.length; k++) this.setVar(vars[k], m[k] === undefined ? "" : m[k]);
      return "1";
    });
    def("regsub", function (a) {
      var i = 1, nocase = false, all = false;
      for (; i < a.length - 3 && a[i][0] === "-"; i++) { if (a[i] === "-nocase") nocase = true; else if (a[i] === "-all") all = true; else if (a[i] === "--") { i++; break; } }
      var re = jsRegExp(a[i], (nocase ? "i" : "") + (all ? "g" : "")), str = a[i + 1], spec = a[i + 2], vname = a[i + 3], count = 0;
      var out = str.replace(re, function () {
        count++;
        var m = Array.prototype.slice.call(arguments, 0, -2).filter(function (x) { return typeof x === "string" || x === undefined; });
        return spec.replace(/\\(\d)|&|\\&/g, function (t, d) { return t === "&" ? m[0] : t === "\\&" ? "&" : (m[+d] === undefined ? "" : m[+d]); });
      });
      if (vname) { this.setVar(vname, out); return String(count); }
      return out;
    });
    def("switch", function (a) {
      var i = 1, mode = "exact", nocase = false;
      for (; i < a.length - 1 && a[i][0] === "-"; i++) { if (a[i] === "-glob") mode = "glob"; else if (a[i] === "-regexp") mode = "regexp"; else if (a[i] === "-exact") mode = "exact"; else if (a[i] === "-nocase") nocase = true; else if (a[i] === "--") { i++; break; } }
      var str = a[i++], rest = a.slice(i);
      if (rest.length === 1) rest = parseList(rest[0]);
      if (rest.length % 2) throw err("extra switch pattern with no body");
      for (var k = 0; k < rest.length; k += 2) {
        var pat = rest[k], hit = k === rest.length - 2 && pat === "default";
        if (!hit) hit = mode === "exact" ? (nocase ? str.toLowerCase() === pat.toLowerCase() : str === pat) : mode === "glob" ? globToRegExp(pat, nocase).test(str) : jsRegExp(pat, nocase ? "i" : "").test(str);
        if (hit) { var j = k + 1; while (rest[j] === "-" && j + 2 < rest.length) j += 2; return this.eval(rest[j]); }
      }
      return "";
    });

    /* arrays and dicts */
    def("array", function (a) {
      need(a, 2, -1, "option arrayName ?arg ...?");
      var v = this.varObj(a[2], false), sub = a[1];
      if (sub === "exists") return v && v.a ? "1" : "0";
      if (sub === "set") { var l = parseList(a[3]); for (var i = 0; i + 1 < l.length; i += 2) this.setVar(a[2] + "(" + l[i] + ")", l[i + 1]); return ""; }
      if (!v || !v.a) { if (sub === "size") return "0"; if (sub === "names" || sub === "get") return ""; throw err('"' + a[2] + '" isn\'t an array'); }
      if (sub === "size") return String(v.a.size);
      if (sub === "names") { var names = Array.from(v.a.keys()); if (a[3]) { var re = globToRegExp(a[3]); names = names.filter(function (x) { return re.test(x); }); } return formatList(names); }
      if (sub === "get") { var out = []; v.a.forEach(function (val, k) { out.push(k, val); }); return formatList(out); }
      if (sub === "unset") { delete this.frameFor(a[2]).vars[a[2].replace(/^::/, "")]; return ""; }
      throw err('unknown or ambiguous subcommand "' + sub + '": must be exists, get, names, set, size, or unset');
    });
    def("dict", function (a) {
      need(a, 1, -1, "subcommand ?arg ...?");
      var sub = a[1], self = this;
      function getPath(d, keys) { var cur = d; for (var i = 0; i < keys.length; i++) { var m = dictFrom(cur); if (!m.has(keys[i])) throw err('key "' + keys[i] + '" not known in dictionary'); cur = m.get(keys[i]); } return cur; }
      function setPath(d, keys, val) { var m = dictFrom(d); if (keys.length === 1) m.set(keys[0], val); else m.set(keys[0], setPath(m.has(keys[0]) ? m.get(keys[0]) : "", keys.slice(1), val)); return dictTo(m); }
      if (sub === "create") return dictTo(dictFrom(formatList(a.slice(2))));
      if (sub === "get") { return a.length > 3 ? getPath(a[2], a.slice(3)) : a[2]; }
      if (sub === "exists") { try { getPath(a[2], a.slice(3)); return "1"; } catch (e) { return "0"; } }
      if (sub === "keys") return formatList(Array.from(dictFrom(a[2]).keys()));
      if (sub === "values") return formatList(Array.from(dictFrom(a[2]).values()));
      if (sub === "size") return String(dictFrom(a[2]).size);
      if (sub === "set") { var cur = this.hasVar(a[2]) ? this.getVar(a[2]) : ""; return this.setVar(a[2], setPath(cur, a.slice(3, -1), a[a.length - 1])); }
      if (sub === "unset") { var m = dictFrom(this.getVar(a[2])); m.delete(a[3]); return this.setVar(a[2], dictTo(m)); }
      if (sub === "remove") { var m2 = dictFrom(a[2]); a.slice(3).forEach(function (k) { m2.delete(k); }); return dictTo(m2); }
      if (sub === "merge") { var out = new Map(); a.slice(2).forEach(function (d) { dictFrom(d).forEach(function (v, k) { out.set(k, v); }); }); return dictTo(out); }
      if (sub === "for") {
        var kv = parseList(a[2]), dm = dictFrom(a[3]), keys = Array.from(dm.keys());
        for (var i = 0; i < keys.length; i++) { self.setVar(kv[0], keys[i]); self.setVar(kv[1], dm.get(keys[i])); if (loopBody(self, a[4]) === "break") break; }
        return "";
      }
      throw err('unknown or ambiguous subcommand "' + sub + '": must be create, exists, for, get, keys, merge, remove, set, size, unset, or values');
    });

    /* info, clock, time, after */
    def("info", function (a) {
      var sub = a[1], self = this, names;
      if (sub === "exists") return this.hasVar(a[2]) ? "1" : "0";
      if (sub === "commands" || sub === "procs") { names = Object.keys(this.cmds); if (sub === "procs") names = names.filter(function (n) { return self.cmds[n].isProc; }); if (a[2]) { var re = globToRegExp(a[2]); names = names.filter(function (n) { return re.test(n); }); } return formatList(names); }
      if (sub === "vars" || sub === "globals" || sub === "locals") { var fr = sub === "globals" ? this.globals : this.frame; names = Object.keys(fr.vars); if (a[2]) { var re2 = globToRegExp(a[2]); names = names.filter(function (n) { return re2.test(n); }); } return formatList(names); }
      if (sub === "level") { var d = 0, f = this.frame; while (f.up) { d++; f = f.up; } return String(d); }
      if (sub === "tclversion") return "8.6";
      if (sub === "patchlevel") return "8.6.0-mini";
      if (sub === "hostname") return "home";
      throw err('unknown or ambiguous subcommand "' + sub + '": must be commands, exists, globals, hostname, level, locals, patchlevel, procs, tclversion, or vars');
    });
    def("clock", function (a) {
      var sub = a[1];
      if (sub === "seconds") return String(Math.floor(Date.now() / 1000));
      if (sub === "milliseconds") return String(Date.now());
      if (sub === "microseconds") return String(Date.now() * 1000);
      if (sub === "format") {
        var d = new Date(Number(a[2]) * 1000), fmt = "%a %b %d %H:%M:%S %Y", p2 = function (n) { return String(n).padStart(2, "0"); };
        for (var i = 3; i < a.length - 1; i++) if (a[i] === "-format") fmt = a[i + 1];
        var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], mons = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return fmt.replace(/%([YmdHMSaAbBjyeIpZ%])/g, function (t, c) {
          return c === "Y" ? d.getFullYear() : c === "m" ? p2(d.getMonth() + 1) : c === "d" ? p2(d.getDate()) : c === "e" ? String(d.getDate()).padStart(2, " ") : c === "H" ? p2(d.getHours()) : c === "M" ? p2(d.getMinutes()) : c === "S" ? p2(d.getSeconds())
            : c === "a" ? days[d.getDay()] : c === "b" ? mons[d.getMonth()] : c === "y" ? p2(d.getFullYear() % 100) : c === "I" ? p2(d.getHours() % 12 || 12) : c === "p" ? (d.getHours() < 12 ? "AM" : "PM") : c === "%" ? "%" : t;
        });
      }
      throw err('unknown or ambiguous subcommand "' + sub + '": must be format, microseconds, milliseconds, or seconds');
    });
    def("time", function (a) {
      var n = a[2] ? parseInt(a[2], 10) : 1, t0 = performance.now();
      for (var i = 0; i < n; i++) this.eval(a[1]);
      return Math.round((performance.now() - t0) * 1000 / n) + " microseconds per iteration";
    });
    def("after", function (a) {
      var self = this;
      if (a[1] === "cancel") { if (this.host.cancel) this.host.cancel(a[2]); return ""; }
      if (!/^\d+$/.test(a[1]) && a[1] !== "idle") throw err('bad argument "' + a[1] + '": must be cancel, idle, or a number');
      if (a.length < 3) return "";
      var script = a.slice(2).join(" ");
      if (!this.host.after) return "";
      return this.host.after(a[1] === "idle" ? 0 : parseInt(a[1], 10), function () { self.callback(script); });
    });
    def("vwait", function () { throw err("vwait is not supported in this little Tcl"); });
    def("tkwait", function () { throw err("tkwait is not supported in this little Tcl"); });

    I.globals.vars.tcl_version = { v: "8.6", a: null, w: null };
    I.globals.vars.tcl_patchLevel = { v: "8.6.0-mini", a: null, w: null };
  }

  /* run a script from a timer / event: errors go to the host */
  P.callback = function (script) {
    var wasRunning = this.running;
    try { this.run(script); }
    catch (e) { if (e instanceof Exit) { if (this.host.exit) this.host.exit(e.code); } else if (this.host.error) this.host.error(e && e.tclError ? e.message : String(e)); }
    finally { this.running = wasRunning; }
  };

  /* ---------- a toy Tk ----------
     The widgets are plain DOM elements inside a small window that the page provides
     (host.tkWindow()). Pack and grid are approximated with flexbox and CSS grid. */
  P.loadTk = function () { if (!this.tk) installTk(this); return ""; };

  function installTk(I) {
    var host = I.host;
    if (!host.tkWindow) throw err("Tk is not available here");
    var win = host.tkWindow();
    var tk = I.tk = { win: win, W: Object.create(null), cmds: [], closed: false };
    var W = tk.W;
    function def(name, fn) { I.cmds[name] = fn; tk.cmds.push(name); }
    function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
    function runCmd(script) { if (script) I.inFrame(I.globals, function () { I.callback(script); }); }
    function pxv(v) { var m = /^\s*\{?\s*(-?[\d.]+)/.exec(String(v)); return m ? parseFloat(m[1]) : 0; }
    function color(c) { var m = /^gr[ae]y(\d+)$/i.exec(c); if (m) { var v = Math.round(255 * Math.min(100, +m[1]) / 100); return "rgb(" + v + "," + v + "," + v + ")"; } return c; }

    var root = { path: ".", type: "toplevel", parent: null, kids: [], order: [], opts: {}, geom: null, binds: {}, el: win.content, inner: win.content, doms: {} };
    W["."] = root;

    /* ---- options ---- */
    var ALIAS = { "-bg": "-background", "-fg": "-foreground", "-bd": "-borderwidth", "-textvar": "-textvariable" };
    function configure(w, args, creating) {
      if (args.length % 2) throw err('value for "' + args[args.length - 1] + '" missing');
      for (var i = 0; i < args.length; i += 2) {
        var o = ALIAS[args[i]] || args[i];
        if (o[0] !== "-") throw err('unknown option "' + args[i] + '"');
        w.opts[o] = args[i + 1];
        apply(w, o, args[i + 1]);
      }
      if (!creating && w.type === "canvas") redraw(w);
    }
    function parseFont(v) {
      var l = parseList(v), fam = l[0] || "", size = l[1], st = {};
      if (/^-/.test(fam)) return st;
      if (fam) st.fontFamily = fam === "Courier" ? "Courier, monospace" : fam + ", sans-serif";
      if (size) st.fontSize = +size < 0 ? (-size) + "px" : size + "pt";
      if (l.indexOf("bold") >= 0) st.fontWeight = "bold";
      if (l.indexOf("italic") >= 0) st.fontStyle = "italic";
      return st;
    }
    function bindVar(w, name, fn) { if (!name) return; if (I.hasVar(name)) fn(I.getVar(name)); I.watchVar(name, fn); }
    function apply(w, o, v) {
      var e = w.el, st = e.style, t = w.type;
      switch (o) {
        case "-background": st.background = color(v); break;
        case "-foreground": st.color = color(v); break;
        case "-font": var f = parseFont(v); for (var k in f) st[k] = f[k]; break;
        case "-relief": e.dataset.relief = v; break;
        case "-borderwidth": st.borderWidth = pxv(v) + "px"; break;
        case "-padx": if (t === "label" || t === "button") { st.paddingLeft = st.paddingRight = pxv(v) + "px"; } break;
        case "-pady": if (t === "label" || t === "button") { st.paddingTop = st.paddingBottom = pxv(v) + "px"; } break;
        case "-anchor": if (t === "label" || t === "button") st.textAlign = /w/.test(v) ? "left" : /e/.test(v) ? "right" : "center"; break;
        case "-justify": st.textAlign = v; break;
        case "-state": if (e.disabled !== undefined) e.disabled = v === "disabled"; e.dataset.state = v; if (w.chk) w.chk.disabled = v === "disabled"; break;
        case "-width":
          if (t === "canvas" || t === "frame" || t === "labelframe") { st.width = pxv(v) + "px"; if (t === "canvas") { e.width = pxv(v); redraw(w); } }
          else if (t === "scale") w.rng.style.width = pxv(v) + "px";
          else st.minWidth = pxv(v) + "ch";
          break;
        case "-height":
          if (t === "canvas") { e.height = pxv(v); st.height = pxv(v) + "px"; redraw(w); }
          else if (t === "frame" || t === "labelframe") st.height = pxv(v) + "px";
          break;
        case "-text":
          if (t === "labelframe") w.legend.textContent = v;
          else if (w.txt) w.txt.textContent = v;
          else if (t === "label" || t === "button") e.textContent = v;
          break;
        case "-textvariable":
          if (t === "entry") { bindVar(w, v, function (x) { if (e.value !== x) e.value = x; }); if (!w.tvHooked) { w.tvHooked = true; e.addEventListener("input", function () { I.setVar(w.opts["-textvariable"], e.value); }); } }
          else bindVar(w, v, function (x) { if (w.txt) w.txt.textContent = x; else e.textContent = x; });
          break;
        case "-show": if (t === "entry") e.type = v ? "password" : "text"; break;
        case "-variable":
          if (t === "checkbutton") bindVar(w, v, function (x) { w.chk.checked = x === (w.opts["-onvalue"] || "1"); });
          else if (t === "radiobutton") bindVar(w, v, function (x) { w.chk.checked = x === (w.opts["-value"] || ""); });
          else if (t === "scale") bindVar(w, v, function (x) { if (String(w.rng.value) !== x) { w.rng.value = x; w.val.textContent = x; } });
          break;
        case "-from": if (t === "scale") w.rng.min = v; break;
        case "-to": if (t === "scale") w.rng.max = v; break;
        case "-resolution": if (t === "scale") w.rng.step = v; break;
        case "-orient": if (t === "scale") { w.rng.className = v === "vertical" ? "vert" : ""; } break;
        case "-length": if (t === "scale") w.rng.style.width = pxv(v) + "px"; break;
        case "-cursor": case "-takefocus": case "-highlightthickness": case "-command": case "-onvalue": case "-offvalue": case "-value": case "-image": case "-selectbackground": case "-tags": break;
      }
    }

    /* ---- widgets ---- */
    function newWidget(type, argv) {
      var path = argv[1];
      if (!path || path[0] !== ".") throw err('bad window path name "' + path + '"');
      var cut = path.lastIndexOf("."), pp = cut === 0 ? "." : path.slice(0, cut), parent = W[pp];
      if (!parent) throw err('bad window path name "' + path + '"');
      if (W[path]) throw err('window name "' + path.slice(cut + 1) + '" already exists in parent');
      var w = { path: path, type: type, parent: parent, kids: [], order: [], opts: {}, geom: null, binds: {}, doms: {} };
      var e;
      if (type === "label" || type === "message") { e = el("div", "tk-label"); w.type = "label"; }
      else if (type === "button") { e = el("button", "tk-button"); e.type = "button"; e.addEventListener("click", function () { if (!e.disabled) runCmd(w.opts["-command"]); }); }
      else if (type === "entry") { e = el("input", "tk-entry"); e.type = "text"; e.size = 20; }
      else if (type === "checkbutton" || type === "radiobutton") {
        e = el("label", "tk-check"); w.chk = el("input"); w.chk.type = type === "checkbutton" ? "checkbox" : "radio"; w.txt = el("span");
        e.appendChild(w.chk); e.appendChild(w.txt);
        w.chk.addEventListener("change", function () {
          var v = type === "checkbutton" ? (w.chk.checked ? (w.opts["-onvalue"] || "1") : (w.opts["-offvalue"] || "0")) : (w.opts["-value"] || "");
          if (w.opts["-variable"]) I.setVar(w.opts["-variable"], v);
          runCmd(w.opts["-command"]);
        });
      }
      else if (type === "scale") {
        e = el("div", "tk-scale"); w.rng = el("input"); w.rng.type = "range"; w.rng.min = 0; w.rng.max = 100; w.val = el("span"); w.val.textContent = "0";
        e.appendChild(w.rng); e.appendChild(w.val);
        w.rng.addEventListener("input", function () { w.val.textContent = w.rng.value; if (w.opts["-variable"]) I.setVar(w.opts["-variable"], w.rng.value); runCmd((w.opts["-command"] || "") && w.opts["-command"] + " " + w.rng.value); });
      }
      else if (type === "frame") e = el("div", "tk-frame");
      else if (type === "labelframe") { e = el("fieldset", "tk-labelframe"); w.legend = el("legend"); e.appendChild(w.legend); }
      else if (type === "canvas") { e = el("canvas", "tk-canvas"); e.width = 200; e.height = 150; w.items = []; w.nextId = 1; w.ctx = e.getContext("2d"); if (window.ResizeObserver) new ResizeObserver(function () { if (e.offsetWidth && (e.offsetWidth !== e.width || e.offsetHeight !== e.height) && w.opts["-width"] === undefined || (w.stretch && e.offsetWidth)) { e.width = e.offsetWidth; e.height = e.offsetHeight; redraw(w); } }).observe(e); }
      else throw err("unsupported widget type " + type);
      w.el = e; w.inner = e;
      parent.kids.push(w); W[path] = w;
      I.cmds[path] = function (a) { return widgetCmd(w, a); };
      tk.cmds.push(path);
      configure(w, argv.slice(2), true);
      return path;
    }
    ["label", "message", "button", "entry", "checkbutton", "radiobutton", "scale", "frame", "labelframe", "canvas"].forEach(function (t) {
      def(t, function (a) { if (a.length < 2) throw wrongArgs(t, "pathName ?-option value ...?"); return newWidget(t, a); });
    });
    ["toplevel", "listbox", "text", "menu", "spinbox", "panedwindow", "ttk::button", "ttk::label", "ttk::entry"].forEach(function (t) {
      if (/^ttk::/.test(t)) def(t, function (a) { return newWidget(t.slice(5), a); });
      else def(t, function () { throw err(t + " is not implemented in this toy Tk"); });
    });

    function getW(path) { var w = W[path]; if (!w) throw err('bad window path name "' + path + '"'); return w; }
    function widgetCmd(w, a) {
      var sub = a[1], t = w.type;
      if (sub === "configure" || sub === "config") {
        if (a.length === 2) return formatList(Object.keys(w.opts));
        if (a.length === 3) { var o = ALIAS[a[2]] || a[2]; return w.opts[o] === undefined ? "" : w.opts[o]; }
        configure(w, a.slice(2)); return "";
      }
      if (sub === "cget") { var o2 = ALIAS[a[2]] || a[2]; if (w.opts[o2] === undefined) throw err('unknown option "' + a[2] + '"'); return w.opts[o2]; }
      if (t === "button" && sub === "invoke") { runCmd(w.opts["-command"]); return ""; }
      if (t === "button" && (sub === "flash")) return "";
      if (t === "entry") {
        if (sub === "get") return w.el.value;
        if (sub === "insert") { var v = w.el.value, ix = a[2] === "end" ? v.length : Math.max(0, +a[2]); w.el.value = v.slice(0, ix) + a[3] + v.slice(ix); syncEntry(w); return ""; }
        if (sub === "delete") { var v2 = w.el.value, f = a[2] === "end" ? v2.length : +a[2], l = a[3] === undefined ? f + 1 : (a[3] === "end" ? v2.length : +a[3]); w.el.value = v2.slice(0, f) + v2.slice(l); syncEntry(w); return ""; }
        if (sub === "icursor" || sub === "selection" || sub === "xview") return "";
      }
      if ((t === "checkbutton" || t === "radiobutton") && /^(invoke|select|deselect|toggle)$/.test(sub)) {
        if (sub === "invoke" || sub === "toggle") w.chk.checked = t === "radiobutton" ? true : !w.chk.checked;
        else w.chk.checked = sub === "select";
        w.chk.dispatchEvent(new Event("change"));
        return "";
      }
      if (t === "scale") {
        if (sub === "get") return String(w.rng.value);
        if (sub === "set") { w.rng.value = a[2]; w.val.textContent = w.rng.value; if (w.opts["-variable"]) I.setVar(w.opts["-variable"], w.rng.value); return ""; }
      }
      if (t === "canvas") return canvasCmd(w, a);
      throw err('bad option "' + sub + '"');
    }
    function syncEntry(w) { if (w.opts["-textvariable"]) I.setVar(w.opts["-textvariable"], w.el.value); }

    /* ---- canvas ---- */
    function itemsFor(w, spec) {
      if (spec === "all") return w.items;
      return w.items.filter(function (it) { return String(it.id) === spec || it.tags.indexOf(spec) >= 0; });
    }
    function drawItem(w, it) {
      var c = w.ctx, o = it.opts, co = it.coords;
      c.save();
      c.lineWidth = o.width ? +o.width : 1;
      c.strokeStyle = color(o.outline || (it.type === "line" ? o.fill : "") || "black");
      c.fillStyle = color(o.fill || "");
      if (it.type === "line") {
        c.strokeStyle = color(o.fill || "black"); c.lineCap = "round"; c.beginPath();
        for (var i = 0; i + 1 < co.length; i += 2) i ? c.lineTo(co[i], co[i + 1]) : c.moveTo(co[i], co[i + 1]);
        c.stroke();
      } else if (it.type === "rectangle") {
        if (o.fill) c.fillRect(co[0], co[1], co[2] - co[0], co[3] - co[1]);
        if (o.outline !== "") c.strokeRect(co[0], co[1], co[2] - co[0], co[3] - co[1]);
      } else if (it.type === "oval") {
        c.beginPath(); c.ellipse((co[0] + co[2]) / 2, (co[1] + co[3]) / 2, Math.abs(co[2] - co[0]) / 2, Math.abs(co[3] - co[1]) / 2, 0, 0, 2 * Math.PI);
        if (o.fill) c.fill();
        if (o.outline !== "") c.stroke();
      } else if (it.type === "polygon") {
        c.beginPath();
        for (var j = 0; j + 1 < co.length; j += 2) j ? c.lineTo(co[j], co[j + 1]) : c.moveTo(co[j], co[j + 1]);
        c.closePath(); if (o.fill) c.fill(); if (o.outline) c.stroke();
      } else if (it.type === "text") {
        var f = parseFont(o.font || ""); c.fillStyle = color(o.fill || "black");
        c.font = (f.fontWeight || "") + " " + (f.fontSize || "11pt") + " " + (f.fontFamily || "sans-serif");
        c.textAlign = /w/.test(o.anchor || "") ? "left" : /e/.test(o.anchor || "") ? "right" : "center"; c.textBaseline = /n/.test(o.anchor || "") ? "top" : /s/.test(o.anchor || "") ? "bottom" : "middle";
        c.fillText(o.text || "", co[0], co[1]);
      }
      c.restore();
    }
    function redraw(w) {
      if (!w.ctx) return;
      w.ctx.clearRect(0, 0, w.el.width, w.el.height);
      var bg = w.opts["-background"]; if (bg) { w.ctx.fillStyle = color(bg); w.ctx.fillRect(0, 0, w.el.width, w.el.height); }
      w.items.forEach(function (it) { drawItem(w, it); });
    }
    function canvasCmd(w, a) {
      var sub = a[1], i;
      if (sub === "create") {
        var type = a[2], n = 0;
        if (!/^(line|rectangle|oval|text|polygon)$/.test(type)) throw err('unknown or ambiguous item type "' + type + '"');
        var coords = [];
        for (i = 3; i < a.length && !/^-[A-Za-z]/.test(a[i]); i++) coords.push(parseFloat(a[i]));
        var it = { id: w.nextId++, type: type, coords: coords, opts: {}, tags: [] };
        for (; i + 1 < a.length; i += 2) { var o = a[i].slice(1); if (o === "tags") it.tags = parseList(a[i + 1]); else it.opts[o] = a[i + 1]; }
        w.items.push(it); drawItem(w, it);
        return String(it.id);
      }
      if (sub === "delete") { for (i = 2; i < a.length; i++) { var del = itemsFor(w, a[i]); w.items = w.items.filter(function (x) { return del.indexOf(x) < 0; }); } redraw(w); return ""; }
      if (sub === "move") { var dx = parseFloat(a[3]), dy = parseFloat(a[4]); itemsFor(w, a[2]).forEach(function (it) { for (var k = 0; k + 1 < it.coords.length; k += 2) { it.coords[k] += dx; it.coords[k + 1] += dy; } }); redraw(w); return ""; }
      if (sub === "coords") { var items = itemsFor(w, a[2]); if (!items.length) return ""; if (a.length === 3) return items[0].coords.join(" "); items[0].coords = a.slice(3).map(parseFloat); redraw(w); return ""; }
      if (sub === "itemconfigure" || sub === "itemconfig") { itemsFor(w, a[2]).forEach(function (it) { for (var k = 3; k + 1 < a.length; k += 2) { if (a[k] === "-tags") it.tags = parseList(a[k + 1]); else it.opts[a[k].slice(1)] = a[k + 1]; } }); redraw(w); return ""; }
      if (sub === "find") return formatList(itemsFor(w, a[2] === "withtag" ? a[3] : "all").map(function (x) { return String(x.id); }));
      throw err('bad option "' + sub + '": must be create, delete, move, coords, itemconfigure, or find');
    }

    /* ---- geometry: pack and grid ---- */
    function lenv(v) { return pxv(v) + "px"; }
    function relayout(parent) {
      var c = parent.inner, kids = parent.order.filter(function (k) { return k.geom && W[k.path]; });
      while (c.firstChild) c.removeChild(c.firstChild);
      if (parent.legend) c.appendChild(parent.legend);
      c.style.display = ""; c.style.gridTemplateColumns = ""; c.style.gridTemplateRows = "";
      if (!kids.length) return;
      if (kids.some(function (k) { return k.geom.mgr === "grid"; })) {
        c.style.display = "grid";
        var maxC = 0, maxR = 0;
        kids.forEach(function (k) { var g = k.geom; maxC = Math.max(maxC, g.col + g.cs); maxR = Math.max(maxR, g.row + g.rs); });
        var cols = [], rows = [], i;
        for (i = 0; i < maxC; i++) cols.push((parent.colW && parent.colW[i] > 0) ? "minmax(0," + parent.colW[i] + "fr)" : "auto");
        for (i = 0; i < maxR; i++) rows.push((parent.rowW && parent.rowW[i] > 0) ? "minmax(0," + parent.rowW[i] + "fr)" : "auto");
        c.style.gridTemplateColumns = cols.join(" "); c.style.gridTemplateRows = rows.join(" ");
        kids.forEach(function (k) {
          var g = k.geom, s = k.el.style, st = g.sticky || "";
          s.gridColumn = (g.col + 1) + " / span " + g.cs; s.gridRow = (g.row + 1) + " / span " + g.rs;
          s.justifySelf = /e/.test(st) && /w/.test(st) ? "stretch" : /w/.test(st) ? "start" : /e/.test(st) ? "end" : "center";
          s.alignSelf = /n/.test(st) && /s/.test(st) ? "stretch" : /n/.test(st) ? "start" : /s/.test(st) ? "end" : "center";
          s.margin = lenv(g.pady) + " " + lenv(g.padx); s.flex = ""; c.appendChild(k.el);
        });
        return;
      }
      var col = !(kids[0].geom.side === "left" || kids[0].geom.side === "right");
      c.style.display = "flex"; c.style.flexDirection = col ? "column" : "row"; c.style.alignItems = "";
      var later = col ? "bottom" : "right";
      var first = kids.filter(function (k) { return k.geom.side !== later; }), last = kids.filter(function (k) { return k.geom.side === later; }).reverse();
      first.concat(last).forEach(function (k) {
        var g = k.geom, s = k.el.style, anchor = g.anchor || "center";
        s.gridColumn = s.gridRow = s.justifySelf = ""; s.margin = lenv(g.pady) + " " + lenv(g.padx);
        s.flex = g.expand ? "1 1 auto" : "0 0 auto";
        var cross = col ? (g.fill === "x" || g.fill === "both") : (g.fill === "y" || g.fill === "both");
        s.alignSelf = cross ? "stretch" : col ? (/w/.test(anchor) ? "flex-start" : /e/.test(anchor) ? "flex-end" : "center") : (/n/.test(anchor) ? "flex-start" : /s/.test(anchor) ? "flex-end" : "center");
        if (k === last[0]) { if (col) s.marginTop = "auto"; else s.marginLeft = "auto"; }
        if (k.type === "canvas" && g.expand && g.fill === "both") k.stretch = true;
        c.appendChild(k.el);
      });
    }
    function optsOf(args, from) {
      var o = {};
      for (var i = from; i + 1 < args.length; i += 2) o[args[i].replace(/^-/, "")] = args[i + 1];
      return o;
    }
    function splitWidgets(a, from) {
      var i = from, ws = [];
      while (i < a.length && a[i][0] === ".") ws.push(getW(a[i++]));
      return { ws: ws, next: i };
    }
    function place(w, geom) {
      var p = w.parent;
      w.geom = geom;
      if (p.order.indexOf(w) < 0) p.order.push(w);
      relayout(p);
    }
    def("pack", function (a) {
      if (a[1] === "forget") { a.slice(2).forEach(function (pth) { var w = getW(pth); w.geom = null; relayout(w.parent); }); return ""; }
      if (a[1] === "propagate" || a[1] === "slaves") return "";
      var r = splitWidgets(a, 1);
      if (!r.ws.length) throw wrongArgs("pack", "window ?window ...? ?options?");
      var o = optsOf(a, r.next);
      r.ws.forEach(function (w) {
        place(w, { mgr: "pack", side: o.side || "top", fill: o.fill || "none", expand: o.expand === "1" || o.expand === "true" || o.expand === "yes", padx: o.padx || "0", pady: o.pady || "0", anchor: o.anchor });
      });
      return "";
    });
    def("grid", function (a) {
      if (a[1] === "columnconfigure" || a[1] === "rowconfigure") {
        var p = getW(a[2]), o = optsOf(a, 4), key = a[1] === "columnconfigure" ? "colW" : "rowW";
        (p[key] = p[key] || [])[parseInt(a[3], 10)] = parseFloat(o.weight || 0);
        relayout(p); return "";
      }
      if (a[1] === "forget") { a.slice(2).forEach(function (pth) { var w = getW(pth); w.geom = null; relayout(w.parent); }); return ""; }
      var r = splitWidgets(a, 1);
      if (!r.ws.length) throw wrongArgs("grid", "window ?window ...? ?options?");
      var o2 = optsOf(a, r.next), row = o2.row !== undefined ? parseInt(o2.row, 10) : 0, col = o2.column !== undefined ? parseInt(o2.column, 10) : 0;
      r.ws.forEach(function (w, i) {
        place(w, { mgr: "grid", row: row, col: col + i, rs: parseInt(o2.rowspan || 1, 10), cs: parseInt(o2.columnspan || 1, 10), sticky: o2.sticky || "", padx: o2.padx || "0", pady: o2.pady || "0" });
      });
      return "";
    });
    def("place", function () { throw err("place is not implemented in this toy Tk"); });

    /* ---- wm, bind, focus, winfo, destroy ---- */
    def("wm", function (a) {
      var sub = a[1];
      if (sub === "title") { if (a.length > 3) win.setTitle(a[3]); return a.length > 3 ? "" : (win.title || ""); }
      if (sub === "geometry") { var m = /^(\d+)x(\d+)/.exec(a[3] || ""); if (m) win.setSize(+m[1], +m[2]); return ""; }
      return "";
    });
    var KEYS = { " ": "space", Enter: "Return", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Escape: "Escape", Backspace: "BackSpace", Tab: "Tab" };
    var EV = { "Button-1": "pointerdown", "ButtonPress-1": "pointerdown", "1": "pointerdown", "ButtonRelease-1": "pointerup", "B1-Motion": "pointermove", "Motion": "pointermove", "Enter": "pointerenter", "Leave": "pointerleave", "Double-Button-1": "dblclick", "Double-1": "dblclick" };
    function evKind(seq) {
      var m = /^<(.*)>$/.exec(seq);
      if (!m) throw err('bad event type or keysym "' + seq + '"');
      var name = m[1];
      if (EV[name]) return { dom: EV[name], name: name };
      var km = /^(?:Key(?:Press)?-)?(.+)$/.exec(name);
      if (name === "Key" || name === "KeyPress") return { dom: "keydown", name: name, key: null };
      if (/^(Return|Escape|space|Up|Down|Left|Right|Tab|BackSpace)$/.test(name) || /^Key(?:Press)?-./.test(name) || /^[A-Za-z0-9]$/.test(name)) return { dom: "keydown", name: name, key: km[1] };
      throw err('bad event type or keysym "' + name + '"');
    }
    function fire(w, ev, kind, e) {
      var scripts = w.binds[kind.name]; if (!scripts) return;
      var rect = w.el.getBoundingClientRect(), k = KEYS[e.key] || e.key || "";
      var sub = scripts.replace(/%([xyXYWKAb%])/g, function (t, c) {
        return c === "x" ? Math.round(e.clientX - rect.left) : c === "y" ? Math.round(e.clientY - rect.top) : c === "X" ? Math.round(e.clientX) : c === "Y" ? Math.round(e.clientY) : c === "W" ? w.path : c === "K" ? k : c === "A" ? (e.key && e.key.length === 1 ? e.key : "") : c === "b" ? (e.button + 1) : "%";
      });
      runCmd(sub);
    }
    def("bind", function (a) {
      var w = getW(a[1]);
      if (a.length === 2) return formatList(Object.keys(w.binds));
      var kind = evKind(a[2]);
      if (a.length === 3) return w.binds[kind.name] || "";
      var script = a[3];
      if (script[0] === "+") script = (w.binds[kind.name] || "") + "\n" + script.slice(1);
      w.binds[kind.name] = script;
      if (!w.doms[kind.name]) {
        w.doms[kind.name] = true;
        if (kind.dom === "keydown") w.el.tabIndex = 0;
        w.el.addEventListener(kind.dom, function (e) {
          if (kind.name === "B1-Motion" && !(e.buttons & 1)) return;
          if (kind.dom === "keydown" && kind.key !== null && kind.key !== undefined && (KEYS[e.key] || e.key) !== kind.key) return;
          if ((kind.name === "Button-1" || kind.name === "ButtonPress-1" || kind.name === "1" || kind.name === "ButtonRelease-1") && e.button !== 0) return;
          fire(w, e, kind, e);
        });
      }
      return "";
    });
    def("focus", function (a) { if (a[1] && W[a[1]]) W[a[1]].el.focus(); return ""; });
    def("winfo", function (a) {
      var sub = a[1];
      if (sub === "exists") return W[a[2]] ? "1" : "0";
      var w = W[a[2]]; if (!w) throw err('bad window path name "' + a[2] + '"');
      if (sub === "width") return String(w.el.offsetWidth);
      if (sub === "height") return String(w.el.offsetHeight);
      if (sub === "children") return formatList(w.kids.map(function (k) { return k.path; }));
      if (sub === "class") return w.type.charAt(0).toUpperCase() + w.type.slice(1);
      if (sub === "parent") return w.parent ? w.parent.path : "";
      return "";
    });
    def("bell", function () { return ""; });
    def("tk_messageBox", function (a) {
      var o = optsOf(a, 1), box = el("div", "tk-modal"), card = el("div", "tk-modal-card"), p = el("div"), b = el("button", "tk-button");
      p.textContent = o.message || ""; b.type = "button"; b.textContent = "OK";
      b.addEventListener("click", function () { box.remove(); });
      card.appendChild(p); card.appendChild(b); box.appendChild(card); win.content.appendChild(box);
      return "ok";
    });
    function destroyWidget(w) {
      w.kids.slice().forEach(destroyWidget);
      delete W[w.path]; delete I.cmds[w.path];
      if (w.el && w.el.parentNode) w.el.parentNode.removeChild(w.el);
      if (w.parent) { w.parent.kids = w.parent.kids.filter(function (k) { return k !== w; }); w.parent.order = w.parent.order.filter(function (k) { return k !== w; }); }
    }
    def("destroy", function (a) {
      for (var i = 1; i < a.length; i++) {
        if (a[i] === ".") { teardown(true); return ""; }
        var w = W[a[i]]; if (w) { var p = w.parent; destroyWidget(w); if (p) relayout(p); }
      }
      return "";
    });
    function teardown(closeWin) {
      if (tk.closed) return;
      tk.closed = true;
      root.kids.slice().forEach(destroyWidget);
      tk.cmds.forEach(function (n) { delete I.cmds[n]; });
      I.tk = null;
      if (host.cancelAll) host.cancelAll();
      if (closeWin) win.close();
      if (host.tkClosed) host.tkClosed();
    }
    win.onclose = function () { teardown(false); };
    I.unloadTk = function () { teardown(true); };
    win.setTitle("wish");
    return tk;
  }

  global.MiniTcl = { Interp: Interp, TclError: TclError, Exit: Exit, Ctl: Ctl, parseList: parseList, formatList: formatList, fmtVal: fmtVal, toNumber: toNumber };
})(typeof window !== "undefined" ? window : globalThis);
