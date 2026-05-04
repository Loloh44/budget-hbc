import * as XLSX from 'xlsx'

// Couleurs HBC
const NAVY  = '3d1a6e'
const GOLD  = 'c8a84b'
const WHITE = 'ffffff'
const LIGHT = 'ede9f5'
const GREEN = '1a7a4a'
const RED   = 'c0392b'
const GRAY  = 'f5f3f8'

function headerStyle() {
  return {
    font: { bold: true, color: { rgb: WHITE }, sz: 11 },
    fill: { fgColor: { rgb: NAVY } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: GOLD } } }
  }
}

function commStyle() {
  return {
    font: { bold: true, color: { rgb: GOLD }, sz: 11 },
    fill: { fgColor: { rgb: NAVY } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }
}

function totalStyle() {
  return {
    font: { bold: true, color: { rgb: GOLD }, sz: 11 },
    fill: { fgColor: { rgb: NAVY } },
    alignment: { horizontal: 'right', vertical: 'center' },
  }
}

function subtotalStyle() {
  return {
    font: { bold: true, sz: 10 },
    fill: { fgColor: { rgb: LIGHT } },
    alignment: { horizontal: 'right', vertical: 'center' },
  }
}

function amountStyle(val) {
  return {
    font: { sz: 10, color: { rgb: val > 0 ? GREEN : val < 0 ? RED : '000000' } },
    numFmt: '#,##0.00 €',
    alignment: { horizontal: 'right' },
  }
}

function cellStyle() {
  return { font: { sz: 10 }, alignment: { horizontal: 'left', wrapText: false } }
}

function dateStyle() {
  return { font: { sz: 10 }, numFmt: 'dd/mm/yyyy', alignment: { horizontal: 'center' } }
}

function makeCell(v, s) { return { v, s, t: typeof v === 'number' ? 'n' : typeof v === 'object' && v instanceof Date ? 'd' : 's' } }
function amountCell(v) { return { v: v || 0, s: amountStyle(v), t: 'n' } }
function dateCell(v) { return v ? { v: new Date(v), s: dateStyle(), t: 'd' } : { v: '', s: cellStyle(), t: 's' } }

// ─── Export Budget ──────────────────────────────────────────────
export function exportBudgetXLSX(lignes, exerciceCode, versionLibelle) {
  const wb = XLSX.utils.book_new()
  const ws = {}
  const cols = ['Date', 'Commission', 'Action', 'Libellé', 'Commentaire', 'Montant', 'Compte']
  let r = 0

  // Titre
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: `Budget HBC La Fillière — ${exerciceCode} — ${versionLibelle}`, s: { font: { bold: true, sz: 13, color: { rgb: NAVY } } }, t: 's' }
  r += 2

  // En-têtes
  cols.forEach((h, c) => { ws[XLSX.utils.encode_cell({ r, c })] = { v: h, s: headerStyle(), t: 's' } })
  r++

  // Grouper par commission
  const grouped = {}
  lignes.forEach(l => {
    const k = l.budget_actions?.budget_commissions?.libelle || 'Autre'
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(l)
  })

  Object.entries(grouped).forEach(([comm, rows]) => {
    const tot = rows.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
    // Ligne commission
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: `${comm}`, s: commStyle(), t: 's' }
    for (let c = 1; c < 5; c++) ws[XLSX.utils.encode_cell({ r, c })] = { v: '', s: commStyle(), t: 's' }
    ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: tot, s: { ...totalStyle(), numFmt: '#,##0.00 €' }, t: 'n' }
    ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: '', s: commStyle(), t: 's' }
    r++

    rows.forEach(l => {
      ws[XLSX.utils.encode_cell({ r, c: 0 })] = dateCell(l.date_prevue)
      ws[XLSX.utils.encode_cell({ r, c: 1 })] = makeCell(l.budget_actions?.budget_commissions?.libelle || '', cellStyle())
      ws[XLSX.utils.encode_cell({ r, c: 2 })] = makeCell(l.budget_actions?.libelle || '', cellStyle())
      ws[XLSX.utils.encode_cell({ r, c: 3 })] = makeCell(l.libelle || '', cellStyle())
      ws[XLSX.utils.encode_cell({ r, c: 4 })] = makeCell(l.commentaire || '', cellStyle())
      ws[XLSX.utils.encode_cell({ r, c: 5 })] = amountCell(parseFloat(l.montant))
      ws[XLSX.utils.encode_cell({ r, c: 6 })] = makeCell(l.compte_comptable || '', cellStyle())
      r++
    })

    // Sous-total
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: `Total ${comm}`, s: subtotalStyle(), t: 's' }
    for (let c = 1; c < 5; c++) ws[XLSX.utils.encode_cell({ r, c })] = { v: '', s: subtotalStyle(), t: 's' }
    ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: tot, s: { ...subtotalStyle(), numFmt: '#,##0.00 €' }, t: 'n' }
    ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: '', s: subtotalStyle(), t: 's' }
    r++
  })

  // Total général
  const total = lignes.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: 'TOTAL GÉNÉRAL', s: totalStyle(), t: 's' }
  for (let c = 1; c < 5; c++) ws[XLSX.utils.encode_cell({ r, c })] = { v: '', s: totalStyle(), t: 's' }
  ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: total, s: { ...totalStyle(), numFmt: '#,##0.00 €' }, t: 'n' }
  ws[XLSX.utils.encode_cell({ r, c: 6 })] = { v: '', s: totalStyle(), t: 's' }

  ws['!ref'] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r, c: 6 })
  ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 38 }, { wch: 30 }, { wch: 14 }, { wch: 8 }]
  ws['!rows'] = Array(r + 1).fill({ hpt: 18 })

  XLSX.utils.book_append_sheet(wb, ws, 'Budget')
  XLSX.writeFile(wb, `Budget-${exerciceCode}-${versionLibelle}.xlsx`)
}

// ─── Export Réel ────────────────────────────────────────────────
export function exportReelXLSX(ecritures, exerciceCode) {
  const wb = XLSX.utils.book_new()
  const ws = {}
  const cols = ['Date', 'Numéro', 'Code', 'Libellé', 'Commentaire', 'Montant', 'Action', 'Banque', 'Moyen paiement']
  let r = 0

  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: `Écritures réelles HBC La Fillière — ${exerciceCode}`, s: { font: { bold: true, sz: 13, color: { rgb: NAVY } } }, t: 's' }
  r += 2

  cols.forEach((h, c) => { ws[XLSX.utils.encode_cell({ r, c })] = { v: h, s: headerStyle(), t: 's' } })
  r++

  // Grouper par mois
  const grouped = {}
  ecritures.forEach(e => {
    const mois = e.date_ecriture?.slice(0, 7) || 'Inconnu'
    if (!grouped[mois]) grouped[mois] = []
    grouped[mois].push(e)
  })

  Object.entries(grouped).sort().forEach(([mois, rows]) => {
    const tot = rows.reduce((s, e) => s + parseFloat(e.montant || 0), 0)
    const label = mois !== 'Inconnu'
      ? new Date(mois + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : 'Inconnu'

    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: label, s: commStyle(), t: 's' }
    for (let c = 1; c < 8; c++) ws[XLSX.utils.encode_cell({ r, c })] = { v: '', s: commStyle(), t: 's' }
    ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: tot, s: { ...totalStyle(), numFmt: '#,##0.00 €' }, t: 'n' }
    r++

    rows.forEach(e => {
      ws[XLSX.utils.encode_cell({ r, c: 0 })] = dateCell(e.date_ecriture)
      ws[XLSX.utils.encode_cell({ r, c: 1 })] = makeCell(e.numero || '', { ...cellStyle(), font: { sz: 10, name: 'Courier New' } })
      ws[XLSX.utils.encode_cell({ r, c: 2 })] = makeCell(e.code_comptable || '', cellStyle())
      ws[XLSX.utils.encode_cell({ r, c: 3 })] = makeCell(e.libelle || '', cellStyle())
      ws[XLSX.utils.encode_cell({ r, c: 4 })] = makeCell(e.commentaire || '', cellStyle())
      ws[XLSX.utils.encode_cell({ r, c: 5 })] = amountCell(parseFloat(e.montant))
      ws[XLSX.utils.encode_cell({ r, c: 6 })] = makeCell(e.budget_actions?.libelle || '', cellStyle())
      ws[XLSX.utils.encode_cell({ r, c: 7 })] = makeCell(e.banque || '', cellStyle())
      ws[XLSX.utils.encode_cell({ r, c: 8 })] = makeCell(e.moyen_paiement || '', cellStyle())
      r++
    })

    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: `Total ${label}`, s: subtotalStyle(), t: 's' }
    for (let c = 1; c < 5; c++) ws[XLSX.utils.encode_cell({ r, c })] = { v: '', s: subtotalStyle(), t: 's' }
    ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: tot, s: { ...subtotalStyle(), numFmt: '#,##0.00 €' }, t: 'n' }
    for (let c = 6; c < 9; c++) ws[XLSX.utils.encode_cell({ r, c })] = { v: '', s: subtotalStyle(), t: 's' }
    r++
  })

  const total = ecritures.reduce((s, e) => s + parseFloat(e.montant || 0), 0)
  ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: 'TOTAL GÉNÉRAL', s: totalStyle(), t: 's' }
  for (let c = 1; c < 5; c++) ws[XLSX.utils.encode_cell({ r, c })] = { v: '', s: totalStyle(), t: 's' }
  ws[XLSX.utils.encode_cell({ r, c: 5 })] = { v: total, s: { ...totalStyle(), numFmt: '#,##0.00 €' }, t: 'n' }
  for (let c = 6; c < 9; c++) ws[XLSX.utils.encode_cell({ r, c })] = { v: '', s: totalStyle(), t: 's' }

  ws['!ref'] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r, c: 8 })
  ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 6 }, { wch: 38 }, { wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 24 }, { wch: 16 }]

  XLSX.utils.book_append_sheet(wb, ws, 'Réel')
  XLSX.writeFile(wb, `Reel-${exerciceCode}.xlsx`)
}
