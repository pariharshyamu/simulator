#!/usr/bin/env python3
"""Figures for the course material and handouts.

Standalone SVG, no external fonts, no scripts — so they survive being pasted
into Word, converted to PDF, or rendered on GitHub.

PALETTE. Categorical slots are #1E74C0 / #D96A16 / #0B8F86, in that fixed
order, validated with the dataviz validator against a light surface:
lightness band PASS, chroma floor PASS, CVD separation PASS (worst adjacent
pair ΔE 12.7 protan), normal-vision floor PASS (ΔE 25.3), contrast PASS.
The two cool slots are a small chroma lift on the artefacts' #1F5C8B and
#11707F, which read gray at print size and failed the chroma floor.

Status colours (#A8261E serious, #256B45 good) are reserved for state and are
never used as a series. Every series is direct-labelled as well as being in
the legend, so identity never depends on colour alone.
"""
import os

OUT = os.path.dirname(os.path.abspath(__file__))

C1, C2, C3 = '#1E74C0', '#D96A16', '#0B8F86'      # categorical, fixed order
BAD, GOOD = '#A8261E', '#256B45'                   # status, reserved
INK, INK2, MUT = '#1C2530', '#3A4757', '#6B7A8C'
GRID, LINE, SURF = '#E6EBF0', '#D5DDE5', '#FFFFFF'
F = ('font-family="Segoe UI, Helvetica Neue, Arial, sans-serif"')


def txt(x, y, s, size=12, fill=INK2, anchor='start', weight='400', extra=''):
    s = (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))
    return (f'<text x="{x:.1f}" y="{y:.1f}" {F} font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}" font-weight="{weight}" {extra}>{s}</text>')


def wrap(w, h, body, title, desc):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'width="{w}" height="{h}" role="img" aria-labelledby="t d">'
            f'<title id="t">{title}</title><desc id="d">{desc}</desc>'
            f'<rect width="{w}" height="{h}" fill="{SURF}"/>{body}</svg>')


def save(name, svg):
    open(os.path.join(OUT, name), 'w', encoding='utf-8').write(svg)
    print(f'  {name}  {len(svg)/1024:.1f} KB')


# ════════════════════════════════════════════════════════ 1. residual
def fig_residual():
    """Two series over time. The story is the widening gap, so the gap is
       filled and the two end-points are direct-labelled."""
    W, H = 940, 470
    L, R, T, B = 78, 268, 92, 128
    weeks = [0, 2, 3, 5, 7, 8, 10, 12]
    meas  = [74, 75, 76, 78, 80, 83, 86, 91]
    exp   = [74, 74, 74, 74, 74, 74, 74, 74]
    ymin, ymax = 70, 94
    px = lambda i: L + i * (W - L - R) / (len(weeks) - 1)
    py = lambda v: T + (ymax - v) * (H - T - B) / (ymax - ymin)

    b = [txt(L - 42, 30, 'ID fan drive-end bearing temperature, °C', 14, INK, weight='600')]
    b.append(txt(L - 42, 54, 'Indicative reconstruction of a 210 MW ID fan — the numbers in section 2.2',
                 11.5, MUT))

    for v in range(74, 95, 4):                                  # recessive grid
        b.append(f'<line x1="{L}" y1="{py(v):.1f}" x2="{W-R}" y2="{py(v):.1f}" '
                 f'stroke="{GRID}" stroke-width="1"/>')
        b.append(txt(L - 10, py(v) + 4, str(v), 11, MUT, 'end'))

    # the alarm, as a status rule — not a series
    b.append(f'<line x1="{L}" y1="{py(90):.1f}" x2="{W-R}" y2="{py(90):.1f}" '
             f'stroke="{BAD}" stroke-width="1.5" stroke-dasharray="7 4"/>')
    b.append(txt(W - R - 6, py(90) - 8, 'DCS high alarm  90 °C', 11.5, BAD, 'end', '600'))

    # the residual itself, as the area between
    area = ' '.join(f'{px(i):.1f},{py(v):.1f}' for i, v in enumerate(meas))
    area += ' ' + ' '.join(f'{px(i):.1f},{py(v):.1f}' for i, v in reversed(list(enumerate(exp))))
    b.append(f'<polygon points="{area}" fill="{C2}" fill-opacity="0.13"/>')

    for vals, col, dash in ((exp, C1, '6 4'), (meas, C2, '')):
        pts = ' '.join(f'{px(i):.1f},{py(v):.1f}' for i, v in enumerate(vals))
        b.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2" '
                 f'stroke-linejoin="round" stroke-linecap="round"'
                 + (f' stroke-dasharray="{dash}"' if dash else '') + '/>')
        for i, v in enumerate(vals):
            b.append(f'<circle cx="{px(i):.1f}" cy="{py(v):.1f}" r="4.5" fill="{col}" '
                     f'stroke="{SURF}" stroke-width="2"/>')

    # direct labels at the right end — identity without relying on colour
    b.append(txt(px(7) + 12, py(91) + 4, 'Measured  91 °C', 12, INK, weight='600'))
    b.append(txt(px(7) + 12, py(74) + 4, 'Model expected  74 °C', 12, INK, weight='600'))
    b.append(txt(px(7) + 12, py(74) + 20, 'flat, because load and ambient', 11, MUT))
    b.append(txt(px(7) + 12, py(74) + 34, 'are already removed', 11, MUT))

    # the two moments that matter
    for i, lbl, sub in ((3, 'Week 5', 'residual +4 °C\nthe system alerts\n78 °C — 12 below alarm'),
                        (7, 'Week 10+', 'the alarm finally\noperates')):
        b.append(f'<line x1="{px(i):.1f}" y1="{py(ymax)+6:.1f}" x2="{px(i):.1f}" y2="{H-B+6}" '
                 f'stroke="{LINE}" stroke-width="1" stroke-dasharray="3 3"/>')
        b.append(txt(px(i), H - B + 26, lbl, 12, INK, 'middle', '600'))
        for k, ln in enumerate(sub.split('\n')):
            b.append(txt(px(i), H - B + 42 + k * 14, ln, 10.5, MUT, 'middle'))

    for i, w in enumerate(weeks):
        b.append(txt(px(i), H - B + 4, f'Wk {w}', 11, MUT, 'middle'))
    b.append(f'<line x1="{L}" y1="{H-B-8}" x2="{W-R}" y2="{H-B-8}" stroke="{LINE}" stroke-width="1.5"/>')

    # legend — always present for two or more series
    lx, ly = L - 42, 74                       # legend above the plot, clear of everything
    for col, lbl, dash in ((C2, 'Measured', ''), (C1, 'Model expected', '6 4')):
        b.append(f'<line x1="{lx}" y1="{ly}" x2="{lx+22}" y2="{ly}" stroke="{col}" '
                 f'stroke-width="2"' + (f' stroke-dasharray="{dash}"' if dash else '') + '/>')
        b.append(f'<circle cx="{lx+11}" cy="{ly}" r="4" fill="{col}" stroke="{SURF}" stroke-width="1.5"/>')
        b.append(txt(lx + 30, ly + 4, lbl, 11.5, INK2))
        lx += 30 + len(lbl) * 6.6 + 26
    b.append(f'<rect x="{lx+4}" y="{ly-6}" width="13" height="11" fill="{C2}" fill-opacity="0.13"/>')
    b.append(txt(lx + 23, ly + 4, 'the residual', 11.5, MUT))

    return wrap(W, H, ''.join(b), 'Measured against model-expected bearing temperature',
                'The measured line climbs from 74 to 91 °C over twelve weeks while the model '
                'expectation stays flat at 74 °C. The residual reaches +4 °C in week 5, when the '
                'measured value is still 12 °C below the 90 °C DCS alarm.')


# ════════════════════════════════════════════════════════ 2. P–F curve
def fig_pf():
    W, H = 940, 540
    L, R, T, B = 74, 40, 112, 150
    b = [txt(L, 32, 'The P–F interval, and where each technique detects', 14, INK, weight='600'),
         txt(L, 52, 'You do not choose the P–F interval — physics does. You only choose how much of it you use.',
             11.5, MUT)]

    x0, x1 = L + 30, W - R - 40
    yTop, yBot = T + 18, H - B
    pts = []
    for k in range(81):
        t = k / 80
        x = x0 + t * (x1 - x0)
        y = yTop + (yBot - yTop) * (1 - (t ** 2.6))
        pts.append(f'{x:.1f},{y:.1f}')
    b.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{INK}" stroke-width="2.5" '
             f'stroke-linecap="round"/>')

    b.append(f'<line x1="{x0-16}" y1="{yBot}" x2="{x1+26}" y2="{yBot}" stroke="{LINE}" stroke-width="1.5"/>')
    b.append(txt(x0 - 16, yBot + 22, 'time  →', 11.5, MUT))
    b.append(txt(L, yTop + 8, 'condition', 11.5, MUT))

    for x, lab, sub, col in ((x0, 'P', 'potential failure —\nnothing measurable\nhas changed yet', MUT),
                             (x1, 'F', 'functional failure', BAD)):
        b.append(f'<line x1="{x:.1f}" y1="{yTop-10}" x2="{x:.1f}" y2="{yBot+8}" stroke="{col}" '
                 f'stroke-width="1.5" stroke-dasharray="4 4"/>')
        b.append(txt(x, yBot + 44, lab, 16, col, 'middle', '700'))
        for k, ln in enumerate(sub.split('\n')):
            b.append(txt(x, yBot + 64 + k * 13, ln, 10.5, MUT, 'middle'))

    b.append(f'<line x1="{x0:.1f}" y1="{T-16}" x2="{x1:.1f}" y2="{T-16}" stroke="{C1}" stroke-width="1.5"/>')
    for xx in (x0, x1):
        b.append(f'<line x1="{xx:.1f}" y1="{T-21}" x2="{xx:.1f}" y2="{T-11}" stroke="{C1}" stroke-width="1.5"/>')
    b.append(txt((x0 + x1) / 2, T - 24, 'the P–F interval — all the warning physics allows', 11.5, C1, 'middle', '600'))

    # dy is a deliberate stagger: leaders run to a clear band, never over the curve
    marks = [(0.10, 'AI multivariate anomaly detection', 'weeks to months',            C3, -104),
             (0.30, 'Online condition monitoring',       'weeks',                      C3,  -62),
             (0.52, 'Periodic vibration route',          'days to weeks, quantised',   C1, -104),
             (0.70, 'Operator round',                    'hours to days',              C1,   62),
             (0.87, 'Fixed DCS alarm',                   'minutes to hours',           C2,  104),
             (1.00, 'Protection trip',                   'zero — damage limitation',   BAD,  62)]
    for t, name, warn, col, dy in marks:
        x = x0 + t * (x1 - x0)
        y = yTop + (yBot - yTop) * (1 - (t ** 2.6))
        ty = (T + 6) if t >= 0.999 else y + dy
        b.append(f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x:.1f}" y2="{ty + (10 if dy<0 else -16):.1f}" '
                 f'stroke="{col}" stroke-width="1" stroke-opacity="0.5"/>')
        b.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="{col}" stroke="{SURF}" stroke-width="2.5"/>')
        anc = 'middle' if 0.15 < t < 0.92 else ('start' if t <= 0.15 else 'end')
        tx = x + (0 if anc == 'middle' else (6 if anc == 'start' else -6))
        b.append(txt(tx, ty, name, 11.5, INK, anc, '600'))
        b.append(txt(tx, ty + 15, warn, 10.5, MUT, anc))
    return wrap(W, H, ''.join(b), 'The P–F interval',
                'A condition curve falling from P, potential failure, to F, functional failure. Six '
                'detection techniques are marked along it, earliest first: AI multivariate anomaly '
                'detection, online condition monitoring, periodic vibration route, operator round, '
                'fixed DCS alarm, and finally the protection trip at F.')


# ════════════════════════════════════════════════════════ 3. decomposition
def fig_decomp():
    """The finding the whole course turns on. Two stations, same net gap
       question, opposite answers. Stacked to sum, with a 2px surface gap."""
    W, H = 940, 430
    L, T = 250, 96
    rowh, gap = 92, 40
    scale = 1.42                                      # px per kcal/kWh
    zero = L + 150
    b = [txt(40, 44, 'Net heat-rate gap, decomposed — June 2026', 15, INK, weight='700'),
         txt(40, 66, 'Net heat rate already contains auxiliary power. Decompose it and two stations with a '
                     'gap tell opposite stories.', 11.5, MUT)]

    b.append(f'<line x1="{zero}" y1="{T-14}" x2="{zero}" y2="{T+2*rowh+gap+8}" stroke="{LINE}" stroke-width="1.5"/>')
    b.append(txt(zero, T - 22, '0', 11, MUT, 'middle'))

    rows = [('Nashik Units 3-5', '3 × 210 MW', -18, 68, 50,
             'Boiler and turbine are BEATING the norm.\nEvery kcal of the penalty is auxiliary power.'),
            ('Koradi Units 8-10', '3 × 660 MW', 176, 36, 212,
             'A genuine thermodynamic gap.\nAuxiliary power is barely involved.')]

    for r, (name, cap, gross, aux, net, note) in enumerate(rows):
        y = T + r * (rowh + gap)
        b.append(txt(40, y + 20, name, 13, INK, weight='700'))
        b.append(txt(40, y + 38, cap, 11, MUT))
        for k, ln in enumerate(note.split('\n')):
            b.append(txt(40, y + 60 + k * 14, ln, 10.5, MUT))

        bh, by = 30, y + 8
        gx = zero + (gross * scale if gross < 0 else 0)
        b.append(f'<rect x="{min(zero, zero+gross*scale):.1f}" y="{by}" width="{abs(gross)*scale:.1f}" '
                 f'height="{bh}" rx="4" fill="{C1 if gross>0 else GOOD}"/>')
        ax = zero + max(0, gross * scale) + 2          # 2px surface gap between fills
        b.append(f'<rect x="{ax:.1f}" y="{by}" width="{aux*scale:.1f}" height="{bh}" rx="4" fill="{C2}"/>')

        lg = min(zero, zero + gross * scale) + abs(gross) * scale / 2
        b.append(txt(lg, by + 20, f'{gross:+d}', 12, SURF, 'middle', '700'))
        b.append(txt(ax + aux * scale / 2, by + 20, f'+{aux}', 12, SURF, 'middle', '700'))

        b.append(f'<line x1="{zero}" y1="{by+bh+12}" x2="{zero+net*scale:.1f}" y2="{by+bh+12}" '
                 f'stroke="{INK}" stroke-width="1.5"/>')
        for xx in (zero, zero + net * scale):
            b.append(f'<line x1="{xx:.1f}" y1="{by+bh+7}" x2="{xx:.1f}" y2="{by+bh+17}" stroke="{INK}" stroke-width="1.5"/>')
        b.append(txt(zero + net * scale + 10, by + bh + 16, f'net gap  {net} kcal/kWh', 12, INK, weight='700'))

    ly = T + 2 * rowh + gap + 34
    lx = 40
    for col, lbl in ((C1, 'Boiler and turbine, worse than norm'), (GOOD, 'Boiler and turbine, better than norm'),
                     (C2, 'Auxiliary power consumption')):
        b.append(f'<rect x="{lx}" y="{ly-11}" width="13" height="13" rx="3" fill="{col}"/>')
        b.append(txt(lx + 19, ly, lbl, 11, INK2))
        lx += 19 + len(lbl) * 5.9 + 26
    b.append(txt(40, ly + 26,
                 'The two effects overlap by construction. The ₹56.35 crore heat-rate gap and the '
                 '₹32.91 crore auxiliary excess must never be added together.', 11.5, BAD, weight='600'))
    return wrap(W, H, ''.join(b), 'Net heat-rate gap decomposed for two stations',
                'Nashik Units 3-5 have a net gap of 50 kcal per kWh made of minus 18 from boiler and '
                'turbine, which beat the norm, plus 68 from auxiliary power. Koradi Units 8-10 have a '
                'net gap of 212 made of 176 from boiler and turbine plus 36 from auxiliary power.')


# ════════════════════════════════════════════════════════ 4. health index
def fig_health():
    W, H = 940, 400
    b = [txt(40, 42, 'A health index has to be openable', 15, INK, weight='700'),
         txt(40, 64, 'Four tiers, as deployed by Adani Power on AVEVA PI. The bottom tier is the '
                     'reason the top tier is trusted.', 11.5, MUT)]
    tiers = [('Station', 'Udupi  84', 'one score per plant', C1),
             ('Asset class', 'Pumps 69 · Fans 71 · Mills 77', 'excellent >95 · good 85–95 · satisfactory 70–85 · poor <70', C1),
             ('Equipment', 'BFP 1A 87.4 · CEP 1A 98.0 · CWP 1A 76.8', 'each machine scored on its own', C3),
             ('Sensor', 'fan bearing temp · fan vib · lube oil · motor bearing temp · motor winding temp',
              'named tags you already have — this is why the number above can be argued with', C2)]
    x, w = 40, W - 80
    for i, (tier, val, sub, col) in enumerate(tiers):
        y = 92 + i * 74
        b.append(f'<rect x="{x}" y="{y}" width="{w}" height="60" rx="8" fill="{col}" fill-opacity="0.07" '
                 f'stroke="{col}" stroke-opacity="0.35" stroke-width="1"/>')
        b.append(f'<rect x="{x}" y="{y}" width="5" height="60" rx="2.5" fill="{col}"/>')
        b.append(txt(x + 22, y + 26, tier, 13, INK, weight='700'))
        b.append(txt(x + 22, y + 46, sub, 10.5, MUT))
        b.append(txt(x + 190, y + 26, val, 12.5, INK2, weight='600'))
        if i < 3:
            cx = x + 100
            b.append(f'<path d="M{cx} {y+60} L{cx} {y+68} M{cx-5} {y+63} L{cx} {y+68} L{cx+5} {y+63}" '
                     f'fill="none" stroke="{MUT}" stroke-width="1.5" stroke-linecap="round"/>')
    b.append(txt(40, H - 16, 'Any index you cannot decompose into tags an engineer recognises will be '
                             'ignored within a month.', 11.5, INK, weight='600'))
    return wrap(W, H, ''.join(b), 'Four-tier asset health index',
                'Station score, then asset-class scores for pumps, fans and mills, then individual '
                'equipment scores, then the named sensor tags each score is built from.')


print('figures ->', OUT)
save('fig-2-2-residual.svg', fig_residual())
save('fig-2-1-pf-curve.svg', fig_pf())
save('fig-8-decomposition.svg', fig_decomp())
save('fig-11-5-health-index.svg', fig_health())
