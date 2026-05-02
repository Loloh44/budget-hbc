import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt } from '../lib/utils'

export default function ImportExcel() {
  const { exerciceId, currentExercice } = useExercice()
  const [versions, setVersions] = useState([])
  const [versionId, setVersionId] = useState('')
  const [newVersionLibelle, setNewVersionLibelle] = useState('')
  const [useNewVersion, setUseNewVersion] = useState(true)
  const [actions, setActions] = useState([])
  const [step, setStep] = useState(1)
  const [rows, setRows] = useState([])
  const [unmapped, setUnmapped] = useState([])
  const [mapping, setMapping] = useState({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef()

  useEffect(() => { loadRefs() }, [exerciceId])

  const loadRefs = async () => {
    if (!exerciceId) return
    const [{ data: v }, { data: a }] = await Promise.all([
      supabase.from('budget_versions').select('*').eq('exercice_id', exerciceId).order('ordre'),
      supabase.from('budget_actions').select('*').eq('est_actif', true).order('libelle'),
    ])
    setVersions(v || [])
    setActions(a || [])
    const ref = v?.find(x => x.est_reference) || v?.[0]
    if (ref) setVersionId(ref.id)
  }

  const handleFile = (file) => {
    if (!file) return
    setErr('')
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        // Chercher la feuille "Base"
        const sheetName = wb.SheetNames.find(n => n === 'Base') || wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: null })
        parseBase(raw)
      } catch (ex) {
        setErr('Erreur lecture fichier : ' + ex.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const parseBase = (raw) => {
    // Colonnes attendues : Date, Libellé, Commentaire, Montant, Action, Budget/Reel, Commission, Type, Compte
    const parsed = []
    const unmappedSet = new Set()

    raw.forEach((row, i) => {
      const montant = parseFloat(row['Montant'])
      const libelle = (row['Libellé'] || '').trim()
      const actionRaw = (row['Action'] || '').trim()
      const budgetReel = (row['Budget/Reel'] || '').trim()

      // Ignorer lignes vides ou sans montant
      if (!libelle || isNaN(montant) || montant === 0) return
      // On importe uniquement Budget (pas Reel, déjà dans BasiCompta)
      if (budgetReel && budgetReel.toLowerCase() === 'reel') return

      // Parser la date
      let dateStr = null
      if (row['Date']) {
        const d = row['Date'] instanceof Date ? row['Date'] : new Date(row['Date'])
        if (!isNaN(d)) dateStr = d.toISOString().slice(0, 10)
      }

      // Trouver l'action correspondante
      const found = actions.find(a =>
        a.libelle_complet?.toLowerCase() === actionRaw.toLowerCase() ||
        a.libelle?.toLowerCase() === actionRaw.split('/').pop().trim().toLowerCase()
      )
      const actionId = found?.id || null
      if (actionRaw && !found) unmappedSet.add(actionRaw)

      parsed.push({
        _key: i,
        date_prevue: dateStr,
        libelle,
        commentaire: (row['Commentaire'] || '').trim() || null,
        montant,
        action_name: actionRaw,
        action_id: actionId,
        compte_comptable: row['Compte'] ? String(row['Compte']).split('.')[0] : null,
      })
    })

    if (parsed.length === 0) {
      setErr('Aucune ligne Budget exploitable trouvée. Vérifiez que vous utilisez la feuille "Base".')
      return
    }

    // Auto-mapping initial
    const autoMap = {}
    parsed.forEach(r => {
      if (r.action_id && r.action_name) autoMap[r.action_name] = r.action_id
    })

    setRows(parsed)
    setMapping(autoMap)
    setUnmapped([...unmappedSet].filter(n => !autoMap[n]))
    setStep(2)
  }

  const updateMapping = (name, actionId) => {
    const m = { ...mapping, [name]: actionId || null }
    setMapping(m)
    setRows(rows.map(r => r.action_name === name ? { ...r, action_id: actionId || null } : r))
    if (actionId) setUnmapped(u => u.filter(n => n !== name))
  }

  const doImport = async () => {
    if (!exerciceId) return
    if (useNewVersion && !newVersionLibelle.trim()) { setErr('Saisissez un nom pour la nouvelle version'); return }
    setImporting(true); setErr('')

    let targetVersionId = versionId

    // Créer nouvelle version si demandé
    if (useNewVersion) {
      const { data: newV, error: eV } = await supabase
        .from('budget_versions')
        .insert({ exercice_id: exerciceId, libelle: newVersionLibelle.trim(), ordre: versions.length + 1, est_reference: false, couleur: '#3d1a6e' })
        .select('id').single()
      if (eV) { setErr(eV.message); setImporting(false); return }
      targetVersionId = newV.id
    }

    // Appliquer le mapping final
    const toInsert = rows.map(r => ({
      exercice_id: exerciceId,
      version_id: targetVersionId,
      action_id: (mapping[r.action_name] || r.action_id) || null,
      date_prevue: r.date_prevue,
      libelle: r.libelle,
      commentaire: r.commentaire,
      montant: r.montant,
      compte_comptable: r.compte_comptable,
    })).filter(r => r.action_id) // ignorer les non-affectées si voulu

    const nonAffectees = rows.length - toInsert.length

    const { data, error } = await supabase.from('budget_lignes').insert(toInsert).select('id')
    setImporting(false)
    if (error) { setErr(error.message); return }

    setResult({ count: data.length, nonAffectees, versionLibelle: useNewVersion ? newVersionLibelle : versions.find(v => v.id === targetVersionId)?.libelle })
    setStep(3)
  }

  const reset = () => { setStep(1); setRows([]); setMapping({}); setUnmapped([]); setResult(null); setErr('') }

  const stats = {
    total: rows.length,
    mapped: rows.filter(r => mapping[r.action_name] || r.action_id).length,
    recettes: rows.filter(r => r.montant > 0).reduce((s, r) => s + r.montant, 0),
    depenses: rows.filter(r => r.montant < 0).reduce((s, r) => s + r.montant, 0),
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Import Excel — Budget</h2>
          <p>Feuille "Base" du fichier Suivi Budget BasiCompta · {currentExercice?.libelle}</p>
        </div>
        {step > 1 && <button className="btn btn-outline" onClick={reset}>↺ Recommencer</button>}
      </div>

      <div className="page-body">

        {/* Étape 1 : Upload */}
        {step === 1 && (
          <div className="card">
            <div className="card-body">
              <div className="alert alert-info" style={{ marginBottom: 20 }}>
                <strong>Format attendu :</strong> fichier Excel avec une feuille nommée <strong>"Base"</strong> contenant les colonnes : Date, Libellé, Commentaire, Montant, Action, Budget/Reel, Compte.<br />
                <strong>Seules les lignes "Budget" sont importées</strong> (les "Reel" sont ignorées, elles viennent de BasiCompta).
              </div>

              {/* Choix de la version destination */}
              <div className="card" style={{ marginBottom: 20, border: '1px solid var(--gray200)' }}>
                <div className="card-body">
                  <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 12 }}>Version de destination</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" checked={useNewVersion} onChange={() => setUseNewVersion(true)} style={{ width: 'auto' }} />
                      <span>Créer une nouvelle version nommée :</span>
                      <input
                        value={newVersionLibelle}
                        onChange={e => setNewVersionLibelle(e.target.value)}
                        placeholder="ex: Budget Initial 2025-26"
                        style={{ flex: 1, maxWidth: 280 }}
                        onFocus={() => setUseNewVersion(true)}
                      />
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" checked={!useNewVersion} onChange={() => setUseNewVersion(false)} style={{ width: 'auto' }} />
                      <span>Ajouter à une version existante :</span>
                      <select value={versionId} onChange={e => { setVersionId(e.target.value); setUseNewVersion(false) }} style={{ maxWidth: 240 }}>
                        {versions.map(v => <option key={v.id} value={v.id}>{v.libelle}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <div
                className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileRef.current.click()}
              >
                <div style={{ fontSize: 40 }}>📊</div>
                <p>Glisser-déposer le fichier Excel (.xlsx) ici</p>
                <p style={{ fontSize: 12, marginTop: 6 }}>ou cliquer pour parcourir</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              </div>
              {err && <div className="alert alert-error" style={{ marginTop: 12 }}>{err}</div>}
            </div>
          </div>
        )}

        {/* Étape 2 : Prévisualisation */}
        {step === 2 && (
          <>
            {/* Stats */}
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
              <div className="kpi-card"><div className="kpi-label">Lignes trouvées</div><div className="kpi-value">{stats.total}</div></div>
              <div className="kpi-card"><div className="kpi-label">Actions mappées</div><div className="kpi-value">{stats.mapped}</div><div className="kpi-sub">{stats.total - stats.mapped} non affectées</div></div>
              <div className="kpi-card"><div className="kpi-label">Total recettes</div><div className="kpi-value positive">{fmt(stats.recettes)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Total dépenses</div><div className="kpi-value negative">{fmt(stats.depenses)}</div></div>
            </div>

            {/* Mapping actions non reconnues */}
            {unmapped.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <h3>⚠️ {unmapped.length} action{unmapped.length > 1 ? 's' : ''} non reconnue{unmapped.length > 1 ? 's' : ''}</h3>
                  <span className="text-muted">Les lignes sans affectation ne seront pas importées</span>
                </div>
                <div className="card-body" style={{ display: 'grid', gap: 10 }}>
                  {unmapped.map(name => (
                    <div key={name} className="flex gap-2" style={{ alignItems: 'center' }}>
                      <span style={{ minWidth: 240, fontWeight: 500, fontSize: 13 }}>{name || '(vide)'}</span>
                      <span style={{ color: 'var(--gray400)' }}>→</span>
                      <select style={{ flex: 1, maxWidth: 300 }} value={mapping[name] || ''} onChange={e => updateMapping(name, e.target.value)}>
                        <option value="">— Ignorer —</option>
                        {actions.map(a => <option key={a.id} value={a.id}>{a.libelle_complet}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Aperçu tableau */}
            <div className="card">
              <div className="card-header">
                <h3>Aperçu — {rows.length} lignes Budget</h3>
                <div className="flex gap-2">
                  {err && <span className="badge badge-red">{err}</span>}
                  <button className="btn btn-gold" onClick={doImport} disabled={importing}>
                    {importing ? 'Import…' : `✓ Importer ${stats.mapped} lignes`}
                  </button>
                </div>
              </div>
              <div className="table-wrap scrollable-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Action</th>
                      <th>Libellé</th>
                      <th>Commentaire</th>
                      <th className="right">Montant</th>
                      <th>Compte</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const act = actions.find(a => a.id === (mapping[r.action_name] || r.action_id))
                      return (
                        <tr key={r._key} style={{ opacity: act ? 1 : 0.45 }}>
                          <td style={{ fontSize: 12 }}>{r.date_prevue ? new Date(r.date_prevue).toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' }) : '—'}</td>
                          <td style={{ fontSize: 12 }}>{act ? <span className="chip">{act.libelle}</span> : <span className="badge badge-orange">{r.action_name || '—'}</span>}</td>
                          <td>{r.libelle}</td>
                          <td style={{ fontSize: 12, color: 'var(--gray400)' }}>{r.commentaire}</td>
                          <td className={`right amount ${r.montant > 0 ? 'pos' : 'neg'}`}>{fmt(r.montant)}</td>
                          <td><span className="numero-badge">{r.compte_comptable}</span></td>
                          <td>{act ? <span className="badge badge-green">✓</span> : <span className="badge badge-orange">Ignorée</span>}</td>
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
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--navy)', marginBottom: 8 }}>Import réussi !</h3>
              <p style={{ color: 'var(--gray600)', marginBottom: 24 }}>
                <strong>{result.count}</strong> lignes importées dans la version <strong>"{result.versionLibelle}"</strong>
                {result.nonAffectees > 0 && <><br /><span style={{ color: 'var(--orange)' }}>{result.nonAffectees} ligne(s) ignorées (action non reconnue)</span></>}
              </p>
              <div className="btn-group" style={{ justifyContent: 'center' }}>
                <button className="btn btn-outline" onClick={reset}>Importer un autre fichier</button>
                <a href="#/budget" className="btn btn-primary">Voir les lignes budgétaires</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
