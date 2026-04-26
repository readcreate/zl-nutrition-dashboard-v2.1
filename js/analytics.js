// ── PIH NUTRITION DASHBOARD — ANALYTICS RENDERING ──

// ── DATA LOADING ──

function loadDashboardData() {
  const raw = sessionStorage.getItem('pih_nutrition_data');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ── DATE RANGE ──

function getDateRange() {
  const s = document.getElementById('date-start').value;
  const e = document.getElementById('date-end').value;
  return {
    start: s ? new Date(s + 'T00:00:00') : null,
    end:   e ? new Date(e + 'T23:59:59') : null,
  };
}

function getFilters() {
  const siteEl = document.getElementById('filter-site');
  const typeEl = document.getElementById('filter-type');
  return {
    range: getDateRange(),
    site: siteEl ? siteEl.value : '',
    typeIntervention: typeEl ? typeEl.value : '',
  };
}

function populateSiteFilter(cases) {
  const sel = document.getElementById('filter-site');
  if (!sel) return;
  const sites = [...new Set(cases.map(c => c.site).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">Tous sites / All sites</option>` +
    sites.map(s => `<option value="${s}">${s}</option>`).join('');
}

function inRange(dateStr, range) {
  if (!dateStr) return true;
  const d = new Date(dateStr + 'T00:00:00');
  if (range.start && d < range.start) return false;
  if (range.end   && d > range.end)   return false;
  return true;
}

// ── EPISODE EXTRACTION ──
// Returns flat list of episodes (one per program enrollment per case) filtered by date range.

function getFilteredEpisodes(cases, filters) {
  const { range, site, typeIntervention } = filters;
  const episodes = [];
  for (const c of cases) {
    if (site && c.site !== site) continue;
    if (typeIntervention && c.typeIntervention !== typeIntervention) continue;
    for (const prog of ['pns', 'pta', 'usn']) {
      const ep = c[prog];
      if (!ep) continue;
      const dateRef = ep.admDate || c.regDate;
      if (!inRange(dateRef, range)) continue;
      episodes.push({
        program:          prog.toUpperCase(),
        caseId:           c.id,
        site:             c.site,
        dept:             c.dept,
        commune:          c.commune,
        sex:              c.sex,
        ageMonths:        c.ageMonths,
        typeIntervention: c.typeIntervention,
        breastfeeding:    c.breastfeeding,
        vaccinated:       c.vaccinated,
        admDate:          ep.admDate,
        exitDate:         ep.exitDate,
        outcome:          ep.outcome,
        losdays:          ep.losdays,
        admWeight:        ep.admWeight,
        exitWeight:       ep.exitWeight,
        weightGainG:      ep.weightGainG,
        visitCount:       ep.visitCount,
        origine:          ep.origine,
        admOedema:        ep.admOedema,
        admPT:            ep.admPT,
        admMUAC:          ep.admMUAC,
        suppRec:          ep.suppRec,
        suppDel:          ep.suppDel,
      });
    }
  }
  return episodes;
}

// ── MONTH LABEL ──

function fmtMonth(mk) {
  const [year, month] = mk.split('-');
  const names = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  return `${names[parseInt(month, 10) - 1]} ${year.slice(2)}`;
}

// ── NO-DATA PLACEHOLDER ──

function noDataHtml(msg) {
  return `<div style="padding:24px;text-align:center;font-size:13px;color:var(--gray-400);">${msg || 'Aucune donnée / No data'}</div>`;
}

// ── SUMMARY STATS ──

function renderSummaryStats(episodes) {
  if (!document.getElementById('stat-grid')) return;
  const total    = episodes.length;
  const exited   = episodes.filter(e => e.outcome !== null);
  const active   = total - exited.length;
  const recovered   = exited.filter(e => e.outcome === 'Guéri').length;
  const defaulted   = exited.filter(e => e.outcome === 'Abandon').length;
  const deceased    = exited.filter(e => e.outcome === 'Décédé').length;

  const losVals = episodes.filter(e => e.losdays !== null).map(e => e.losdays);
  const avgLOS  = losVals.length ? Math.round(losVals.reduce((a, b) => a + b, 0) / losVals.length) : null;
  const sites   = new Set(episodes.map(e => e.site).filter(Boolean));

  const pct = (n, d) => d > 0 ? Math.round(n / d * 100) + '%' : '—';

  document.getElementById('stat-grid').innerHTML = `
    ${statCard('Admissions totales', 'Total admissions',
      total, `${active} actifs · ${exited.length} sortis`, 'blue')}
    ${statCard('Taux de guérison', 'Recovery rate',
      pct(recovered, exited.length), `${recovered} / ${exited.length} sortis`, 'green')}
    ${statCard("Taux d'abandon", 'Default rate',
      pct(defaulted, exited.length), `${defaulted} patients`, 'yellow')}
    ${statCard('Létalité', 'Case fatality rate',
      pct(deceased, exited.length), `${deceased} décès`, 'red')}
    ${statCard('Durée séjour moy.', 'Avg. length of stay',
      avgLOS !== null ? avgLOS : '—', 'jours / days', 'blue')}
    ${statCard('Sites', 'Sites represented',
      sites.size || '—', 'dans la période sélectionnée', 'green')}
  `;
}

function statCard(fr, en, val, sub, color) {
  return `
    <div class="stat-card ${color}">
      <div class="stat-label-fr">${fr}</div>
      <div class="stat-label-en">${en}</div>
      <div class="stat-value">${val}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;
}

// ── ENROLLMENT TREND ──

function renderEnrollmentTrend(episodes) {
  const el = document.getElementById('enrollment-chart');
  if (!el) return;

  const byMonth = {};
  for (const ep of episodes) {
    const mk = ep.admDate ? ep.admDate.slice(0, 7) : null;
    if (!mk) continue;
    if (!byMonth[mk]) byMonth[mk] = { PNS: 0, PTA: 0, USN: 0 };
    byMonth[mk][ep.program] = (byMonth[mk][ep.program] || 0) + 1;
  }

  const months = Object.keys(byMonth).sort();
  if (months.length === 0) { el.innerHTML = noDataHtml(); return; }

  const maxVal = Math.max(...months.map(m => {
    const d = byMonth[m];
    return (d.PNS || 0) + (d.PTA || 0) + (d.USN || 0);
  }), 1);

  el.innerHTML = months.map(m => {
    const { PNS = 0, PTA = 0, USN = 0 } = byMonth[m];
    const total = PNS + PTA + USN;
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
        <div style="width:44px;font-size:11px;color:var(--gray-500);text-align:right;white-space:nowrap;">
          ${fmtMonth(m)}
        </div>
        <div style="flex:1;display:flex;gap:2px;height:20px;border-radius:3px;overflow:hidden;background:var(--gray-100);">
          ${USN ? `<div style="width:${USN/maxVal*100}%;background:var(--pih-red);opacity:0.85;" title="USN: ${USN}"></div>` : ''}
          ${PTA ? `<div style="width:${PTA/maxVal*100}%;background:var(--blue);opacity:0.85;" title="PTA: ${PTA}"></div>` : ''}
          ${PNS ? `<div style="width:${PNS/maxVal*100}%;background:var(--green);opacity:0.85;" title="PNS: ${PNS}"></div>` : ''}
        </div>
        <div style="font-size:11px;color:var(--gray-600);font-weight:600;min-width:24px;text-align:right;">
          ${total}
        </div>
      </div>`;
  }).join('');
}

// ── COHORT OUTCOMES ──

function renderCohortOutcomes(episodes) {
  const el = document.getElementById('cohort-chart');
  if (!el) return;

  const byMonth = {};
  for (const ep of episodes) {
    const mk = ep.admDate ? ep.admDate.slice(0, 7) : null;
    if (!mk) continue;
    if (!byMonth[mk]) byMonth[mk] = { 'Guéri': 0, 'Abandon': 0, 'Transféré': 0, 'Décédé': 0, 'Actif': 0 };
    const out = ep.outcome || 'Actif';
    if (byMonth[mk][out] !== undefined) byMonth[mk][out]++;
    else byMonth[mk]['Actif']++;
  }

  const months = Object.keys(byMonth).sort();
  if (months.length === 0) { el.innerHTML = noDataHtml(); return; }

  el.innerHTML = months.map(m => {
    const d = byMonth[m];
    const total = Object.values(d).reduce((a, b) => a + b, 0);
    const pct = v => total > 0 ? (v / total * 100).toFixed(1) : 0;
    return `
      <div class="cohort-bar-row">
        <div class="cohort-label">${fmtMonth(m)}</div>
        <div class="cohort-bars">
          ${d['Guéri']    ? `<div class="cohort-segment recovered"   style="width:${pct(d['Guéri'])}%"    title="Guéri: ${d['Guéri']}"></div>` : ''}
          ${d['Abandon']  ? `<div class="cohort-segment defaulted"   style="width:${pct(d['Abandon'])}%"  title="Abandon: ${d['Abandon']}"></div>` : ''}
          ${d['Transféré']? `<div class="cohort-segment transferred" style="width:${pct(d['Transféré'])}%" title="Transféré: ${d['Transféré']}"></div>` : ''}
          ${d['Décédé']   ? `<div class="cohort-segment deceased"    style="width:${pct(d['Décédé'])}%"   title="Décédé: ${d['Décédé']}"></div>` : ''}
          ${d['Actif']    ? `<div class="cohort-segment active"      style="width:${pct(d['Actif'])}%"    title="Actif: ${d['Actif']}"></div>` : ''}
        </div>
        <div style="font-size:10px;color:var(--gray-500);white-space:nowrap;min-width:46px;text-align:right;">
          ${total} adm.
        </div>
      </div>`;
  }).join('');
}

// ── PROGRAMME FLOW (ORIGINE) ──

const ORIGINE_LABELS = {
  'NC':     'NC — Nouveau cas / New case',
  'RECH':   'RECH — Rechute / Relapse',
  'RANR':   'RANR — Réadm. non répondant',
  'RAA':    'RAA — Réadm. après abandon',
  'AC':     'AC — Ancien cas / Previous case',
  'PTA':    'PTA — Escalade depuis PTA',
  'USN':    'USN — Escalade depuis USN',
  'Autres': 'Autres / Other',
};

const ORIGINE_COLORS = {
  'NC': 'var(--green)', 'RECH': 'var(--pih-red)', 'RANR': 'var(--pih-red)',
  'RAA': 'var(--yellow)', 'AC': 'var(--gray-400)', 'PTA': 'var(--blue)',
  'USN': 'var(--blue)', 'Autres': 'var(--gray-300)',
};

function renderProgramFlow(episodes) {
  const counts = {};
  for (const ep of episodes) {
    const o = ep.origine || '—';
    counts[o] = (counts[o] || 0) + 1;
  }

  const data = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, val]) => ({
      label: ORIGINE_LABELS[key] || key,
      value: val,
      color: ORIGINE_COLORS[key] || 'var(--blue)',
    }));

  if (data.length === 0) {
    document.getElementById('flow-chart').innerHTML = noDataHtml();
    return;
  }
  renderBarChart('flow-chart', data);
}

// ── SUPPLEMENT GAP ──

function renderSuppGap(suppMonthly, range) {
  const el = document.getElementById('supp-chart');
  if (!el) return;

  let rows = suppMonthly;
  if (range.start) {
    const mk = range.start.toISOString().slice(0, 7);
    rows = rows.filter(r => r.month >= mk);
  }
  if (range.end) {
    const mk = range.end.toISOString().slice(0, 7);
    rows = rows.filter(r => r.month <= mk);
  }

  // Aggregate all programs by month
  const byMonth = {};
  for (const r of rows) {
    if (!byMonth[r.month]) byMonth[r.month] = { rec: 0, del: 0 };
    byMonth[r.month].rec += r.rec;
    byMonth[r.month].del += r.del;
  }

  const months = Object.keys(byMonth).sort();
  if (months.length === 0) { el.innerHTML = noDataHtml('Aucune donnée de suppléments / No supplement data'); return; }

  const maxVal = Math.max(...months.map(m => byMonth[m].rec), 1);

  el.innerHTML = months.map(m => {
    const { rec, del } = byMonth[m];
    const rate = rec > 0 ? Math.round(del / rec * 100) : null;
    const rateColor = rate === null ? 'var(--gray-400)' : rate >= 90 ? 'var(--green)' : rate >= 70 ? 'var(--yellow)' : 'var(--pih-red)';
    return `
      <div style="margin-bottom:11px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-500);margin-bottom:3px;">
          <span>${fmtMonth(m)}</span>
          <span style="color:${rateColor};font-weight:600;">
            ${rate !== null ? rate + '% livré' : '—'}
          </span>
        </div>
        <div style="position:relative;height:14px;border-radius:3px;overflow:hidden;background:var(--gray-100);">
          <div style="position:absolute;inset:0;width:${rec/maxVal*100}%;background:var(--gray-300);border-radius:3px;"
               title="Recommandé: ${rec}"></div>
          <div style="position:absolute;inset:0;width:${del/maxVal*100}%;background:var(--green);border-radius:3px;opacity:0.85;"
               title="Livré: ${del}"></div>
        </div>
      </div>`;
  }).join('');
}

// ── LENGTH OF STAY ──

function renderLOS(episodes) {
  const el = document.getElementById('los-chart');
  if (!el) return;

  const buckets = [
    { label: '< 2 sem.',  min: 0,   max: 13  },
    { label: '2–4 sem.',  min: 14,  max: 27  },
    { label: '1–2 mois',  min: 28,  max: 59  },
    { label: '2–4 mois',  min: 60,  max: 119 },
    { label: '> 4 mois',  min: 120, max: 9999 },
  ];
  const colors = { USN: 'var(--pih-red)', PTA: 'var(--blue)', PNS: 'var(--green)' };

  const withLOS = episodes.filter(e => e.losdays !== null);
  if (withLOS.length === 0) { el.innerHTML = noDataHtml('Aucune donnée de durée de séjour / No length-of-stay data'); return; }

  let html = '';
  for (const prog of ['USN', 'PTA', 'PNS']) {
    const ep = withLOS.filter(e => e.program === prog);
    if (ep.length === 0) continue;
    const maxCount = Math.max(...buckets.map(b =>
      ep.filter(e => e.losdays >= b.min && e.losdays <= b.max).length
    ), 1);
    html += `
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:var(--gray-500);letter-spacing:0.06em;
                    text-transform:uppercase;margin-bottom:6px;">${prog}
          <span style="font-weight:400;color:var(--gray-400);">(${ep.length} patients)</span>
        </div>
        ${buckets.map(b => {
          const count = ep.filter(e => e.losdays >= b.min && e.losdays <= b.max).length;
          return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <div style="width:52px;font-size:10px;color:var(--gray-400);text-align:right;">${b.label}</div>
              <div style="flex:1;background:var(--gray-100);border-radius:2px;height:14px;overflow:hidden;">
                <div style="width:${count/maxCount*100}%;height:100%;background:${colors[prog]};opacity:0.8;border-radius:2px;"></div>
              </div>
              <div style="width:22px;font-size:11px;font-weight:700;color:var(--gray-600);text-align:right;">${count}</div>
            </div>`;
        }).join('')}
      </div>`;
  }

  // Site breakdown: avg LOS per site per program
  const sites = [...new Set(withLOS.map(e => e.site).filter(Boolean))].sort();
  if (sites.length > 1) {
    const avgLOSCell = (s, prog) => {
      const ep = withLOS.filter(e => e.site === s && e.program === prog);
      if (!ep.length) return '<td style="text-align:right;padding:4px 8px;color:var(--gray-300);">—</td>';
      const avg = Math.round(ep.reduce((sum, e) => sum + e.losdays, 0) / ep.length);
      return `<td style="text-align:right;padding:4px 8px;font-family:var(--mono);color:var(--gray-600);">${avg}j</td>`;
    };
    html += `
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--gray-100);">
        <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">
          Durée moy. par site · Avg LOS by site
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr>
              <th style="text-align:left;padding:4px 8px;color:var(--gray-400);font-weight:600;font-size:10px;border-bottom:1px solid var(--gray-200);">Site</th>
              <th style="text-align:right;padding:4px 8px;color:var(--pih-red);font-weight:700;font-size:10px;border-bottom:1px solid var(--gray-200);">USN</th>
              <th style="text-align:right;padding:4px 8px;color:var(--blue);font-weight:700;font-size:10px;border-bottom:1px solid var(--gray-200);">PTA</th>
              <th style="text-align:right;padding:4px 8px;color:var(--green);font-weight:700;font-size:10px;border-bottom:1px solid var(--gray-200);">PNS</th>
            </tr></thead>
            <tbody>
              ${sites.map(s => `<tr>
                <td style="padding:4px 8px;font-weight:600;color:var(--gray-700);font-size:11px;">${s}</td>
                ${avgLOSCell(s,'USN')}${avgLOSCell(s,'PTA')}${avgLOSCell(s,'PNS')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  el.innerHTML = html;
}

// ── GEOGRAPHIC BREAKDOWN ──

function renderGeographic(episodes) {
  const el = document.getElementById('geo-chart');
  if (!el) return;

  const bySite = {};
  for (const ep of episodes) {
    const site = ep.site || 'Site inconnu';
    bySite[site] = (bySite[site] || 0) + 1;
  }

  const data = Object.entries(bySite)
    .sort((a, b) => b[1] - a[1])
    .map(([site, count]) => ({ label: site, value: count, color: 'var(--blue)' }));

  if (data.length === 0) { el.innerHTML = noDataHtml(); return; }
  renderBarChart('geo-chart', data);
}

// ── OUTCOMES TABLE ──

function renderOutcomesTable(episodes) {
  const tbody = document.getElementById('outcomes-table-body');
  if (!tbody) return;

  const outcomes   = ['Guéri', 'Abandon', 'Transféré', 'Décédé'];
  const outColors  = { 'Guéri': 'var(--green)', 'Abandon': 'var(--yellow)', 'Transféré': 'var(--blue)', 'Décédé': 'var(--pih-red)' };
  const programs   = ['PNS', 'PTA', 'USN'];

  const rows = programs.map(prog => {
    const ep     = episodes.filter(e => e.program === prog);
    const exited = ep.filter(e => e.outcome !== null);
    const counts = {};
    for (const o of outcomes) counts[o] = ep.filter(e => e.outcome === o).length;
    const active       = ep.filter(e => e.outcome === null).length;
    const recoveryRate = exited.length > 0 ? Math.round(counts['Guéri'] / exited.length * 100) : null;
    return { prog, total: ep.length, exited: exited.length, active, counts, recoveryRate };
  }).filter(r => r.total > 0);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--gray-400);padding:20px;">
      Aucune donnée / No data</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${programTag(r.prog)}</td>
      <td style="font-weight:700;">${r.total}</td>
      ${outcomes.map(o =>
        `<td style="color:${outColors[o]};font-weight:600;">${r.counts[o]}</td>`
      ).join('')}
      <td style="color:var(--gray-500);">${r.active}</td>
      <td style="min-width:120px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;">
            ${r.recoveryRate !== null
              ? progressBar(r.recoveryRate,
                  r.recoveryRate >= 75 ? 'var(--green)' : r.recoveryRate >= 60 ? 'var(--yellow)' : 'var(--pih-red)')
              : ''}
          </div>
          <span style="font-size:12px;font-weight:700;color:var(--gray-700);white-space:nowrap;">
            ${r.recoveryRate !== null ? r.recoveryRate + '%' : '—'}
          </span>
        </div>
      </td>
    </tr>
  `).join('');
}

// ── NUTRITIONAL STATUS AT ADMISSION (P/T) ──
// Sort by clinical severity: most severe (most negative Z-score) first

const PT_SEVERITY_ORDER = [
  '< -4 ET', '= -4 ET',
  '< -3 ET', '= -3 ET',
  '< -2 ET', '= -2 ET',
  '< -1 ET', '= -1 ET',
  '< Médiane', '= Médiane',
  '> -4 ET', '> -3 ET', '> -2 ET', '> -1 ET', '> Médiane',
];

function renderPTChart(episodes) {
  const el = document.getElementById('pt-chart');
  if (!el) return;

  const counts = {};
  for (const ep of episodes) {
    if (!ep.admPT) continue;
    counts[ep.admPT] = (counts[ep.admPT] || 0) + 1;
  }

  // Sort: known severity order first, then unknown values by count
  const known   = PT_SEVERITY_ORDER.filter(k => counts[k]).map(k => ({ label: k, value: counts[k] }));
  const unknown = Object.entries(counts)
    .filter(([k]) => !PT_SEVERITY_ORDER.includes(k))
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  const data = [...known, ...unknown].map(d => ({
    ...d,
    color: d.label.startsWith('< -3') || d.label.startsWith('= -3') || d.label.startsWith('< -4') || d.label.startsWith('= -4')
      ? 'var(--pih-red)'
      : d.label.startsWith('< -2') || d.label.startsWith('= -2')
        ? 'var(--yellow)'
        : 'var(--blue)',
  }));

  if (data.length === 0) { el.innerHTML = noDataHtml('Données P/T non disponibles / P/T data not available'); return; }
  renderBarChart('pt-chart', data);
}

// ── WEIGHT GAIN DISTRIBUTION ──

function renderWeightGainChart(episodes) {
  const el = document.getElementById('wg-chart');
  if (!el) return;

  const cured = episodes.filter(e => e.outcome === 'Guéri' && e.weightGainG !== null);
  if (cured.length === 0) { el.innerHTML = noDataHtml('Données de gain de poids non disponibles / Weight gain data not available'); return; }

  const buckets = [
    { label: '< 0 g',       min: -99999, max: -1    },
    { label: '0–500 g',     min: 0,      max: 500   },
    { label: '500–1000 g',  min: 501,    max: 1000  },
    { label: '1–2 kg',      min: 1001,   max: 2000  },
    { label: '2–3 kg',      min: 2001,   max: 3000  },
    { label: '> 3 kg',      min: 3001,   max: 99999 },
  ];

  const maxCount = Math.max(...buckets.map(b =>
    cured.filter(e => e.weightGainG >= b.min && e.weightGainG <= b.max).length
  ), 1);

  const distHtml = buckets.map(b => {
    const count = cured.filter(e => e.weightGainG >= b.min && e.weightGainG <= b.max).length;
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <div style="width:70px;font-size:11px;color:var(--gray-500);text-align:right;">${b.label}</div>
        <div style="flex:1;background:var(--gray-100);border-radius:3px;height:18px;overflow:hidden;">
          <div style="width:${count/maxCount*100}%;height:100%;background:var(--green);opacity:0.85;border-radius:3px;"></div>
        </div>
        <div style="width:28px;font-size:12px;font-weight:700;color:var(--gray-700);text-align:right;">${count}</div>
      </div>`;
  }).join('');

  // Breakdown by sex
  const sexRows = [
    { key: 'M', label: 'M', color: 'var(--blue)' },
    { key: 'F', label: 'F', color: 'var(--pih-red)' },
  ].map(g => {
    const ep = cured.filter(e => e.sex === g.key);
    if (!ep.length) return '';
    const avg = Math.round(ep.reduce((s, e) => s + e.weightGainG, 0) / ep.length);
    const maxG = Math.max(...cured.map(e => e.weightGainG), 1);
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <div style="width:14px;font-size:11px;font-weight:700;color:${g.color};text-align:right;">${g.label}</div>
      <div style="flex:1;background:var(--gray-100);border-radius:2px;height:14px;overflow:hidden;">
        <div style="width:${avg/maxG*100}%;height:100%;background:${g.color};opacity:0.75;border-radius:2px;"></div>
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--gray-700);min-width:60px;text-align:right;">${avg}g <span style="font-weight:400;color:var(--gray-400);">(n=${ep.length})</span></div>
    </div>`;
  }).join('');

  // Breakdown by age group
  const maxAvgAge = Math.max(...AGE_GROUPS.map(g => {
    const ep = cured.filter(e => e.ageMonths !== null && e.ageMonths >= g.min && e.ageMonths <= g.max);
    return ep.length ? ep.reduce((s, e) => s + e.weightGainG, 0) / ep.length : 0;
  }), 1);

  const ageRows = AGE_GROUPS.map(g => {
    const ep = cured.filter(e => e.ageMonths !== null && e.ageMonths >= g.min && e.ageMonths <= g.max);
    if (!ep.length) return '';
    const avg = Math.round(ep.reduce((s, e) => s + e.weightGainG, 0) / ep.length);
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <div style="width:70px;font-size:10px;color:var(--gray-400);text-align:right;">${g.label}</div>
      <div style="flex:1;background:var(--gray-100);border-radius:2px;height:14px;overflow:hidden;">
        <div style="width:${avg/maxAvgAge*100}%;height:100%;background:var(--yellow);opacity:0.75;border-radius:2px;"></div>
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--gray-700);min-width:60px;text-align:right;">${avg}g <span style="font-weight:400;color:var(--gray-400);">(n=${ep.length})</span></div>
    </div>`;
  }).join('');

  const breakdownHtml = (sexRows || ageRows) ? `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--gray-100);">
      ${sexRows ? `<div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px;">Gain moy. par sexe · Avg gain by sex</div>${sexRows}` : ''}
      ${ageRows ? `<div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.07em;margin:10px 0 6px;">Gain moy. par âge · Avg gain by age</div>${ageRows}` : ''}
    </div>` : '';

  el.innerHTML = distHtml + breakdownHtml;
}

// ── PATIENT PROFILES ──

const AGE_GROUPS = [
  { label: '0–5 mois',   min: 0,   max: 5   },
  { label: '6–11 mois',  min: 6,   max: 11  },
  { label: '12–23 mois', min: 12,  max: 23  },
  { label: '24–59 mois', min: 24,  max: 59  },
  { label: '≥ 60 mois',  min: 60,  max: 9999 },
];

function renderPatientProfiles(episodes) {
  // Age distribution (unique cases — use caseId dedupe per episode set)
  const seenAge = new Set();
  const ageGroups = AGE_GROUPS.map(g => ({ ...g, count: 0 }));
  let missingAge = 0;
  for (const ep of episodes) {
    if (seenAge.has(ep.caseId)) continue;
    seenAge.add(ep.caseId);
    if (ep.ageMonths === null) { missingAge++; continue; }
    const g = ageGroups.find(b => ep.ageMonths >= b.min && ep.ageMonths <= b.max);
    if (g) g.count++;
  }
  const maxAge = Math.max(...ageGroups.map(g => g.count), 1);
  const ageEl = document.getElementById('profile-age-chart');
  if (ageEl) {
    const total = ageGroups.reduce((s, g) => s + g.count, 0);
    ageEl.innerHTML = `
      <div style="font-size:11px;font-weight:600;color:var(--gray-500);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px;">
        Groupe d'âge <span style="font-weight:400;color:var(--gray-400);">(${total} enfants · ${missingAge} non renseignés)</span>
      </div>
      ${ageGroups.map(g => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
          <div style="width:72px;font-size:11px;color:var(--gray-500);text-align:right;">${g.label}</div>
          <div style="flex:1;background:var(--gray-100);border-radius:3px;height:16px;overflow:hidden;">
            <div style="width:${g.count/maxAge*100}%;height:100%;background:var(--blue);opacity:0.8;border-radius:3px;"></div>
          </div>
          <div style="width:32px;font-size:11px;font-weight:700;color:var(--gray-700);text-align:right;">${g.count}</div>
        </div>`).join('')}`;
  }

  // Sex breakdown
  const sexEl = document.getElementById('profile-sex-chart');
  if (sexEl) {
    const seenSex = new Set();
    const sexCounts = {};
    for (const ep of episodes) {
      if (seenSex.has(ep.caseId)) continue;
      seenSex.add(ep.caseId);
      const s = ep.sex || 'Non renseigné';
      sexCounts[s] = (sexCounts[s] || 0) + 1;
    }
    const total = Object.values(sexCounts).reduce((a, b) => a + b, 0);
    const sexColors = { 'M': 'var(--blue)', 'F': 'var(--pih-red)', 'Non renseigné': 'var(--gray-300)' };
    sexEl.innerHTML = `
      <div style="font-size:11px;font-weight:600;color:var(--gray-500);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px;">Sexe</div>
      <div style="display:flex;gap:6px;height:22px;border-radius:4px;overflow:hidden;margin-bottom:6px;">
        ${Object.entries(sexCounts).map(([s, n]) => `
          <div style="flex:${n};background:${sexColors[s]||'var(--gray-300)'};opacity:0.85;" title="${s}: ${n}"></div>
        `).join('')}
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        ${Object.entries(sexCounts).map(([s, n]) => `
          <span style="font-size:11px;color:var(--gray-600);">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${sexColors[s]||'var(--gray-300)'};margin-right:4px;vertical-align:middle;"></span>
            ${s} — ${n} (${total > 0 ? Math.round(n/total*100) : 0}%)
          </span>`).join('')}
      </div>`;
  }
}

function renderBreastfeedingVax(episodes) {
  // Breastfeeding — deduplicate by case
  const seenBF  = new Set();
  const bfCounts  = {};
  const seenVax = new Set();
  const vaxCounts = {};
  for (const ep of episodes) {
    if (!seenBF.has(ep.caseId)) {
      seenBF.add(ep.caseId);
      const b = ep.breastfeeding || 'Non renseigné';
      bfCounts[b] = (bfCounts[b] || 0) + 1;
    }
    if (!seenVax.has(ep.caseId)) {
      seenVax.add(ep.caseId);
      const v = ep.vaccinated || 'Non renseigné';
      vaxCounts[v] = (vaxCounts[v] || 0) + 1;
    }
  }

  const bfEl = document.getElementById('profile-bf-chart');
  if (bfEl) {
    const data = Object.entries(bfCounts).sort((a,b)=>b[1]-a[1]).map(([label,value]) => ({ label, value, color: 'var(--green)' }));
    if (data.length === 0) { bfEl.innerHTML = noDataHtml(); }
    else {
      bfEl.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--gray-500);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px;">Allaitement / Breastfeeding</div>`;
      renderBarChart('profile-bf-chart', data);
      // re-inject the label since renderBarChart replaces innerHTML
      const max = Math.max(...data.map(d => d.value), 1);
      bfEl.innerHTML = `
        <div style="font-size:11px;font-weight:600;color:var(--gray-500);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px;">Allaitement / Breastfeeding</div>
        ${data.map(d => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <div style="width:110px;font-size:11px;color:var(--gray-500);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${d.label}">${d.label}</div>
            <div style="flex:1;background:var(--gray-100);border-radius:3px;height:16px;overflow:hidden;">
              <div style="width:${d.value/max*100}%;height:100%;background:var(--green);opacity:0.8;border-radius:3px;"></div>
            </div>
            <div style="width:28px;font-size:11px;font-weight:700;color:var(--gray-700);text-align:right;">${d.value}</div>
          </div>`).join('')}`;
    }
  }

  const vaxEl = document.getElementById('profile-vax-chart');
  if (vaxEl) {
    const data = Object.entries(vaxCounts).sort((a,b)=>b[1]-a[1]).map(([label,value]) => ({ label, value, color: 'var(--yellow)' }));
    if (data.length === 0) { vaxEl.innerHTML = noDataHtml(); return; }
    const max = Math.max(...data.map(d => d.value), 1);
    vaxEl.innerHTML = `
      <div style="font-size:11px;font-weight:600;color:var(--gray-500);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px;margin-top:6px;">Vaccination complète / Fully vaccinated</div>
      ${data.map(d => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
          <div style="width:110px;font-size:11px;color:var(--gray-500);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${d.label}">${d.label}</div>
          <div style="flex:1;background:var(--gray-100);border-radius:3px;height:16px;overflow:hidden;">
            <div style="width:${d.value/max*100}%;height:100%;background:var(--yellow);opacity:0.85;border-radius:3px;"></div>
          </div>
          <div style="width:28px;font-size:11px;font-weight:700;color:var(--gray-700);text-align:right;">${d.value}</div>
        </div>`).join('')}`;
  }
}

// ── SITE PERFORMANCE ──

function renderSitePerformance(episodes) {
  const tbody = document.getElementById('site-perf-tbody');
  if (!tbody) return;

  const sites = [...new Set(episodes.map(e => e.site).filter(Boolean))].sort();
  if (sites.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px;">Aucune donnée / No data</td></tr>`;
    return;
  }

  const rows = sites.map(site => {
    const ep     = episodes.filter(e => e.site === site);
    const exited = ep.filter(e => e.outcome !== null);
    const rec    = ep.filter(e => e.outcome === 'Guéri').length;
    const def    = ep.filter(e => e.outcome === 'Abandon').length;
    const losVals= ep.filter(e => e.losdays !== null).map(e => e.losdays);
    const avgLOS = losVals.length ? Math.round(losVals.reduce((a,b)=>a+b,0)/losVals.length) : null;
    const recRate= exited.length > 0 ? Math.round(rec/exited.length*100) : null;
    const defRate= exited.length > 0 ? Math.round(def/exited.length*100) : null;
    const pns = ep.filter(e => e.program === 'PNS').length;
    const pta = ep.filter(e => e.program === 'PTA').length;
    const usn = ep.filter(e => e.program === 'USN').length;
    return { site, total: ep.length, exited: exited.length, recRate, defRate, avgLOS, pns, pta, usn };
  }).sort((a,b) => b.total - a.total);

  tbody.innerHTML = rows.map(r => {
    const recColor = r.recRate === null ? 'var(--gray-400)' : r.recRate >= 75 ? 'var(--green)' : r.recRate >= 60 ? 'var(--yellow)' : 'var(--pih-red)';
    const total = r.pns + r.pta + r.usn || 1;
    return `<tr>
      <td style="font-weight:600;">${r.site}</td>
      <td style="font-weight:700;">${r.total}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          ${r.recRate !== null ? `<div style="flex:1;max-width:80px;">${progressBar(r.recRate, recColor)}</div>` : ''}
          <span style="font-size:12px;font-weight:700;color:${recColor};">${r.recRate !== null ? r.recRate+'%' : '—'}</span>
        </div>
      </td>
      <td style="font-size:13px;color:var(--yellow);font-weight:600;">${r.defRate !== null ? r.defRate+'%' : '—'}</td>
      <td style="font-size:13px;font-family:var(--mono);">${r.avgLOS !== null ? r.avgLOS+' j' : '—'}</td>
      <td>
        <div style="display:flex;gap:2px;height:16px;width:120px;border-radius:3px;overflow:hidden;">
          ${r.usn ? `<div style="flex:${r.usn};background:var(--pih-red);opacity:0.8;" title="USN: ${r.usn}"></div>` : ''}
          ${r.pta ? `<div style="flex:${r.pta};background:var(--blue);opacity:0.8;" title="PTA: ${r.pta}"></div>` : ''}
          ${r.pns ? `<div style="flex:${r.pns};background:var(--green);opacity:0.8;" title="PNS: ${r.pns}"></div>` : ''}
        </div>
        <div style="font-size:10px;color:var(--gray-400);margin-top:2px;">
          ${r.usn ? `USN ${r.usn} ` : ''}${r.pta ? `PTA ${r.pta} ` : ''}${r.pns ? `PNS ${r.pns}` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── CARE PATHWAY ──

function renderCarePathway(cases, filters) {
  const pathEl   = document.getElementById('pathway-chart');
  const visitsEl = document.getElementById('visits-chart');
  const { range, site, typeIntervention } = filters;

  // Filter cases where at least one episode is in range
  const filteredCases = cases.filter(c => {
    if (site && c.site !== site) return false;
    if (typeIntervention && c.typeIntervention !== typeIntervention) return false;
    for (const prog of ['pns','pta','usn']) {
      const ep = c[prog];
      if (!ep) continue;
      const ref = ep.admDate || c.regDate;
      if (!ref) continue;
      const d = new Date(ref + 'T00:00:00');
      if (range.start && d < range.start) continue;
      if (range.end   && d > range.end)   continue;
      return true;
    }
    return false;
  });

  // Program combination counts
  if (pathEl) {
    const comboCounts = {};
    for (const c of filteredCases) {
      const progs = ['PNS','PTA','USN'].filter(p => c[p.toLowerCase()]);
      const key = progs.join('+') || '—';
      comboCounts[key] = (comboCounts[key] || 0) + 1;
    }
    const comboColors = {
      'PNS':         'var(--green)',
      'PTA':         'var(--blue)',
      'USN':         'var(--pih-red)',
      'PNS+PTA':     'var(--blue)',
      'PNS+USN':     'var(--pih-red)',
      'PTA+USN':     'var(--pih-red)',
      'PNS+PTA+USN': 'var(--pih-red)',
    };
    const data = Object.entries(comboCounts)
      .sort((a,b) => b[1] - a[1])
      .map(([key, val]) => ({ label: key, value: val, color: comboColors[key] || 'var(--gray-400)' }));

    if (data.length === 0) { pathEl.innerHTML = noDataHtml(); }
    else {
      const max = Math.max(...data.map(d => d.value), 1);
      const total = data.reduce((s, d) => s + d.value, 0);
      pathEl.innerHTML = data.map(d => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
          <div style="width:88px;font-size:12px;font-weight:700;color:var(--gray-600);text-align:right;">${d.label}</div>
          <div style="flex:1;background:var(--gray-100);border-radius:3px;height:20px;overflow:hidden;">
            <div style="width:${d.value/max*100}%;height:100%;background:${d.color};opacity:0.85;border-radius:3px;"></div>
          </div>
          <div style="font-size:11px;font-weight:700;color:var(--gray-700);min-width:52px;text-align:right;">
            ${d.value} <span style="font-weight:400;color:var(--gray-400);">(${Math.round(d.value/total*100)}%)</span>
          </div>
        </div>`).join('');
    }
  }

  // Visit count distribution per program
  if (visitsEl) {
    const progColors = { USN: 'var(--pih-red)', PTA: 'var(--blue)', PNS: 'var(--green)' };
    const buckets = [
      { label: '1',    min: 1, max: 1  },
      { label: '2–3',  min: 2, max: 3  },
      { label: '4–6',  min: 4, max: 6  },
      { label: '7–10', min: 7, max: 10 },
      { label: '>10',  min: 11, max: 9999 },
    ];

    let html = '';
    for (const prog of ['PNS','PTA','USN']) {
      const ep = filteredCases.filter(c => c[prog.toLowerCase()]).map(c => c[prog.toLowerCase()].visitCount || 0);
      if (ep.length === 0) continue;
      const maxCount = Math.max(...buckets.map(b => ep.filter(v => v >= b.min && v <= b.max).length), 1);
      html += `
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">
            ${prog} <span style="font-weight:400;color:var(--gray-400);">(${ep.length})</span>
          </div>
          ${buckets.map(b => {
            const count = ep.filter(v => v >= b.min && v <= b.max).length;
            return `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <div style="width:36px;font-size:10px;color:var(--gray-400);text-align:right;">${b.label}</div>
                <div style="flex:1;background:var(--gray-100);border-radius:2px;height:14px;overflow:hidden;">
                  <div style="width:${count/maxCount*100}%;height:100%;background:${progColors[prog]};opacity:0.8;border-radius:2px;"></div>
                </div>
                <div style="width:22px;font-size:11px;font-weight:700;color:var(--gray-600);text-align:right;">${count}</div>
              </div>`;
          }).join('')}
        </div>`;
    }
    visitsEl.innerHTML = html || noDataHtml();
  }
}

// ── TRAJECTORY FLOW ──

function renderTrajectoryFlow(cases, filters) {
  const el = document.getElementById('trajectory-chart');
  if (!el) return;
  const { range, site, typeIntervention } = filters;

  const filteredCases = cases.filter(c => {
    if (site && c.site !== site) return false;
    if (typeIntervention && c.typeIntervention !== typeIntervention) return false;
    for (const prog of ['pns','pta','usn']) {
      const ep = c[prog];
      if (!ep) continue;
      const ref = ep.admDate || c.regDate;
      if (!ref) continue;
      const d = new Date(ref + 'T00:00:00');
      if (range.start && d < range.start) continue;
      if (range.end   && d > range.end)   continue;
      return true;
    }
    return false;
  });

  const trajCounts = {};
  for (const c of filteredCases) {
    const eps = [];
    for (const prog of ['pns','pta','usn']) {
      const ep = c[prog];
      if (!ep) continue;
      eps.push({ prog: prog.toUpperCase(), admDate: ep.admDate || '', outcome: ep.outcome });
    }
    eps.sort((a, b) => (a.admDate < b.admDate ? -1 : 1));
    if (eps.length === 0) continue;
    const terminal = eps[eps.length - 1].outcome || 'Actif';
    const pathKey  = eps.map(e => e.prog).join('→') + '|' + terminal;
    trajCounts[pathKey] = (trajCounts[pathKey] || 0) + 1;
  }

  const total = Object.values(trajCounts).reduce((s, v) => s + v, 0);
  if (total === 0) { el.innerHTML = noDataHtml(); return; }

  const progColor = { PNS: '#2a7a4b', PTA: '#1a5fa8', USN: '#c8102e' };
  const progBg    = { PNS: 'rgba(42,122,75,0.10)', PTA: 'rgba(26,95,168,0.10)', USN: 'rgba(200,16,46,0.10)' };
  const outColor  = { 'Guéri': '#2a7a4b', 'Abandon': '#b45309', 'Transféré': '#1a5fa8', 'Décédé': '#c8102e', 'Actif': '#6b7280' };
  const outBg     = { 'Guéri': 'rgba(42,122,75,0.10)', 'Abandon': 'rgba(180,83,9,0.10)', 'Transféré': 'rgba(26,95,168,0.10)', 'Décédé': 'rgba(200,16,46,0.10)', 'Actif': 'rgba(107,114,128,0.10)' };

  const groups = { PNS: [], PTA: [], USN: [] };
  for (const [key, count] of Object.entries(trajCounts)) {
    const firstProg = key.split('|')[0].split('→')[0];
    if (groups[firstProg]) groups[firstProg].push([key, count]);
  }

  const maxCount = Math.max(...Object.values(trajCounts));
  const multiProgCount = filteredCases.filter(c => ['pns','pta','usn'].filter(p => c[p]).length > 1).length;

  function node(prog) {
    return `<span style="background:${progBg[prog]};color:${progColor[prog]};border:1.5px solid ${progColor[prog]}55;font-size:10px;font-weight:800;padding:3px 8px;border-radius:10px;letter-spacing:0.05em;white-space:nowrap;">${prog}</span>`;
  }

  function renderRow(key, count) {
    const [pathStr, terminal] = key.split('|');
    const progs  = pathStr.split('→');
    const pct    = Math.round(count / total * 100);
    const barW   = Math.round(count / maxCount * 100);
    const oc     = outColor[terminal] || '#6b7280';
    const ob     = outBg[terminal]    || 'rgba(107,114,128,0.10)';
    const pathHtml = progs.map((p, i) =>
      (i > 0 ? `<span style="color:var(--gray-300);font-size:13px;margin:0 2px;line-height:1;flex-shrink:0;">›</span>` : '') + node(p)
    ).join('');
    const outcomeHtml = `<span style="background:${ob};color:${oc};border:1.5px solid ${oc}55;font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;white-space:nowrap;">${terminal}</span>`;
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;margin-bottom:2px;"
           onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='transparent'">
        <div style="min-width:240px;display:flex;align-items:center;flex-wrap:nowrap;gap:2px;">
          ${pathHtml}
          <span style="color:var(--gray-300);font-size:13px;margin:0 4px;line-height:1;flex-shrink:0;">→</span>
          ${outcomeHtml}
        </div>
        <div style="flex:1;background:var(--gray-100);border-radius:4px;height:14px;overflow:hidden;min-width:60px;">
          <div style="width:${barW}%;height:100%;background:${oc};opacity:0.45;border-radius:4px;"></div>
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--gray-700);white-space:nowrap;min-width:80px;text-align:right;">
          ${count.toLocaleString()} <span style="font-weight:400;color:var(--gray-400);font-size:11px;">(${pct}%)</span>
        </div>
      </div>`;
  }

  let html = `
    <div style="display:flex;gap:28px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--gray-100);">
      <div>
        <div style="font-size:24px;font-weight:800;color:var(--gray-800);line-height:1;">${total.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;">patients</div>
      </div>
      <div>
        <div style="font-size:24px;font-weight:800;color:var(--gray-800);line-height:1;">${Object.keys(trajCounts).length}</div>
        <div style="font-size:10px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;">trajectoires uniques</div>
      </div>
      <div>
        <div style="font-size:24px;font-weight:800;color:var(--blue);line-height:1;">${total > 0 ? Math.round(multiProgCount / total * 100) : 0}%</div>
        <div style="font-size:10px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;">multi-programme</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:0 10px 7px;margin-bottom:4px;border-bottom:1px solid var(--gray-100);">
      <div style="min-width:240px;font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.06em;">Parcours · Path</div>
      <div style="flex:1;"></div>
      <div style="min-width:80px;text-align:right;font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.06em;">Patients</div>
    </div>`;

  for (const startProg of ['PNS','PTA','USN']) {
    const rows = (groups[startProg] || []).sort((a, b) => b[1] - a[1]);
    if (rows.length === 0) continue;
    const groupTotal = rows.reduce((s, [, v]) => s + v, 0);
    html += `
      <div style="padding:8px 10px 3px;margin-top:6px;">
        <span style="font-size:10px;font-weight:800;color:${progColor[startProg]};text-transform:uppercase;letter-spacing:0.08em;">Débute par ${startProg}</span>
        <span style="font-size:10px;color:var(--gray-400);margin-left:8px;">${groupTotal.toLocaleString()} patients · ${Math.round(groupTotal/total*100)}%</span>
      </div>`;
    html += rows.map(([key, count]) => renderRow(key, count)).join('');
  }

  el.innerHTML = html;
}

// ── DATA QUALITY ──

function renderDataQuality(dqReport, episodes) {
  const el = document.getElementById('dq-grid');
  if (!el || !dqReport) return;

  const n = dqReport.totalCases;
  const pct = (v, d) => d > 0 ? Math.round(v / d * 100) : 0;
  const completeness = v => 100 - pct(v, n);

  function dqCard(label, en, value, total, isGood) {
    const rate = total > 0 ? pct(value, total) : 0;
    const color = value === 0 ? 'var(--green)' : isGood ? 'var(--yellow)' : 'var(--pih-red)';
    return `
      <div class="dq-card">
        <div class="dq-card-label">${label}</div>
        <div class="dq-card-sublabel">${en}</div>
        <div class="dq-card-value" style="color:${color};">${value}</div>
        <div class="dq-card-pct">${rate}% des cas / of cases</div>
        ${progressBar(100 - rate, value === 0 ? 'var(--green)' : 'var(--gray-300)')}
      </div>`;
  }

  const missingAdmTotal = (dqReport.missingAdmDate.PNS || 0) + (dqReport.missingAdmDate.PTA || 0) + (dqReport.missingAdmDate.USN || 0);
  const implausibleWtTotal = (dqReport.implausibleWeight.PNS || 0) + (dqReport.implausibleWeight.PTA || 0) + (dqReport.implausibleWeight.USN || 0);
  const implausibleMUACTotal = (dqReport.implausibleMUAC.PNS || 0) + (dqReport.implausibleMUAC.PTA || 0) + (dqReport.implausibleMUAC.USN || 0);

  // Outlier thresholds per program (days): USN ~14-day target, PTA ~8wk, PNS ~12wk
  const LOS_TARGETS = { USN: 21, PTA: 84, PNS: 112 };
  const losOutliers = episodes.filter(ep => ep.losdays !== null && LOS_TARGETS[ep.program] && ep.losdays > LOS_TARGETS[ep.program]);
  const visitOutliers = episodes.filter(ep => (ep.visitCount || 0) > 12);

  el.innerHTML = `
    <div class="dq-grid-inner">
      ${dqCard('Sans fiche d\'enregistrement', 'No registration record', dqReport.noRegistration, n, false)}
      ${dqCard('Site manquant', 'Missing site', dqReport.missingSite, n, false)}
      ${dqCard('Sexe manquant', 'Missing sex', dqReport.missingSex, n, true)}
      ${dqCard('Âge manquant', 'Missing age', dqReport.missingAge, n, true)}
      ${dqCard('Âge aberrant (< 0 ou > 120 mois)', 'Implausible age', dqReport.implausibleAge, n, false)}
      ${dqCard('Date d\'admission manquante', 'Missing admission date', missingAdmTotal, n, false)}
      ${dqCard('Poids aberrant', 'Implausible weight (< 0.5 or > 50 kg)', implausibleWtTotal, n, false)}
      ${dqCard('PB / MUAC aberrant', 'Implausible MUAC (< 5 or > 30 cm)', implausibleMUACTotal, n, false)}
      ${dqCard('Durée séjour > cible', 'LOS exceeds target (USN>21j, PTA>84j, PNS>112j)', losOutliers.length, episodes.length, false)}
      ${dqCard('Visites > 12', 'More than 12 visits before discharge', visitOutliers.length, episodes.length, true)}
    </div>
    <div style="margin-top:18px;">
      <div style="font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;">
        Complétude des résultats (Exeat renseigné) / Outcome completeness (Exeat recorded)
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        ${['PNS','PTA','USN'].map(prog => {
          const rate = dqReport.outcomeCompleteness[prog];
          if (rate === null) return '';
          const color = rate >= 80 ? 'var(--green)' : rate >= 60 ? 'var(--yellow)' : 'var(--pih-red)';
          return `
            <div style="min-width:140px;">
              <div style="font-size:11px;font-weight:700;color:var(--gray-600);margin-bottom:4px;">${prog}</div>
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="flex:1;">${progressBar(rate, color)}</div>
                <span style="font-size:13px;font-weight:700;color:${color};">${rate}%</span>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── CSV EXPORT ──

function exportCSV(rows, filename) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => {
      const v = row[h] === null || row[h] === undefined ? '' : String(row[h]);
      return (v.includes(',') || v.includes('"') || v.includes('\n'))
        ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function episodesToCSV(episodes) {
  return episodes.map(ep => ({
    programme:            ep.program,
    site:                 ep.site || '',
    type_intervention:    ep.typeIntervention || '',
    departement:          ep.dept || '',
    commune:              ep.commune || '',
    sexe:                 ep.sex || '',
    age_mois:             ep.ageMonths !== null ? ep.ageMonths : '',
    allaitement:          ep.breastfeeding || '',
    vaccine:              ep.vaccinated || '',
    date_admission:       ep.admDate || '',
    date_sortie:          ep.exitDate || '',
    resultat:             ep.outcome || 'Actif',
    duree_sejour_jours:   ep.losdays !== null ? ep.losdays : '',
    poids_adm_kg:         ep.admWeight !== null ? ep.admWeight : '',
    poids_sortie_kg:      ep.exitWeight !== null ? ep.exitWeight : '',
    gain_poids_g:         ep.weightGainG !== null ? ep.weightGainG : '',
    nb_visites:           ep.visitCount || '',
    origine:              ep.origine || '',
    pt_admission:         ep.admPT || '',
    muac_admission_cm:    ep.admMUAC !== null ? ep.admMUAC : '',
    oedeme_admission:     ep.admOedema || '',
    supplements_rec:      ep.suppRec || '',
    supplements_livres:   ep.suppDel || '',
  }));
}

function sitePerformanceToCSV(episodes) {
  const sites = [...new Set(episodes.map(e => e.site).filter(Boolean))].sort();
  return sites.map(site => {
    const ep     = episodes.filter(e => e.site === site);
    const exited = ep.filter(e => e.outcome !== null);
    const rec    = ep.filter(e => e.outcome === 'Guéri').length;
    const def    = ep.filter(e => e.outcome === 'Abandon').length;
    const losVals= ep.filter(e => e.losdays !== null).map(e => e.losdays);
    return {
      site,
      admissions_totales:   ep.length,
      sortis:               exited.length,
      gueris:               rec,
      abandons:             def,
      transferes:           ep.filter(e => e.outcome === 'Transféré').length,
      decedes:              ep.filter(e => e.outcome === 'Décédé').length,
      taux_guerison_pct:    exited.length > 0 ? Math.round(rec/exited.length*100) : '',
      duree_sejour_moy_j:   losVals.length ? Math.round(losVals.reduce((a,b)=>a+b,0)/losVals.length) : '',
      pns:                  ep.filter(e => e.program === 'PNS').length,
      pta:                  ep.filter(e => e.program === 'PTA').length,
      usn:                  ep.filter(e => e.program === 'USN').length,
    };
  });
}

// ── REPORT GENERATION ──

function generateReport(dashData, filters, episodes) {
  const { range, site, typeIntervention } = filters;
  const now = new Date();

  const total     = episodes.length;
  const exited    = episodes.filter(e => e.outcome !== null);
  const recovered = exited.filter(e => e.outcome === 'Guéri').length;
  const defaulted = exited.filter(e => e.outcome === 'Abandon').length;
  const deceased  = exited.filter(e => e.outcome === 'Décédé').length;
  const losVals   = episodes.filter(e => e.losdays !== null).map(e => e.losdays);
  const avgLOS    = losVals.length ? Math.round(losVals.reduce((a,b)=>a+b,0)/losVals.length) : null;
  const recoveryRate = exited.length > 0 ? Math.round(recovered/exited.length*100) : null;

  const filterDesc = [
    range.start ? `Du ${range.start.toLocaleDateString('fr-FR')}` : '',
    range.end   ? `au ${range.end.toLocaleDateString('fr-FR')}` : '',
    site ? `Site: ${site}` : '',
    typeIntervention ? `Type: ${typeIntervention}` : '',
  ].filter(Boolean).join(' · ') || 'Toute la période / All time';

  const outRows = ['PNS','PTA','USN'].map(prog => {
    const ep = episodes.filter(e => e.program === prog);
    if (!ep.length) return '';
    const ex  = ep.filter(e => e.outcome !== null);
    const rec = ep.filter(e => e.outcome === 'Guéri').length;
    const def = ep.filter(e => e.outcome === 'Abandon').length;
    const tra = ep.filter(e => e.outcome === 'Transféré').length;
    const dec = ep.filter(e => e.outcome === 'Décédé').length;
    const act = ep.filter(e => e.outcome === null).length;
    const rr  = ex.length > 0 ? Math.round(rec/ex.length*100) : null;
    return `<tr><td><strong>${prog}</strong></td><td>${ep.length}</td>
      <td style="color:#1a7a4a;">${rec}</td><td style="color:#d4820a;">${def}</td>
      <td style="color:#1a5fa8;">${tra}</td><td style="color:#C8102E;">${dec}</td>
      <td>${act}</td><td><strong>${rr !== null ? rr+'%' : '—'}</strong></td></tr>`;
  }).join('');

  const sites = [...new Set(episodes.map(e => e.site).filter(Boolean))].sort();
  const siteRows = sites.map(s => {
    const ep  = episodes.filter(e => e.site === s);
    const ex  = ep.filter(e => e.outcome !== null);
    const rec = ep.filter(e => e.outcome === 'Guéri').length;
    const def = ep.filter(e => e.outcome === 'Abandon').length;
    const los = ep.filter(e => e.losdays !== null).map(e => e.losdays);
    const avg = los.length ? Math.round(los.reduce((a,b)=>a+b,0)/los.length) : null;
    const rr  = ex.length > 0 ? Math.round(rec/ex.length*100) : null;
    const dr  = ex.length > 0 ? Math.round(def/ex.length*100) : null;
    return `<tr><td><strong>${s}</strong></td><td>${ep.length}</td>
      <td style="color:#1a7a4a;">${rr !== null ? rr+'%' : '—'}</td>
      <td style="color:#d4820a;">${dr !== null ? dr+'%' : '—'}</td>
      <td>${avg !== null ? avg+' j' : '—'}</td></tr>`;
  }).join('');

  const dq = dashData.dqReport;
  const pct = (v, d) => d > 0 ? Math.round(v/d*100) : 0;

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>PIH Nutrition — Rapport</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#2e2822;margin:0;padding:32px;}
  h1{font-size:20px;color:#C8102E;margin:0 0 4px;}
  .meta{font-size:11px;color:#9e958a;margin-bottom:24px;}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#9e958a;margin:22px 0 10px;border-top:1px solid #e2ddd7;padding-top:14px;}
  .stat-row{display:flex;gap:16px;margin-bottom:4px;flex-wrap:wrap;}
  .stat{background:#f8f8f7;border-left:4px solid #C8102E;border-radius:6px;padding:10px 14px;min-width:110px;}
  .stat-val{font-size:22px;font-weight:700;}
  .stat-lbl{font-size:10px;color:#9e958a;margin-top:2px;}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px;}
  th{background:#f0ede9;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#9e958a;border-bottom:2px solid #e2ddd7;}
  td{padding:6px 10px;border-bottom:1px solid #f0ede9;}
  .footer{margin-top:28px;font-size:10px;color:#c8c1b8;border-top:1px solid #e2ddd7;padding-top:10px;}
  @media print{button{display:none!important;}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
  <div>
    <h1>PIH Nutrition — Rapport</h1>
    <div class="meta">${filterDesc} &nbsp;·&nbsp; Généré le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
  </div>
  <button onclick="window.print()" style="padding:7px 18px;background:#C8102E;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">⎙ Imprimer</button>
</div>
<div class="stat-row">
  <div class="stat"><div class="stat-val">${total}</div><div class="stat-lbl">Admissions totales</div></div>
  <div class="stat"><div class="stat-val" style="color:#1a7a4a;">${recoveryRate !== null ? recoveryRate+'%' : '—'}</div><div class="stat-lbl">Taux de guérison</div></div>
  <div class="stat"><div class="stat-val" style="color:#d4820a;">${exited.length > 0 ? Math.round(defaulted/exited.length*100)+'%' : '—'}</div><div class="stat-lbl">Taux d'abandon</div></div>
  <div class="stat"><div class="stat-val" style="color:#C8102E;">${exited.length > 0 ? Math.round(deceased/exited.length*100)+'%' : '—'}</div><div class="stat-lbl">Létalité</div></div>
  <div class="stat"><div class="stat-val">${avgLOS !== null ? avgLOS+' j' : '—'}</div><div class="stat-lbl">Durée séjour moy.</div></div>
</div>
<h2>Résultats par programme / Outcomes by program</h2>
<table><thead><tr><th>Programme</th><th>Total</th><th>Guéri</th><th>Abandon</th><th>Transféré</th><th>Décédé</th><th>Actif</th><th>Taux guérison</th></tr></thead>
<tbody>${outRows}</tbody></table>
${sites.length > 0 ? `<h2>Performance par site / Site performance</h2>
<table><thead><tr><th>Site</th><th>Total adm.</th><th>Taux guérison</th><th>Taux abandon</th><th>Durée séjour moy.</th></tr></thead>
<tbody>${siteRows}</tbody></table>` : ''}
<h2>Qualité des données / Data quality (ensemble des données)</h2>
<table><thead><tr><th>Indicateur</th><th>N</th><th>% des cas</th></tr></thead><tbody>
  <tr><td>Sans fiche d'enregistrement</td><td>${dq.noRegistration}</td><td>${pct(dq.noRegistration,dq.totalCases)}%</td></tr>
  <tr><td>Site manquant</td><td>${dq.missingSite}</td><td>${pct(dq.missingSite,dq.totalCases)}%</td></tr>
  <tr><td>Sexe manquant</td><td>${dq.missingSex}</td><td>${pct(dq.missingSex,dq.totalCases)}%</td></tr>
  <tr><td>Âge manquant</td><td>${dq.missingAge}</td><td>${pct(dq.missingAge,dq.totalCases)}%</td></tr>
</tbody></table>
<div class="footer">PIH Nutrition Dashboard &nbsp;·&nbsp; ${dashData.meta.files.join(', ')} &nbsp;·&nbsp; ${dq.totalCases} cas au total</div>
</body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── DATE RANGE CONTROLS ──

function setDateRange(startStr, endStr) {
  document.getElementById('date-start').value = startStr || '';
  document.getElementById('date-end').value   = endStr   || '';
  render();
}

function initDateControls() {
  document.getElementById('date-start').addEventListener('change', () => {
    document.querySelectorAll('.date-quick-btn').forEach(b => b.classList.remove('active'));
    render();
  });
  document.getElementById('date-end').addEventListener('change', () => {
    document.querySelectorAll('.date-quick-btn').forEach(b => b.classList.remove('active'));
    render();
  });

  document.querySelectorAll('.date-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.date-quick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = btn.dataset.days;
      if (days === 'all') {
        setDateRange('', '');
      } else {
        const end   = new Date();
        const start = new Date();
        start.setDate(start.getDate() - parseInt(days, 10));
        setDateRange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
      }
    });
  });

  document.getElementById('filter-site')?.addEventListener('change', render);
  document.getElementById('filter-type')?.addEventListener('change', render);
}

// ── MAIN RENDER ──

let _dashData = null;

function render() {
  if (!_dashData) return;
  const filters  = getFilters();
  const episodes = getFilteredEpisodes(_dashData.cases, filters);

  renderSummaryStats(episodes);
  renderEnrollmentTrend(episodes);
  renderCohortOutcomes(episodes);
  renderProgramFlow(episodes);
  renderSuppGap(_dashData.suppMonthly, filters.range);
  renderLOS(episodes);
  renderGeographic(episodes);
  renderOutcomesTable(episodes);
  renderPTChart(episodes);
  renderWeightGainChart(episodes);
  renderPatientProfiles(episodes);
  renderBreastfeedingVax(episodes);
  renderSitePerformance(episodes);
  renderCarePathway(_dashData.cases, filters);
  renderTrajectoryFlow(_dashData.cases, filters);
  renderDataQuality(_dashData.dqReport, episodes);

  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) exportBtn.onclick = () => exportCSV(episodesToCSV(episodes), 'pih_nutrition_export.csv');

  const outExport = document.getElementById('outcomes-export-btn');
  if (outExport) outExport.onclick = () => exportCSV(episodesToCSV(episodes), 'pih_resultats_par_programme.csv');

  const siteExport = document.getElementById('site-export-btn');
  if (siteExport) siteExport.onclick = () => exportCSV(sitePerformanceToCSV(episodes), 'pih_performance_sites.csv');

  const reportBtn = document.getElementById('report-btn');
  if (reportBtn) reportBtn.onclick = () => generateReport(_dashData, filters, episodes);
}

// ── INIT ──

function init() {
  _dashData = loadDashboardData();

  if (!_dashData) {
    document.getElementById('no-data-banner').style.display = 'block';
    document.getElementById('analytics-content').style.display = 'none';
    return;
  }

  // Show data meta info in date bar
  const { files, caseCount, programCounts, loadedAt } = _dashData.meta;
  document.getElementById('data-meta').innerHTML = [
    `<span>${files.join(', ')}</span>`,
    `<span>${caseCount} cas</span>`,
    `<span>PNS ${programCounts.PNS} · PTA ${programCounts.PTA} · USN ${programCounts.USN}</span>`,
    `<span>chargé ${new Date(loadedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>`,
  ].join('<span style="opacity:0.3;margin:0 2px;">·</span>');

  document.getElementById('analytics-content').style.display = 'block';

  initDateControls();
  populateSiteFilter(_dashData.cases);

  // Default: "All time"
  const allBtn = document.querySelector('.date-quick-btn[data-days="all"]');
  if (allBtn) allBtn.classList.add('active');

  render();
}

document.addEventListener('DOMContentLoaded', init);
