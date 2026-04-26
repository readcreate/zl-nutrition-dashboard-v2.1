// ── PIH NUTRITION DASHBOARD — DATA PARSER ──
// Parses CommCare .xlsx raw-data exports and builds the compact dashboard data model.
// Requires SheetJS (XLSX global) to be loaded before this script.

const SHEET_NAMES = {
  enregistrement: 'Enregistrement',
  visiteUSN:      'Visite USN',
  exeatUSN:       'Exeat USN',
  visitePTA:      'Visite PTA',
  exeatPTA:       'Exeat PTA',
  visitePNS:      'Visite PNS',
  exeatPNS:       'Exeat PNS',
  dictionnaire:   'Dictionnaire',
};

// ── LOW-LEVEL HELPERS ──

function norm(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return (s === '' || s === '---') ? null : s;
}

function parseDate(val) {
  const s = norm(val);
  if (!s) return null;
  const d = new Date(s.length > 10 ? s : s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function monthKey(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 7);
}

function dateStr(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function parseNum(val) {
  const s = norm(val);
  if (!s) return null;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? null : n;
}

// ── DICTIONNAIRE LOOKUP ──

function buildDictLookup(dicRows) {
  const lookup = {};
  let currentQ = null;
  for (const row of (dicRows || [])) {
    const q = norm(row['Questions']);
    if (q) currentQ = q;
    const code = norm(row['Code']);
    const lib  = norm(row['Libelles']);
    if (currentQ && code !== null && lib !== null) {
      if (!lookup[currentQ]) lookup[currentQ] = {};
      lookup[currentQ][code] = lib;
    }
  }
  return lookup;
}

function decodeOedema(val, lookup) {
  const s = norm(val);
  if (!s) return null;
  const map = lookup['Oedème'] || lookup['Oedeme'] || { '1':'+','2':'++','3':'+++','4':'-' };
  return map[s] || s;
}

function decodePT(val, lookup) {
  const s = norm(val);
  if (!s) return null;
  const map = lookup['P/T'] || lookup['PT'] || {};
  return map[s] || s;
}

function normalizeTypeIntervention(val) {
  if (!val) return null;
  const s = val.toLowerCase();
  if (s.includes('communaut')) return 'Communautaire';
  if (s.includes('instit') || s.includes('hospit') || s.includes('facility')) return 'Institutionnel';
  return val;
}

function normalizeOutcome(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('guéri') || s.includes('gueri') || s.includes('cured'))  return 'Guéri';
  if (s.includes('abandon') || s.includes('default'))                      return 'Abandon';
  if (s.includes('transf'))                                                 return 'Transféré';
  if (s.includes('décé') || s.includes('dece') || s.includes('mort') ||
      s.includes('death') || s.includes('died'))                           return 'Décédé';
  return raw;
}

// ── WORKBOOK PARSING ──

function parseWorkbookSheets(wb) {
  const sheets = {};
  for (const [key, name] of Object.entries(SHEET_NAMES)) {
    sheets[key] = wb.Sheets[name]
      ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: false })
      : [];
  }
  return sheets;
}

function isRawWorkbook(wb) {
  return wb.SheetNames.some(n =>
    ['Dictionnaire', 'Enregistrement', 'Visite PNS', 'Visite PTA', 'Visite USN'].includes(n)
  );
}

// ── MERGE MULTIPLE FILES (deduplicate by formid) ──

function mergeSheetSets(sheetSets) {
  const merged = {};
  for (const key of Object.keys(SHEET_NAMES)) {
    const seen = new Set();
    merged[key] = [];
    for (const sheets of sheetSets) {
      for (const row of (sheets[key] || [])) {
        const cid  = norm(row['form.case.@case_id']) || '';
        const time = norm(row['completed_time']) || norm(row['received_on']) || '';
        const id   = norm(row['formid']) || (cid + '|' + time) || JSON.stringify(row).slice(0, 100);
        if (!seen.has(id)) {
          seen.add(id);
          merged[key].push(row);
        }
      }
    }
  }
  return merged;
}

// ── EPISODE BUILDERS ──

function buildPNSEpisode(visits, exeat, lookup) {
  if (!visits || visits.length === 0) return null;

  const admV = visits.find(v => {
    const t = norm(v['Type de visite']);
    return t && t.toLowerCase().includes('admission');
  }) || visits[0];

  const admDate  = parseDate(norm(admV['form.date_admission_pns']) || norm(admV['Date de visite']));
  const exitDate = exeat ? parseDate(norm(exeat["Date de l'exeat"])) : null;
  const outcome  = exeat ? normalizeOutcome(norm(exeat['Exeat'])) : null;
  const losRaw   = exeat ? parseNum(norm(exeat['Duree de sejour'])) : null;

  const admWeight  = parseNum(norm(admV['form.psn.poids_adm_pns'])) || parseNum(norm(admV['Poids']));
  const exitWeight = exeat ? parseNum(norm(exeat['Poids'])) : null;
  const wgG = (admWeight && exitWeight) ? Math.round((exitWeight - admWeight) * 1000) : null;

  let suppRec = 0, suppDel = 0;
  for (const v of visits) {
    suppRec += parseNum(norm(v['Quantite de supplements recomendes'])) || 0;
    suppDel += parseNum(norm(v['Quantite de supplements livrees']))    || 0;
  }

  const visitData = visits
    .map(v => ({
      date:   dateStr(parseDate(norm(v['Date de visite']))),
      weight: parseNum(norm(v['Poids'])),
      muac:   parseNum(norm(v['PB'])),
    }))
    .filter(v => v.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((v, i) => ({ ...v, visitNum: i + 1 }));

  return {
    admDate:     dateStr(admDate),
    exitDate:    dateStr(exitDate),
    outcome,
    losdays:     losRaw ? Math.round(losRaw)
                        : (admDate && exitDate ? Math.round((exitDate - admDate) / 86400000) : null),
    admWeight,
    exitWeight,
    weightGainG: wgG,
    visitCount:  visits.length,
    origine:     norm(admV['Origine']),
    admOedema:   null,
    admPT:       decodePT(norm(admV['PT']), lookup),
    admMUAC:     parseNum(norm(admV['PB'])),
    suppRec:     Math.round(suppRec),
    suppDel:     Math.round(suppDel),
    visits:      visitData,
  };
}

function buildPTAEpisode(visits, exeat, lookup) {
  if (!visits || visits.length === 0) return null;

  const admV = visits.find(v => {
    const t = norm(v['Type de Visite']);
    return t && t.toLowerCase().includes('admission');
  }) || visits[0];

  const admDate  = parseDate(norm(admV['form.pta.date_admission_pta']) || norm(admV['Date de Visite']));
  const exitDate = exeat ? parseDate(norm(exeat['Date de sortie'])) : null;
  const outcome  = exeat ? normalizeOutcome(norm(exeat['Exeat'])) : null;
  const losRaw   = exeat ? parseNum(norm(exeat['Duree_de_sejour'])) : null;

  const admWeight  = parseNum(norm(admV['form.pta.poids_adm_pta'])) || parseNum(norm(admV['Poids']));
  const exitWeight = exeat ? parseNum(norm(exeat['Poids'])) : null;
  const wgG = (admWeight && exitWeight) ? Math.round((exitWeight - admWeight) * 1000) : null;

  let suppRec = 0, suppDel = 0;
  for (const v of visits) {
    suppRec += parseNum(norm(v['Quantite de supplements recomendes'])) || 0;
    suppDel += parseNum(norm(v['Quantite de supplements livrees']))    || 0;
  }

  const visitData = visits
    .map(v => ({
      date:   dateStr(parseDate(norm(v['Date de Visite']))),
      weight: parseNum(norm(v['Poids'])),
      muac:   parseNum(norm(v['MUAC'])),
    }))
    .filter(v => v.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((v, i) => ({ ...v, visitNum: i + 1 }));

  return {
    admDate:     dateStr(admDate),
    exitDate:    dateStr(exitDate),
    outcome,
    losdays:     losRaw ? Math.round(losRaw)
                        : (admDate && exitDate ? Math.round((exitDate - admDate) / 86400000) : null),
    admWeight,
    exitWeight,
    weightGainG: wgG,
    visitCount:  visits.length,
    origine:     norm(admV['Origine']),
    admOedema:   decodeOedema(norm(admV['Oedeme']), lookup),
    admPT:       decodePT(norm(admV['PT']), lookup),
    admMUAC:     parseNum(norm(admV['MUAC'])),
    suppRec:     Math.round(suppRec),
    suppDel:     Math.round(suppDel),
    visits:      visitData,
  };
}

function buildUSNEpisode(visits, exeat, lookup) {
  if (!visits || visits.length === 0) return null;

  const admV = visits.find(v => {
    const t = norm(v['Type de Visite']);
    return t && t.toLowerCase().includes('admission');
  }) || visits[0];

  const admDate  = parseDate(
    norm(admV["Date  d'admission en USN"]) ||
    norm(admV["Date d'admission en USN"])  ||
    norm(admV['Date de visite'])
  );
  const exitDate = exeat ? parseDate(norm(exeat['form.date_de_sortie'])) : null;
  const outcome  = exeat ? normalizeOutcome(norm(exeat['form.copy-1-of-sortie.exeat'])) : null;
  const losRaw   = exeat ? parseNum(norm(exeat['Duree_de_sejour'])) : null;

  const admWeight  = parseNum(norm(admV["Poids a l'admission"])) || parseNum(norm(admV['Poids']));
  const exitWeight = exeat ? parseNum(norm(exeat['Poids en kg'])) : null;
  const wgG = (admWeight && exitWeight) ? Math.round((exitWeight - admWeight) * 1000) : null;

  let suppRec = 0, suppDel = 0;
  for (const v of visits) {
    suppRec += parseNum(norm(v['form.Quantite_de_supplements_recomendes'])) || 0;
    suppDel += parseNum(norm(v['form.quantite_de_supplements_livrees']))    || 0;
  }

  const visitData = visits
    .map(v => ({
      date:   dateStr(parseDate(norm(v['Date de visite']))),
      weight: parseNum(norm(v['Poids'])),
      muac:   parseNum(norm(v['Perimetre Bracial'])),
    }))
    .filter(v => v.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((v, i) => ({ ...v, visitNum: i + 1 }));

  return {
    admDate:     dateStr(admDate),
    exitDate:    dateStr(exitDate),
    outcome,
    losdays:     losRaw ? Math.round(losRaw)
                        : (admDate && exitDate ? Math.round((exitDate - admDate) / 86400000) : null),
    admWeight,
    exitWeight,
    weightGainG: wgG,
    visitCount:  visits.length,
    origine:     norm(admV['Origine']),
    admOedema:   decodeOedema(norm(admV['Oedeme']), lookup),
    admPT:       decodePT(norm(admV['P/T']), lookup),
    admMUAC:     parseNum(norm(admV['Perimetre Bracial'])),
    suppRec:     Math.round(suppRec),
    suppDel:     Math.round(suppDel),
    visits:      visitData,
  };
}

// ── SUPPLEMENT MONTHLY AGGREGATES ──

function buildSuppMonthly(sheets) {
  const configs = [
    { prog: 'PNS', rows: sheets.visitePNS, dateCol: 'Date de visite',
      recCol: 'Quantite de supplements recomendes', delCol: 'Quantite de supplements livrees' },
    { prog: 'PTA', rows: sheets.visitePTA, dateCol: 'Date de Visite',
      recCol: 'Quantite de supplements recomendes', delCol: 'Quantite de supplements livrees' },
    { prog: 'USN', rows: sheets.visiteUSN, dateCol: 'Date de visite',
      recCol: 'form.Quantite_de_supplements_recomendes', delCol: 'form.quantite_de_supplements_livrees' },
  ];

  const result = [];
  for (const { prog, rows, dateCol, recCol, delCol } of configs) {
    const byMonth = {};
    for (const row of (rows || [])) {
      const mk = monthKey(parseDate(norm(row[dateCol])));
      if (!mk) continue;
      const rec = parseNum(norm(row[recCol])) || 0;
      const del = parseNum(norm(row[delCol])) || 0;
      if (!byMonth[mk]) byMonth[mk] = { rec: 0, del: 0, visits: 0 };
      byMonth[mk].rec    += rec;
      byMonth[mk].del    += del;
      byMonth[mk].visits += 1;
    }
    for (const [month, vals] of Object.entries(byMonth)) {
      result.push({ month, program: prog, ...vals });
    }
  }
  result.sort((a, b) => a.month.localeCompare(b.month));
  return result;
}

// ── MAIN DATA MODEL BUILDER ──

function buildDashboardData(sheetSets, fileNames) {
  const merged = mergeSheetSets(sheetSets);
  const lookup = buildDictLookup(merged.dictionnaire);

  // Index exeats by case_id
  const exeats = { PNS: {}, PTA: {}, USN: {} };
  for (const row of merged.exeatPNS) {
    const id = norm(row['form.case.@case_id']);
    if (id) exeats.PNS[id] = row;
  }
  for (const row of merged.exeatPTA) {
    const id = norm(row['form.case.@case_id']);
    if (id) exeats.PTA[id] = row;
  }
  for (const row of merged.exeatUSN) {
    const id = norm(row['form.case.@case_id']);
    if (id) exeats.USN[id] = row;
  }

  // Group visits by case_id per program
  const visits = { PNS: {}, PTA: {}, USN: {} };
  for (const row of merged.visitePNS) {
    const id = norm(row['form.case.@case_id']);
    if (id) { if (!visits.PNS[id]) visits.PNS[id] = []; visits.PNS[id].push(row); }
  }
  for (const row of merged.visitePTA) {
    const id = norm(row['form.case.@case_id']);
    if (id) { if (!visits.PTA[id]) visits.PTA[id] = []; visits.PTA[id].push(row); }
  }
  for (const row of merged.visiteUSN) {
    const id = norm(row['form.case.@case_id']);
    if (id) { if (!visits.USN[id]) visits.USN[id] = []; visits.USN[id].push(row); }
  }

  // Collect all case IDs
  const allIds = new Set();
  for (const row of merged.enregistrement) {
    const id = norm(row['form.case.@case_id']); if (id) allIds.add(id);
  }
  for (const prog of ['PNS', 'PTA', 'USN']) {
    for (const id of Object.keys(visits[prog])) allIds.add(id);
  }

  // Registration index
  const regById = {};
  for (const row of merged.enregistrement) {
    const id = norm(row['form.case.@case_id']); if (id) regById[id] = row;
  }

  // Build cases
  const cases = [];
  for (const id of allIds) {
    const reg = regById[id];
    const pns = buildPNSEpisode(visits.PNS[id], exeats.PNS[id], lookup);
    const pta = buildPTAEpisode(visits.PTA[id], exeats.PTA[id], lookup);
    const usn = buildUSNEpisode(visits.USN[id], exeats.USN[id], lookup);
    if (!pns && !pta && !usn) continue;

    const ageMonths = reg ? parseNum(norm(reg['Age en mois'])) : null;

    // Data quality flags per case
    const dqFlags = [];
    if (!reg)                                          dqFlags.push('no_registration');
    if (!reg || !norm(reg['Sites']))                   dqFlags.push('missing_site');
    if (!reg || !norm(reg['Sexe']))                    dqFlags.push('missing_sex');
    if (ageMonths === null)                            dqFlags.push('missing_age');
    if (ageMonths !== null && (ageMonths < 0 || ageMonths > 120)) dqFlags.push('implausible_age');
    for (const [prog, ep] of [['PNS', pns], ['PTA', pta], ['USN', usn]]) {
      if (!ep) continue;
      if (!ep.admDate)                               dqFlags.push(`missing_adm_date_${prog}`);
      if (ep.admWeight !== null && (ep.admWeight < 0.5 || ep.admWeight > 50)) dqFlags.push(`implausible_weight_${prog}`);
      if (ep.admMUAC   !== null && (ep.admMUAC < 5   || ep.admMUAC > 30))   dqFlags.push(`implausible_muac_${prog}`);
    }

    cases.push({
      id,
      regDate:      reg ? dateStr(parseDate(norm(reg["Date d'enregistrement"]))) : null,
      site:             reg ? norm(reg['Sites'])       : null,
      dept:             reg ? norm(reg['Departement']) : null,
      commune:          reg ? norm(reg['Commune'])     : null,
      section:          reg ? norm(reg['Section'])     : null,
      sex:              reg ? norm(reg['Sexe'])        : null,
      ageMonths,
      typeIntervention: reg ? normalizeTypeIntervention(norm(reg["Type d'intervention"])) : null,
      breastfeeding:    reg ? norm(reg["Type d'allaitement"]) : null,
      vaccinated:       reg ? norm(reg['Enfant Completement Vaccine']) : null,
      pns,
      pta,
      usn,
      dqFlags,
    });
  }

  // ── DATA QUALITY SUMMARY ──
  const totalCases = cases.length;
  const dqReport = {
    totalCases,
    noRegistration:   cases.filter(c => c.dqFlags.includes('no_registration')).length,
    missingSite:      cases.filter(c => c.dqFlags.includes('missing_site')).length,
    missingSex:       cases.filter(c => c.dqFlags.includes('missing_sex')).length,
    missingAge:       cases.filter(c => c.dqFlags.includes('missing_age')).length,
    implausibleAge:   cases.filter(c => c.dqFlags.includes('implausible_age')).length,
    missingAdmDate: {
      PNS: cases.filter(c => c.dqFlags.includes('missing_adm_date_PNS')).length,
      PTA: cases.filter(c => c.dqFlags.includes('missing_adm_date_PTA')).length,
      USN: cases.filter(c => c.dqFlags.includes('missing_adm_date_USN')).length,
    },
    implausibleWeight: {
      PNS: cases.filter(c => c.dqFlags.includes('implausible_weight_PNS')).length,
      PTA: cases.filter(c => c.dqFlags.includes('implausible_weight_PTA')).length,
      USN: cases.filter(c => c.dqFlags.includes('implausible_weight_USN')).length,
    },
    implausibleMUAC: {
      PNS: cases.filter(c => c.dqFlags.includes('implausible_muac_PNS')).length,
      PTA: cases.filter(c => c.dqFlags.includes('implausible_muac_PTA')).length,
      USN: cases.filter(c => c.dqFlags.includes('implausible_muac_USN')).length,
    },
    outcomeCompleteness: {
      PNS: (() => { const ep = cases.filter(c => c.pns); return ep.length > 0 ? Math.round(ep.filter(c => c.pns.outcome).length / ep.length * 100) : null; })(),
      PTA: (() => { const ep = cases.filter(c => c.pta); return ep.length > 0 ? Math.round(ep.filter(c => c.pta.outcome).length / ep.length * 100) : null; })(),
      USN: (() => { const ep = cases.filter(c => c.usn); return ep.length > 0 ? Math.round(ep.filter(c => c.usn.outcome).length / ep.length * 100) : null; })(),
    },
  };

  return {
    meta: {
      files: fileNames,
      loadedAt: new Date().toISOString(),
      caseCount: cases.length,
      programCounts: {
        PNS: cases.filter(c => c.pns).length,
        PTA: cases.filter(c => c.pta).length,
        USN: cases.filter(c => c.usn).length,
      },
    },
    cases,
    suppMonthly: buildSuppMonthly(merged),
    dqReport,
  };
}

// ── ENTRY POINT ──

async function parseFiles(fileList) {
  const sheetSets = [];
  const fileNames = [];

  for (const file of fileList) {
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array', cellDates: false });
    if (!isRawWorkbook(wb)) {
      throw new Error(
        `"${file.name}" ne contient pas les feuilles attendues (Enregistrement, Visite PNS, etc.).`
      );
    }
    sheetSets.push(parseWorkbookSheets(wb));
    fileNames.push(file.name);
  }

  return buildDashboardData(sheetSets, fileNames);
}
