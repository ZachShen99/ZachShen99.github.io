//! Avatar explosion + particle network for the home page.
//!
//! The avatar is sampled into a G x G grid of particles.
//! * Most particles fly apart as a pure function of the scroll progress `t` (0 = intact picture,
//!   1 = gone), so scrolling back and forth scrubs the explosion in both directions.
//! * A few of them ("keepers", ~75) survive: they fly to random spots on the screen and then keep
//!   drifting and bouncing, like particles.js. Two keepers that come close are joined by a line,
//!   and the mouse acts as one more node that links to nearby keepers.
//! Drawing into the RGBA framebuffer happens here too; JavaScript only supplies colours,
//! geometry and the pointer, steps the drift, and blits `fb`.
#![allow(static_mut_refs)]

use std::f32::consts::PI;

const G: usize = 192; // grid size (particles per side)
const N: usize = G * G;
const MAX_W: usize = 2560;
const MAX_H: usize = 1440;
const MAXK: usize = 256; // max keepers
const KEEP: f32 = 0.0026; // fraction of picture particles that survive (~75)
const MARGIN: f32 = 24.0; // keepers stay this far from the screen edge (px)

static mut COL: [u32; N] = [0; N]; // ABGR little-endian == RGBA bytes; alpha 0 = unused cell
static mut UX: [f32; N] = [0.0; N]; // outward direction (unit), jittered
static mut UY: [f32; N] = [0.0; N];
static mut SPD: [f32; N] = [0.0; N]; // how far this particle flies
static mut DLY: [f32; N] = [0.0; N]; // when it lets go (0..0.35 of the scroll)
static mut SWL: [f32; N] = [0.0; N]; // sideways swirl
static mut GRV: [f32; N] = [0.0; N]; // how much it falls
static mut KF: [bool; N] = [false; N]; // is this particle a keeper?
static mut FB: [u32; MAX_W * MAX_H] = [0; MAX_W * MAX_H];

static mut NK: usize = 0;
static mut KI: [u32; MAXK] = [0; MAXK]; // grid index of keeper k
static mut OX: [f32; MAXK] = [0.0; MAXK]; // drift offset from its resting spot
static mut OY: [f32; MAXK] = [0.0; MAXK];
static mut VX: [f32; MAXK] = [0.0; MAXK]; // drift velocity (px per 60 Hz frame, at scale 1)
static mut VY: [f32; MAXK] = [0.0; MAXK];
static mut PX: [f32; MAXK] = [0.0; MAXK]; // position of this frame
static mut PY: [f32; MAXK] = [0.0; MAXK];

fn rnd(i: u32, k: u32) -> f32 {
    let mut h = i.wrapping_mul(2654435761) ^ k.wrapping_mul(0x9E37_79B1);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2c1b_3c6d);
    h ^= h >> 12;
    h = h.wrapping_mul(0x297a_2d39);
    h ^= h >> 15;
    (h & 0xff_ffff) as f32 / 16_777_216.0
}
fn smooth(a: f32, b: f32, x: f32) -> f32 {
    let s = ((x - a) / (b - a)).clamp(0.0, 1.0);
    s * s * (3.0 - 2.0 * s)
}

#[no_mangle]
pub extern "C" fn grid() -> u32 { G as u32 }
#[no_mangle]
pub extern "C" fn max_width() -> u32 { MAX_W as u32 }
#[no_mangle]
pub extern "C" fn max_height() -> u32 { MAX_H as u32 }
#[no_mangle]
pub extern "C" fn colors_ptr() -> *mut u32 { unsafe { COL.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn fb_ptr() -> *const u32 { unsafe { FB.as_ptr() } }

#[no_mangle]
pub extern "C" fn init() {
    let c = (G - 1) as f32 / 2.0;
    unsafe {
        for i in 0..N {
            let ii = i as u32;
            let dx = (i % G) as f32 - c;
            let dy = (i / G) as f32 - c;
            let len = (dx * dx + dy * dy).sqrt();
            let a = if len < 0.5 { rnd(ii, 1) * 6.2832 } else { dy.atan2(dx) };
            let a = a + (rnd(ii, 2) - 0.5) * 1.1; // spread the directions
            UX[i] = a.cos();
            UY[i] = a.sin();
            SPD[i] = 0.2 + 0.8 * rnd(ii, 3) * rnd(ii, 4).sqrt();
            DLY[i] = 0.35 * rnd(ii, 5);
            SWL[i] = (rnd(ii, 6) - 0.5) * 1.4;
            GRV[i] = 0.3 + rnd(ii, 7);
        }
    }
}

/// Pick the keepers. Call after the colours have been copied in. Returns how many there are.
#[no_mangle]
pub extern "C" fn setup() -> u32 {
    unsafe {
        NK = 0;
        for i in 0..N {
            KF[i] = false;
            if COL[i] >> 24 == 0 || NK >= MAXK { continue; }
            if rnd(i as u32, 8) < KEEP {
                KF[i] = true;
                KI[NK] = i as u32;
                let a = rnd(i as u32, 11) * 2.0 * PI;
                let s = 0.22 + 0.4 * rnd(i as u32, 12);
                VX[NK] = a.cos() * s;
                VY[NK] = a.sin() * s;
                OX[NK] = 0.0;
                OY[NK] = 0.0;
                NK += 1;
            }
        }
        NK as u32
    }
}

/// Where keeper `i` finally rests on a `w` x `h` screen.
fn target(i: u32, w: i32, h: i32) -> (f32, f32) {
    (MARGIN + rnd(i, 9) * (w as f32 - 2.0 * MARGIN).max(1.0),
     MARGIN + rnd(i, 10) * (h as f32 - 2.0 * MARGIN).max(1.0))
}

/// Advance the drift of the keepers by `dt` frames (1.0 = one 60 Hz frame). `sc` is the
/// device-pixel scale. Before the explosion has finished (`t < 1`) the drift relaxes back so the
/// keepers rejoin the picture cleanly when you scroll up.
#[no_mangle]
pub extern "C" fn net_step(t: f32, w: i32, h: i32, dt: f32, sc: f32) {
    unsafe {
        for k in 0..NK {
            if t >= 1.0 {
                let (tx, ty) = target(KI[k], w, h);
                OX[k] += VX[k] * dt * sc;
                OY[k] += VY[k] * dt * sc;
                let (x, y) = (tx + OX[k], ty + OY[k]);
                let (maxx, maxy) = (w as f32 - MARGIN, h as f32 - MARGIN);
                if x < MARGIN { OX[k] = MARGIN - tx; VX[k] = VX[k].abs(); }
                else if x > maxx { OX[k] = maxx - tx; VX[k] = -VX[k].abs(); }
                if y < MARGIN { OY[k] = MARGIN - ty; VY[k] = VY[k].abs(); }
                else if y > maxy { OY[k] = maxy - ty; VY[k] = -VY[k].abs(); }
            } else {
                let f = (1.0 - 0.12 * dt).max(0.0);
                OX[k] *= f;
                OY[k] *= f;
            }
        }
    }
}

#[inline]
fn blend(i: usize, r: f32, g: f32, b: f32, a: f32) {
    unsafe {
        let d = FB[i];
        let da = (d >> 24) as f32 / 255.0;
        let oa = a + da * (1.0 - a);
        if oa <= 0.0 { return; }
        let k = da * (1.0 - a);
        let mix = |c: f32, dc: u32| ((c * a + dc as f32 * k) / oa).min(255.0) as u32;
        let (nr, ng, nb) = (mix(r, d & 0xff), mix(g, (d >> 8) & 0xff), mix(b, (d >> 16) & 0xff));
        FB[i] = nr | (ng << 8) | (nb << 16) | (((oa * 255.0) as u32) << 24);
    }
}
#[inline]
fn plot(x: i32, y: i32, w: i32, h: i32, c: (f32, f32, f32), a: f32) {
    if x >= 0 && y >= 0 && x < w && y < h { blend((y * w + x) as usize, c.0, c.1, c.2, a); }
}
fn line(x0: f32, y0: f32, x1: f32, y1: f32, w: i32, h: i32, c: (f32, f32, f32), a: f32, thick: bool) {
    let (dx, dy) = (x1 - x0, y1 - y0);
    let n = dx.abs().max(dy.abs()).ceil() as i32;
    if n == 0 { return; }
    for s in 0..=n {
        let f = s as f32 / n as f32;
        let (x, y) = ((x0 + dx * f).round() as i32, (y0 + dy * f).round() as i32);
        plot(x, y, w, h, c, a);
        if thick { plot(x + 1, y, w, h, c, a); plot(x, y + 1, w, h, c, a); }
    }
}
fn disc(cx: f32, cy: f32, rad: f32, w: i32, h: i32, c: (f32, f32, f32)) {
    let r = rad.ceil() as i32 + 1;
    let (ix, iy) = (cx.round() as i32, cy.round() as i32);
    for yy in -r..=r {
        for xx in -r..=r {
            let d = (((ix + xx) as f32 - cx).powi(2) + ((iy + yy) as f32 - cy).powi(2)).sqrt();
            let a = (rad + 0.5 - d).clamp(0.0, 1.0);
            if a > 0.0 { plot(ix + xx, iy + yy, w, h, c, a); }
        }
    }
}

/// Draw at scroll progress `t` into the first `w * h` pixels of the framebuffer.
/// (`cx`, `cy`) is the avatar's centre and `d` its diameter, `(mx, my)` the pointer (use a very
/// negative value for "none") and `sc` the device-pixel scale; all positions in framebuffer pixels.
#[no_mangle]
pub extern "C" fn render(t: f32, w: i32, h: i32, cx: f32, cy: f32, d: f32, mx: f32, my: f32, sc: f32) {
    let w = w.clamp(1, MAX_W as i32);
    let h = h.clamp(1, MAX_H as i32);
    let sp = d / G as f32;
    let c = (G - 1) as f32 / 2.0;
    let dmax = ((w * w + h * h) as f32).sqrt() * 0.65;
    let bs = ((sp.ceil() as i32) + 1).max(2);
    unsafe {
        FB[..(w * h) as usize].fill(0);

        /* the picture, breaking apart (nothing left of it once t reaches 1) */
        if t < 1.0 {
            for i in 0..N {
                let col = COL[i];
                if col >> 24 == 0 || KF[i] { continue; }
                let dl = DLY[i];
                let u = ((t - dl) / (1.0 - dl)).clamp(0.0, 1.0);
                let e = u * u;
                let tr = e * dmax * SPD[i];
                let hx = cx + ((i % G) as f32 - c) * sp;
                let hy = cy + ((i / G) as f32 - c) * sp;
                let sw = SWL[i] * tr * 0.5;
                let x = hx + UX[i] * tr - UY[i] * sw;
                let y = hy + UY[i] * tr + UX[i] * sw + e * e * dmax * 0.12 * GRV[i];
                let s = ((u - 0.45) / 0.55).clamp(0.0, 1.0);
                let a = 1.0 - s * s * (3.0 - 2.0 * s);
                if a <= 0.01 { continue; }
                let px = (a * 255.0) as u32;
                let col = (col & 0x00ff_ffff) | (px << 24);
                let ix = x.round() as i32 - bs / 2;
                let iy = y.round() as i32 - bs / 2;
                if ix < 0 || iy < 0 || ix + bs > w || iy + bs > h { continue; }
                for yy in 0..bs {
                    let row = ((iy + yy) * w + ix) as usize;
                    for xx in 0..bs as usize { FB[row + xx] = col; }
                }
            }
        }

        /* the keepers: where they are this frame */
        let mut us = [0.0f32; MAXK];
        for k in 0..NK {
            let i = KI[k] as usize;
            let dl = DLY[i];
            let u = ((t - dl) / (1.0 - dl)).clamp(0.0, 1.0);
            let e = 1.0 - (1.0 - u) * (1.0 - u) * (1.0 - u);
            let hx = cx + ((i % G) as f32 - c) * sp;
            let hy = cy + ((i / G) as f32 - c) * sp;
            let (tx, ty) = target(i as u32, w, h);
            let (dx, dy) = (tx - hx, ty - hy);
            let dist = (dx * dx + dy * dy).sqrt().max(1.0);
            let bulge = (PI * e).sin() * SWL[i] * dist * 0.5; // fly along an arc, not a straight line
            PX[k] = hx + dx * e - dy / dist * bulge + OX[k];
            PY[k] = hy + dy * e + dx / dist * bulge + OY[k];
            us[k] = u;
        }

        /* lines between keepers that are close to each other */
        let ramp = smooth(0.1, 0.4, t);
        let link = 110.0 * sc;
        let thick = sc > 1.4;
        if ramp > 0.0 {
            for a in 0..NK {
                for b in (a + 1)..NK {
                    let (dx, dy) = (PX[a] - PX[b], PY[a] - PY[b]);
                    let d2 = dx * dx + dy * dy;
                    if d2 < link * link {
                        let al = (1.0 - d2.sqrt() / link) * 0.6 * ramp;
                        line(PX[a], PY[a], PX[b], PY[b], w, h, (255.0, 122.0, 192.0), al, thick);
                    }
                }
            }
        }

        /* the pointer is a node too: it links to nearby keepers, and joins keepers around it */
        if mx > -1000.0 && ramp > 0.0 {
            let reach = 150.0 * sc;
            let cyan = (0.0, 229.0, 255.0);
            let mut near = [0usize; MAXK];
            let mut nn = 0;
            for k in 0..NK {
                let d = ((PX[k] - mx).powi(2) + (PY[k] - my).powi(2)).sqrt();
                if d < reach {
                    near[nn] = k; nn += 1;
                    line(mx, my, PX[k], PY[k], w, h, cyan, (1.0 - d / reach) * 0.95 * ramp, thick);
                }
            }
            for a in 0..nn {
                for b in (a + 1)..nn {
                    let (ka, kb) = (near[a], near[b]);
                    let (dx, dy) = (PX[ka] - PX[kb], PY[ka] - PY[kb]);
                    let d = (dx * dx + dy * dy).sqrt();
                    if d < link * 1.25 {
                        line(PX[ka], PY[ka], PX[kb], PY[kb], w, h, cyan, (1.0 - d / (link * 1.25)) * 0.6 * ramp, thick);
                    }
                }
            }
        }

        /* the dots themselves: avatar colour at first, then a soft lavender */
        let dot = 1.8 * sc;
        for k in 0..NK {
            let col = COL[KI[k] as usize];
            let s = smooth(0.05, 0.35, us[k]);
            let mixc = |c: u32, to: f32| c as f32 + (to - c as f32) * s;
            let rgb = (mixc(col & 0xff, 214.0), mixc((col >> 8) & 0xff, 206.0), mixc((col >> 16) & 0xff, 255.0));
            let rad = (bs as f32 * 0.5) + (dot - bs as f32 * 0.5) * s;
            disc(PX[k], PY[k], rad.max(0.6), w, h, rgb);
        }
    }
}
