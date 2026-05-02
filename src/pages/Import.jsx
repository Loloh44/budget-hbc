import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt, fmtDate } from '../lib/utils'

// ── Helpers parsing ───────────────────────────────────────────

// Date : DD/MM/YYYY, YYYY-MM-DD, ou objet Date Excel
function parseDate(val) {
  if (!val) return null
  // Objet Date natif (xlsx avec cellDates:true)
  if (val instanceof Date) return isNaN(val) ? null : val.toISOString().slice(0, 10)
  // Nombre → serial Excel (ex: 45809) → convertir
  if (typeof val === 'number') {
    try {
      const epoch = new Date(Date.UTC(1899, 11, 30) + val * 86400000)
      return epoch.toISOString().slice(0, 10)
    } catch { return null }
  }
  const s = String(val).split('\n')[0].trim()
  // DD/MM/YYYY
  if (s.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m}-${d}`
  }
  // YYYY-MM-DD (éventuellement avec heure)
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10)
  return null
}

// Montant : nombre natif (xlsx) ou texte "2 158,00 €" (csv)
function parseMontant(val) {
  if (val === null || val === undefined || val === '') return NaN
  if (typeof val === 'number') return val
  const clean = String(val)
    .replace(/\u202f/g, '').replace(/\s/g, '')
    .replace('€', '').replace(',', '.').trim()
  return parseFloat(clean)
}

// Banque / moyen : prendre avant ":" et avant "\n"
function cleanCell(val) {
  if (!val) return null
  return String(val).split('\n')[0].split(':')[0].trim() || null
}

// Action : texte avant ":"
function extractActionName(val) {
  if (!val) return ''
  return String(val).split('\n')[0].split(':')[0].trim()
}

// ── Parser commun (tableau de lignes brutes déjà structurées) ─
function buildRows(data, actions) {
  const parsed = []
  const unmappedSet = new Set()

  data.forEach((row, i) => {
    const dateStr = parseDate(row.date)
    const montant = parseMontant(row.montant)
    if (!dateStr || isNaN(montant)) return

    const actionName = extractActionName(row.action)
    const found = actions.find(a =>
      a.libelle.toLowerCase() === actionName.toLowerCase() ||
      a.libelle_complet.toLowerCase().includes(actionName.toLowerCase())
    )

    if (actionName && !found) unmappedSet.add(actionName)

    parsed.push({
      _id: crypto.randomUUID(),
      date_ecriture: dateStr,
      numero: String(row.numero || '').trim() || null,
      code_comptable: String(row.code || '').trim() || null,
      libelle: String(row.libelle || '').trim(),
      commentaire: String(row.commentaire || '').trim() || null,
      montant,
      action_name: actionName,
      action_id: found?.id || null,
      banque: cleanCell(row.banque),
      moyen_paiement: cleanCell(row.moyen),
      date_rapprochement: parseDate(row.rapprochement),
    })
  })

  return { parsed, unmappedSet }
}

export default function Import() {
  const { exerciceId, currentExercice } = useExercice()
  const [actions, setActions] = useState([])
  const [commissions, setCommissions] = useState([])
  const [step, setStep] = useState(1)
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [unmapped, setUnmapped] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [parseErr, setParseErr] = useState('')
  const fileRef = useRef()

  useEffect(() => { loadReferentiel() }, [])

  const loadReferentiel = async () => {
    const [{ data: comm }, { data: act }] = await Promise.all([
      supabase.from('budget_commissions').select('*').order('ordre'),
      supabase.from('budget_actions').select('*').eq('est_actif', true).order('libelle'),
    ])
    setCommissions(comm || [])
    setActions(act || [])
  }

  const handleFile = (file) => {
    if (!file) return
    setParseErr('')
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext === 'csv' || ext === 'txt') {
      Papa.parse(file, {
        header: false, skipEmptyLines: true, delimiter: ';',
        complete: (res) => parseCSV(res.data),
      })
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => parseXLSX(e.target.result)
      reader.readAsArrayBuffer(file)
    } else {
      setParseErr('Format non supporté. Utilisez un fichier CSV ou Excel (.xlsx).')
    }
  }

  // ── Parser CSV ────────────────────────────────────────────────
  const parseCSV = (rawRows) => {
    let headerIdx = -1
    for (let i = 0; i < rawRows.length; i++) {
      if (rawRows[i].some(c => String(c).trim() === 'Date')) { headerIdx = i; break }
    }
    if (headerIdx === -1) { setParseErr('En-tête "Date" introuvable. Vérifiez le séparateur ";"'); return }

    const headers = rawRows[headerIdx].map(h => String(h || '').trim())
    const col = (name) => headers.findIndex(h => h === name)

    const data = rawRows.slice(headerIdx + 1).map(row => ({
      date: row[col('Date')],
      numero: row[col('Numéro')],
      code: row[col('Code')],
      libelle: row[col('Libellé')],
      commentaire: row[col('Commentaire')],
      montant: row[col('Montant')],
      action: row[col('Action')],
      banque: row[col('Banque')],
      moyen: row[col('Moyen de paiement')],
      rapprochement: row[col('Date de rapprochement')],
    }))

    finalize(data)
  }

  // ── Parser XLSX ───────────────────────────────────────────────
  const parseXLSX = (buffer) => {
    try {
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('journal')) || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

      // Trouver la ligne d'en-tête
      let headerIdx = -1
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] && raw[i].some(c => String(c || '').trim() === 'Date')) { headerIdx = i; break }
      }
      if (headerIdx === -1) { setParseErr('En-tête "Date" introuvable dans le fichier Excel.'); return }

      const headers = raw[headerIdx].map(h => String(h || '').trim())
      const col = (name) => headers.findIndex(h => h === name)

      const data = raw.slice(headerIdx + 1).map(row => ({
        date: row[col('Date')],
        numero: row[col('Numéro')],
        code: row[col('Code')],
        libelle: row[col('Libellé')],
        commentaire: row[col('Commentaire')],
        montant: row[col('Montant')],
        action: row[col('Action')],
        banque: row[col('Banque')],
        moyen: row[col('Moyen de paiement')],
        rapprochement: row[col('Date de rapprochement')],
      }))

      finalize(data)
    } catch (ex) {
      setParseErr('Erreur lecture Excel : ' + ex.message)
    }
  }

  // ── Finalisation commune ─────────────────────────────────────
  const finalize = (data) => {
    const { parsed, unmappedSet } = buildRows(data, actions)

    if (parsed.length === 0) { setParseErr('Aucune ligne exploitable trouvée.'); return }

    // Auto-mapping : noms déjà trouvés dans buildRows, compléter le mapping
    const autoMapping = {}
    parsed.forEach(r => { if (r.action_id && r.action_name) autoMapping[r.action_name] = r.action_id })

    setMapping(autoMapping)
    setUnmapped([...unmappedSet].filter(n => !autoMapping[n]))
    setRows(parsed)
    setStep(2)
  }

  const updateMapping = (name, actionId) => {
    setMapping(m => ({ ...m, [name]: actionId || null }))
    setRows(r => r.map(row => row.action_name === name ? { ...row, action_id: actionId || null } : row))
    if (actionId) setUnmapped(u => u.filter(n => n !== name))
  }

  const doImport = async () => {
    if (!exerciceId) return
    setImporting(true)
    setParseErr('')
    const batch = `import-${Date.now()}`

    // Appliquer le mapping manuel final
    const toInsert = rows.map(r => ({
      exercice_id: exerciceId,
      action_id: (mapping[r.action_name] || r.action_id) || null,
      numero: r.numero,
      date_ecriture: r.date_ecriture,
      code_comptable: r.code_comptable,
      libelle: r.libelle,
      commentaire: r.commentaire,
      montant: r.montant,
      banque: r.banque,
      moyen_paiement: r.moyen_paiement,
      date_rapprochement: r.date_rapprochement,
      import_batch: batch,
    }))

    const { data, error } = await supabase.from('budget_ecritures').insert(toInsert).select('id')
    setImporting(false)
    if (error) { setParseErr('Erreur import : ' + error.message); return }
    setResult({ count: data.length, unmappedCount: rows.filter(r => !(mapping[r.action_name] || r.action_id)).length })
    setStep(3)
  }

  const reset = () => { setStep(1); setRows([]); setMapping({}); setUnmapped([]); setResult(null); setParseErr('') }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Import BasiCompta</h2>
          <p>Journal CSV ou Excel → {currentExercice?.libelle}</p>
        </div>
        {step > 1 && <button className="btn btn-outline" onClick={reset}>↺ Recommencer</button>}
      </div>

      <div className="page-body">

        {step === 1 && (
          <div className="card">
            <div className="card-body">
              <div className="alert alert-info" style={{ marginBottom: 20 }}>
                <strong>Formats acceptés :</strong><br />
                • <strong>CSV</strong> — export "Journal" BasiCompta avec séparateur point-virgule (;)<br />
                • <strong>Excel (.xlsx)</strong> — export "Journal simplifié" BasiCompta<br />
                Colonnes attendues : Date, Numéro, Code, Libellé, Commentaire, Montant, Action, Banque, Moyen de paiement, Date de rapprochement.
              </div>
              {parseErr && <div className="alert alert-error" style={{ marginBottom: 12 }}>{parseErr}</div>}
              <div
                className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileRef.current.click()}
              >
                <div style={{ fontSize: 40 }}>📁</div>
                <p>Glisser-déposer le fichier CSV ou Excel (.xlsx) ici</p>
                <p style={{ fontSize: 12, marginTop: 6 }}>ou cliquer pour parcourir</p>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files[0])} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <>
            {unmapped.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <h3>⚠️ Actions non reconnues ({unmapped.length})</h3>
                  <span className="text-muted">Associer manuellement ou laisser "Non affecté"</span>
                </div>
                <div className="card-body" style={{ display: 'grid', gap: 10 }}>
                  {unmapped.map(name => (
                    <div key={name} className="flex gap-2" style={{ alignItems: 'center' }}>
                      <span style={{ minWidth: 200, fontWeight: 500 }}>{name || '(vide)'}</span>
                      <span style={{ color: 'var(--gray400)' }}>→</span>
                      <select style={{ flex: 1, maxWidth: 300 }} value={mapping[name] || ''}
                        onChange={e => updateMapping(name, e.target.value)}>
                        <option value="">— Non affecté —</option>
                        {commissions.map(c => (
                          <optgroup key={c.id} label={c.libelle}>
                            {actions.filter(a => a.commission_id === c.id).map(a => (
                              <option key={a.id} value={a.id}>{a.libelle}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-header">
                <h3>Aperçu — {rows.length} lignes</h3>
                <div className="flex gap-2">
                  <span className="badge badge-green">{rows.filter(r => r.action_id || mapping[r.action_name]).length} affectées</span>
                  <span className="badge badge-orange">{rows.filter(r => !r.action_id && !mapping[r.action_name]).length} non affectées</span>
                  <button className="btn btn-gold" onClick={doImport} disabled={importing}>
                    {importing ? 'Import…' : `✓ Importer ${rows.length} lignes`}
                  </button>
                </div>
              </div>
              {parseErr && <div className="alert alert-error" style={{ margin: '12px 16px 0' }}>{parseErr}</div>}
              <div className="table-wrap scrollable-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Numéro</th>
                      <th>Libellé / Commentaire</th>
                      <th className="right">Montant</th>
                      <th>Action</th>
                      <th>Banque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const act = actions.find(a => a.id === (mapping[r.action_name] || r.action_id))
                      return (
                        <tr key={r._id}>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(r.date_ecriture)}</td>
                          <td><span className="numero-badge">{r.numero}</span></td>
                          <td>
                            <div>{r.libelle}</div>
                            {r.commentaire && <div style={{ fontSize: 11, color: 'var(--gray400)' }}>{r.commentaire}</div>}
                          </td>
                          <td className={`right amount ${r.montant > 0 ? 'pos' : 'neg'}`}>{fmt(r.montant)}</td>
                          <td>
                            {act ? <span className="chip">{act.libelle}</span>
                              : r.action_name ? <span className="badge badge-orange">{r.action_name}</span>
                              : <span className="text-muted">—</span>}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--gray400)' }}>{r.banque}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {step === 3 && result && (
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--navy)', marginBottom: 8 }}>
                Import réussi !
              </h3>
              <p style={{ color: 'var(--gray600)', marginBottom: 24 }}>
                <strong>{result.count}</strong> écritures importées dans <strong>{currentExercice?.libelle}</strong>
                {result.unmappedCount > 0 && <><br />
                  <span style={{ color: 'var(--orange)' }}>{result.unmappedCount} ligne(s) non affectées à une action</span></>}
              </p>
              <div className="btn-group" style={{ justifyContent: 'center' }}>
                <button className="btn btn-outline" onClick={reset}>Importer un autre fichier</button>
                <a href="#/reel" className="btn btn-primary">Voir les écritures</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
