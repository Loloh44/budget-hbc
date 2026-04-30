import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt, fmtDate } from '../lib/utils'

// Mapping automatique Action BasiCompta → action_id
// La colonne "Action" du journal simplifié contient "Buvettes : 500.00 €" ou "Personnel : -200.00 €"
// On extrait le nom avant le ":"
function extractActionName(str) {
  if (!str) return ''
  return str.split(':')[0].trim()
}

export default function Import() {
  const { exerciceId, currentExercice } = useExercice()
  const [actions, setActions] = useState([])
  const [commissions, setCommissions] = useState([])
  const [step, setStep] = useState(1) // 1=upload 2=preview 3=done
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({}) // actionName → action_id
  const [unmapped, setUnmapped] = useState([]) // noms sans correspondance
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
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
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (res) => parseJournal(res.data),
    })
  }

  const parseJournal = (rawRows) => {
    // Trouver la ligne d'en-tête (contient "Date", "Numéro", "Code", "Libellé")
    let headerIdx = -1
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]
      if (row.some(c => c === 'Date' || c === 'Numéro' || c === 'Numéro')) {
        headerIdx = i
        break
      }
    }

    if (headerIdx === -1) {
      alert('Format non reconnu. Le fichier doit être le "Journal simplifié" de BasiCompta.')
      return
    }

    const headers = rawRows[headerIdx].map(h => h?.trim())
    const dateIdx = headers.findIndex(h => h === 'Date')
    const numIdx  = headers.findIndex(h => h === 'Numéro')
    const codeIdx = headers.findIndex(h => h === 'Code')
    const libIdx  = headers.findIndex(h => h === 'Libellé')
    const comIdx  = headers.findIndex(h => h === 'Commentaire')
    const mntIdx  = headers.findIndex(h => h === 'Montant')
    const actIdx  = headers.findIndex(h => h === 'Action')
    const banqIdx = headers.findIndex(h => h === 'Banque')
    const moyIdx  = headers.findIndex(h => h === 'Moyen de paiement')
    const rprIdx  = headers.findIndex(h => h === 'Date de rapprochement')

    const parsed = []
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i]
      const dateRaw = row[dateIdx]
      const montantRaw = row[mntIdx]
      if (!dateRaw || !montantRaw) continue

      // Parse date (format dd/mm/yyyy ou ISO)
      let dateStr = ''
      if (dateRaw.includes('/')) {
        const [d, m, y] = dateRaw.split('/')
        dateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
      } else {
        dateStr = dateRaw.slice(0, 10)
      }

      const montant = parseFloat(String(montantRaw).replace(',', '.').replace(/\s/g, ''))
      if (isNaN(montant)) continue

      // Extraire le nom d'action depuis la colonne Action
      const actionRaw = row[actIdx] || ''
      const actionName = extractActionName(actionRaw)

      parsed.push({
        _id: crypto.randomUUID(),
        date_ecriture: dateStr,
        numero: (row[numIdx] || '').trim(),
        code_comptable: String(row[codeIdx] || '').trim(),
        libelle: (row[libIdx] || '').trim(),
        commentaire: (row[comIdx] || '').trim(),
        montant,
        action_name: actionName,
        action_id: null,
        banque: (row[banqIdx] || '').trim(),
        moyen_paiement: (row[moyIdx] || '').trim(),
        date_rapprochement: (row[rprIdx] || '').slice(0, 10) || null,
      })
    }

    if (parsed.length === 0) {
      alert('Aucune ligne exploitable trouvée dans le fichier.')
      return
    }

    // Auto-mapping
    const autoMapping = {}
    const unmappedNames = new Set()
    parsed.forEach(r => {
      if (!r.action_name) return
      if (autoMapping[r.action_name] !== undefined) return
      // Chercher correspondance exacte sur libelle
      const found = actions.find(a =>
        a.libelle.toLowerCase() === r.action_name.toLowerCase() ||
        a.libelle_complet.toLowerCase().includes(r.action_name.toLowerCase())
      )
      if (found) autoMapping[r.action_name] = found.id
      else unmappedNames.add(r.action_name)
    })

    // Appliquer mapping
    parsed.forEach(r => {
      if (r.action_name && autoMapping[r.action_name]) r.action_id = autoMapping[r.action_name]
    })

    setMapping(autoMapping)
    setUnmapped([...unmappedNames])
    setRows(parsed)
    setStep(2)
  }

  const updateMapping = (name, actionId) => {
    const newMapping = { ...mapping, [name]: actionId }
    setMapping(newMapping)
    setRows(rows.map(r => r.action_name === name ? { ...r, action_id: actionId || null } : r))
    if (actionId) setUnmapped(u => u.filter(n => n !== name))
  }

  const doImport = async () => {
    if (!exerciceId) return
    setImporting(true)
    const batch = `import-${Date.now()}`
    const toInsert = rows.map(r => ({
      exercice_id: exerciceId,
      action_id: r.action_id || null,
      numero: r.numero || null,
      date_ecriture: r.date_ecriture,
      code_comptable: r.code_comptable || null,
      libelle: r.libelle,
      commentaire: r.commentaire || null,
      montant: r.montant,
      banque: r.banque || null,
      moyen_paiement: r.moyen_paiement || null,
      date_rapprochement: r.date_rapprochement || null,
      import_batch: batch,
    }))

    const { data, error } = await supabase.from('budget_ecritures').insert(toInsert).select('id')
    setImporting(false)
    if (error) { alert('Erreur import : ' + error.message); return }
    setResult({ count: data.length, batch, unmappedCount: rows.filter(r => !r.action_id).length })
    setStep(3)
  }

  const reset = () => { setStep(1); setRows([]); setMapping({}); setUnmapped([]); setResult(null) }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Import BasiCompta</h2>
          <p>Journal simplifié CSV → {currentExercice?.libelle}</p>
        </div>
        {step > 1 && <button className="btn btn-outline" onClick={reset}>↺ Recommencer</button>}
      </div>

      <div className="page-body">
        {/* Étape 1 : Upload */}
        {step === 1 && (
          <div className="card">
            <div className="card-body">
              <div className="alert alert-info">
                <strong>Format attendu :</strong> Export "Journal simplifié" depuis BasiCompta (CSV ou XLS exporté en CSV). Colonnes : Date, Numéro, Code, Libellé, Commentaire, Montant, Action, Banque, Moyen de paiement, Date de rapprochement.
              </div>
              <div
                className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileRef.current.click()}
              >
                <div style={{ fontSize: 40 }}>📁</div>
                <p>Glisser-déposer le fichier CSV ici</p>
                <p style={{ fontSize: 12, marginTop: 6 }}>ou cliquer pour parcourir</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              </div>
            </div>
          </div>
        )}

        {/* Étape 2 : Prévisualisation + mapping */}
        {step === 2 && (
          <>
            {/* Mapping des actions non reconnues */}
            {unmapped.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <h3>⚠️ Actions non reconnues ({unmapped.length})</h3>
                  <span className="text-muted">Associer manuellement ou laisser "Non affecté"</span>
                </div>
                <div className="card-body">
                  <div style={{ display: 'grid', gap: 10 }}>
                    {unmapped.map(name => (
                      <div key={name} className="flex gap-2" style={{ alignItems: 'center' }}>
                        <span style={{ minWidth: 200, fontWeight: 500 }}>{name || '(vide)'}</span>
                        <span style={{ color: 'var(--gray400)' }}>→</span>
                        <select
                          style={{ flex: 1, maxWidth: 300 }}
                          value={mapping[name] || ''}
                          onChange={e => updateMapping(name, e.target.value)}
                        >
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
              </div>
            )}

            {/* Aperçu */}
            <div className="card">
              <div className="card-header">
                <h3>Aperçu ({rows.length} lignes)</h3>
                <div className="flex gap-2">
                  <span className="badge badge-green">{rows.filter(r => r.action_id).length} affectées</span>
                  <span className="badge badge-orange">{rows.filter(r => !r.action_id).length} non affectées</span>
                  <button className="btn btn-gold" onClick={doImport} disabled={importing}>
                    {importing ? 'Import en cours…' : `✓ Importer ${rows.length} lignes`}
                  </button>
                </div>
              </div>
              <div className="table-wrap scrollable-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Numéro</th>
                      <th>Libellé</th>
                      <th className="right">Montant</th>
                      <th>Action</th>
                      <th>Banque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const act = actions.find(a => a.id === r.action_id)
                      return (
                        <tr key={r._id}>
                          <td style={{ fontSize: 12 }}>{fmtDate(r.date_ecriture)}</td>
                          <td><span className="numero-badge">{r.numero}</span></td>
                          <td>
                            <div>{r.libelle}</div>
                            {r.commentaire && <div style={{ fontSize: 11, color: 'var(--gray400)' }}>{r.commentaire}</div>}
                          </td>
                          <td className={`right amount ${r.montant > 0 ? 'pos' : 'neg'}`}>{fmt(r.montant)}</td>
                          <td>
                            {act
                              ? <span className="chip">{act.libelle}</span>
                              : r.action_name
                                ? <span className="badge badge-orange">{r.action_name}</span>
                                : <span className="text-muted">—</span>
                            }
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

        {/* Étape 3 : Résultat */}
        {step === 3 && result && (
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--navy)', marginBottom: 8 }}>
                Import réussi !
              </h3>
              <p style={{ color: 'var(--gray600)', marginBottom: 24 }}>
                <strong>{result.count}</strong> écritures importées dans <strong>{currentExercice?.libelle}</strong>
                {result.unmappedCount > 0 && <><br /><span style={{ color: 'var(--orange)' }}>{result.unmappedCount} ligne(s) non affectées à une action</span></>}
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
