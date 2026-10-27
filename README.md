# ZachShen99.github.io

Zach 的个人主页：<https://zachshen99.github.io/>

整个页面就是一个终端：往下滚，终端会自己敲命令，一幕一幕地讲我是谁、做过什么。也可以自己敲命令，试试 `help`。

## 目录

```
index.html        首页（样式和少量脚本都在里面）
terminal.js       终端：一个手写的小 shell、虚拟文件系统和各种命令
tcl.js            终端里 tclsh / wish 用的迷你 Tcl 解释器和迷你 Tk（用 JavaScript 写的，不是官方 Tcl）
wasm/             头像粒子（炸开、连线）的 Rust 源码，avatar.wasm 是编译产物
vbstools/         VbsTools 的介绍页
fonts/            Mr Dafoe 字体的子集（只含名字里要用的字母），许可见 fonts/OFL.txt
images/           头像、图标、分享预览图、VbsTools 的截图和动图
videos/           VbsTools 的原理动画
404.html          找不到页面时显示的终端风格 404
```

## 本地预览

```sh
python3 -m http.server 8000
# 然后打开 http://127.0.0.1:8000/
```

用文件方式直接打开 `index.html` 会有问题（WASM 和字体需要走 http）。

## 重新编译 WASM

需要 Rust 和 `wasm32-unknown-unknown` 目标：

```sh
rustup target add wasm32-unknown-unknown
cd wasm
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/avatar.wasm .
```

## 说明

- 头像粒子的物理和绘制在 `wasm/src/lib.rs` 里，JS 只负责传参数、把结果画到 canvas 上。
- 迷你 Tcl 只覆盖常用的部分（变量、`proc`、`expr`、控制流、列表、字符串、`regexp`、`array`、`dict`、`catch`、`after` 等），迷你 Tk 支持 `label`、`button`、`entry`、`checkbutton`、`radiobutton`、`scale`、`frame`、`canvas` 以及 `pack` / `grid` / `bind`。`tcl.js` 只在第一次用到 Tcl 命令时才加载。
- 首屏名字的手写动画，是用 SVG 蒙版沿着每一笔的路径逐段显示字体本身。

## 致谢

- 名字用的字体是 [Mr Dafoe](https://fonts.google.com/specimen/Mr+Dafoe)（Alejandro Paul / Sudtipos），采用 SIL Open Font License 1.1，见 [`fonts/OFL.txt`](fonts/OFL.txt)。
