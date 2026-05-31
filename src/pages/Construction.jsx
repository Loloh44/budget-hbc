import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt } from '../lib/utils'

const MOIS_LABELS = { '01':'Janv.','02':'Févr.','03':'Mars','04':'Avr.','05':'Mai','06':'Juin','07':'Juil.','08':'Août','09':'Sept.','10':'Oct.','11':'Nov.','12':'Déc.' }

function moisLabel(dateStr) {
  if (!dateStr) return '—'
  const m = String(dateStr).slice(5, 7)
  const y = String(dateStr).slice(2, 4)
  return `${MOIS_LABELS[m] || m} ${y}`
}

function applyCoeff(montant, coeff) {
  return Math.round(parseFloat(montant) * coeff * 100) / 100
}

// ── Formulaire inline pour une ligne budget ───────────────────
function FormLigne({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial)
  return (
    <tr style={{ background: 'rgba(200,168,75,.08)' }}>
      <td><input type="date" value={f.date_prevue || ''} onChange={e => setF(x => ({ ...x, date_prevue: e.target.value }))} style={{ fontSize: 11, padding: '3px 5px', border: '1px solid var(--gray200)', borderRadius: 4, width: 120 }} /></td>
      <td><input value={f.libelle || ''} onChange={e => setF(x => ({ ...x, libelle: e.target.value }))} placeholder="Libellé *" style={{ fontSize: 12, padding: '3px 5px', border: '1px solid var(--gray200)', borderRadius: 4, width: '100%' }} /></td>
      <td><input value={f.commentaire || ''} onChange={e => setF(x => ({ ...x, commentaire: e.target.value }))} placeholder="Commentaire" style={{ fontSize: 11, padding: '3px 5px', border: '1px solid var(--gray200)', borderRadius: 4, width: '100%' }} /></td>
      <td><input type="number" step="0.01" value={f.montant ?? ''} onChange={e => setF(x => ({ ...x, montant: e.target.value }))} placeholder="Montant *" style={{ fontSize: 12, padding: '3px 5px', border: '1px solid var(--gray200)', borderRadius: 4, width: 100, textAlign: 'right' }} /></td>
      <td><input value={f.compte_comptable || ''} onChange={e => setF(x => ({ ...x, compte_comptable: e.target.value }))} placeholder="Compte" style={{ fontSize: 11, padding: '3px 5px', border: '1px solid var(--gray200)', borderRadius: 4, width: 65 }} /></td>
      <td>
        <div style={{ display: 'flex', gap: 3 }}>
          <button className="btn btn-xs btn-primary" onClick={() => onSave(f)}>✓</button>
          <button className="btn btn-xs btn-outline" onClick={onCancel}>✕</button>
        </div>
      </td>
    </tr>
  )
}

// ── Bloc action ───────────────────────────────────────────────
function ActionBloc({ action, reelLignes, budgetSourceLignes, lignesCible, exerciceCibleId, versionCibleId, coeff, onAdd, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)  // id de la ligne en cours d'édition
  const [addingNew, setAddingNew] = useState(false)  // formulaire nouvelle ligne

  const totalReel = reelLignes.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  const totalSrc = budgetSourceLignes.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  const totalCible = lignesCible.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  const ecart = totalCible - totalReel

  // Sauvegarder une nouvelle ligne
  const saveNew = async (form) => {
    if (!form.libelle || form.montant === '' || form.montant === undefined) return
    const payload = {
      exercice_id: exerciceCibleId, version_id: versionCibleId, action_id: action.id,
      date_prevue: form.date_prevue || null, libelle: form.libelle,
      commentaire: form.commentaire || null, montant: parseFloat(form.montant),
      compte_comptable: form.compte_comptable || null,
    }
    const { data, error } = await supabase.from('budget_lignes').insert(payload).select().single()
    if (!error && data) { onAdd(data); setAddingNew(false) }
  }

  // Sauvegarder une modification
  const saveEdit = async (form) => {
    if (!form.libelle || form.montant === '' || form.montant === undefined) return
    const payload = {
      date_prevue: form.date_prevue || null, libelle: form.libelle,
      commentaire: form.commentaire || null, montant: parseFloat(form.montant),
      compte_comptable: form.compte_comptable || null, updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('budget_lignes').update(payload).eq('id', form.id)
    if (!error) { onUpdate({ ...form, ...payload }); setEditingId(null) }
  }

  // Supprimer
  const del = async (id) => {
    if (!confirm('Supprimer cette ligne ?')) return
    const { error } = await supabase.from('budget_lignes').delete().eq('id', id)
    if (!error) onDelete(id)
  }

  // Copier une ligne réelle
  const copierLigne = async (l) => {
    const payload = {
      exercice_id: exerciceCibleId, version_id: versionCibleId, action_id: action.id,
      date_prevue: l.date_ecriture || null, libelle: l.libelle,
      commentaire: l.commentaire || null, montant: applyCoeff(l.montant, coeff),
      compte_comptable: l.code_comptable || null,
    }
    const { data, error } = await supabase.from('budget_lignes').insert(payload).select().single()
    if (!error && data) onAdd(data)
  }

  // Copier toutes les lignes d'un mois
  const copierMoisLignes = async (lignesMois) => {
    const toInsert = lignesMois.map(l => ({
      exercice_id: exerciceCibleId, version_id: versionCibleId, action_id: action.id,
      date_prevue: l.date_ecriture || null, libelle: l.libelle,
      commentaire: l.commentaire || null, montant: applyCoeff(l.montant, coeff),
      compte_comptable: l.code_comptable || null,
    }))
    const { data, error } = await supabase.from('budget_lignes').insert(toInsert).select()
    if (!error && data) data.forEach(d => onAdd(d))
  }

  // Copier le total d'un mois en une ligne
  const copierMoisTotal = async (lignesMois, label) => {
    const total = lignesMois.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
    const moisKey = lignesMois[0]?.date_ecriture?.slice(0, 7) || ''
    const payload = {
      exercice_id: exerciceCibleId, version_id: versionCibleId, action_id: action.id,
      date_prevue: moisKey ? moisKey + '-01' : null,
      libelle: `${action.libelle} — ${label}`,
      commentaire: `Total ${label} (${lignesMois.length} écritures)`,
      montant: applyCoeff(total, coeff), compte_comptable: lignesMois[0]?.code_comptable || null,
    }
    const { data, error } = await supabase.from('budget_lignes').insert(payload).select().single()
    if (!error && data) onAdd(data)
  }

  // Grouper réel par mois
  const reelParMois = {}
  const ordreMois = []
  ;[...reelLignes].sort((a, b) => (a.date_ecriture || '').localeCompare(b.date_ecriture || '')).forEach(l => {
    const k = l.date_ecriture?.slice(0, 7) || 'inconnu'
    if (!reelParMois[k]) { reelParMois[k] = []; ordreMois.push(k) }
    reelParMois[k].push(l)
  })

  const thS = { padding: '4px 6px', fontSize: 10, fontWeight: 600, color: 'var(--gray400)', textTransform: 'uppercase' }
  const btnS = { fontSize: 10, padding: '2px 5px' }

  return (
    <div style={{ borderBottom: '1px solid var(--gray100)' }}>
      {/* Ligne résumé action */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 150px 90px', gap: 8, padding: '9px 16px', cursor: 'pointer', alignItems: 'center' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--gray50)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}>
        <div className="flex gap-2" style={{ alignItems: 'center' }}>
          <span style={{ color: 'var(--gray400)', fontSize: 12, display: 'inline-block', transition: 'transform .2s', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
          <span style={{ fontSize: 13 }}>{action.libelle}</span>
          {lignesCible.length > 0 && <span className="chip">{lignesCible.length}L</span>}
        </div>
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 500, color: totalReel > 0 ? 'var(--green)' : totalReel < 0 ? 'var(--red)' : 'var(--gray300)' }}>{totalReel !== 0 ? fmt(totalReel) : '—'}</div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--gray500)' }}>{totalSrc !== 0 ? fmt(totalSrc) : '—'}</div>
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: totalCible > 0 ? 'var(--green)' : totalCible < 0 ? 'var(--red)' : 'var(--gray300)' }}>
          {totalCible !== 0 ? fmt(totalCible) : <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--gray300)' }}>À saisir</span>}
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: Math.abs(ecart) < 200 ? 'var(--green)' : Math.abs(ecart) < 1000 ? 'var(--orange)' : 'var(--red)' }}>
          {(totalReel !== 0 || totalCible !== 0) && fmt(ecart)}
        </div>
      </div>

      {/* Détail */}
      {open && (
        <div style={{ background: '#faf9fc', borderTop: '1px solid var(--gray100)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

          {/* Colonne RÉEL */}
          <div style={{ padding: '12px 16px', borderRight: '2px solid var(--gray200)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray400)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              📊 Réel ({reelLignes.length} écriture{reelLignes.length !== 1 ? 's' : ''})
            </div>
            {reelLignes.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--gray400)', fontStyle: 'italic' }}>Aucune écriture réelle</p>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={thS}>Date</th><th style={thS}>Libellé</th><th style={thS}>Commentaire</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Montant</th>
                    <th style={{ ...thS, width: 90 }}></th>
                  </tr></thead>
                  <tbody>
                    {ordreMois.map(mois => {
                      const lm = reelParMois[mois]
                      const tot = lm.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
                      const label = moisLabel(mois + '-01')
                      return [
                        <tr key={`st-${mois}`} style={{ background: 'rgba(61,26,110,.06)', borderTop: '1px solid var(--gray200)' }}>
                          <td style={{ padding: '5px 6px', fontSize: 11, fontWeight: 700, color: 'var(--navy)' }}>{label}</td>
                          <td colSpan={2} style={{ padding: '5px 6px', fontSize: 11, color: 'var(--gray400)', fontStyle: 'italic' }}>{lm.length} écriture{lm.length > 1 ? 's' : ''}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, fontSize: 12, color: tot > 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(tot)}</td>
                          <td style={{ padding: '5px 4px' }}>
                            <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                              <button className="btn btn-xs btn-outline" style={btnS} title="Copier toutes les lignes du mois" onClick={e => { e.stopPropagation(); copierMoisLignes(lm) }}>⧉ Lignes</button>
                              <button className="btn btn-xs btn-gold" style={btnS} title="Copier 1 ligne = total du mois" onClick={e => { e.stopPropagation(); copierMoisTotal(lm, label) }}>⧉ Total</button>
                            </div>
                          </td>
                        </tr>,
                        ...lm.map(l => (
                          <tr key={l.id} style={{ borderBottom: '1px solid var(--gray100)' }}>
                            <td style={{ padding: '3px 6px 3px 16px', fontSize: 11, color: 'var(--gray400)', whiteSpace: 'nowrap' }}>
                              {l.date_ecriture ? l.date_ecriture.slice(8, 10) + '/' + l.date_ecriture.slice(5, 7) : '—'}
                            </td>
                            <td style={{ padding: '3px 6px', fontSize: 11 }}>{l.libelle}</td>
                            <td style={{ padding: '3px 6px', fontSize: 10, color: 'var(--gray400)' }}>{l.commentaire}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'right', fontSize: 11, fontWeight: 500, color: parseFloat(l.montant) > 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(parseFloat(l.montant))}</td>
                            <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                              <button className="btn btn-xs btn-outline" style={btnS} title="Copier cette ligne" onClick={e => { e.stopPropagation(); copierLigne(l) }}>⧉</button>
                            </td>
                          </tr>
                        ))
                      ]
                    })}
                    <tr style={{ borderTop: '2px solid var(--gray200)' }}>
                      <td colSpan={3} style={{ padding: '6px', fontWeight: 700, fontSize: 12 }}>Total réel</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, fontSize: 12, color: totalReel > 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(totalReel)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )
            }
          </div>

          {/* Colonne BUDGET CIBLE */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>✏️ Budget cible ({lignesCible.length} ligne{lignesCible.length !== 1 ? 's' : ''})</span>
              <button className="btn btn-xs btn-gold" onClick={e => { e.stopPropagation(); setAddingNew(true) }}>+ Ligne</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thS}>Date</th><th style={thS}>Libellé</th><th style={thS}>Commentaire</th>
                <th style={{ ...thS, textAlign: 'right' }}>Montant</th><th style={thS}>Compte</th><th></th>
              </tr></thead>
              <tbody>
                {lignesCible.map(l => (
                  editingId === l.id
                    ? <FormLigne key={l.id} initial={l} onSave={saveEdit} onCancel={() => setEditingId(null)} />
                    : (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--gray100)' }}>
                        <td style={{ padding: '4px 6px', fontSize: 11, whiteSpace: 'nowrap', color: 'var(--gray600)' }}>{moisLabel(l.date_prevue)}</td>
                        <td style={{ padding: '4px 6px', fontSize: 12 }}>{l.libelle}</td>
                        <td style={{ padding: '4px 6px', fontSize: 11, color: 'var(--gray400)' }}>{l.commentaire}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: parseFloat(l.montant) > 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(parseFloat(l.montant))}</td>
                        <td style={{ padding: '4px 6px' }}><span className="numero-badge">{l.compte_comptable}</span></td>
                        <td style={{ padding: '4px 6px' }}>
                          <div className="inline-edit-actions">
                            <button className="btn btn-xs btn-outline" onClick={() => setEditingId(l.id)}>✏️</button>
                            <button className="btn btn-xs btn-danger" onClick={() => del(l.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    )
                ))}
                {addingNew && <FormLigne initial={{ libelle: '', montant: '' }} onSave={saveNew} onCancel={() => setAddingNew(false)} />}
                {lignesCible.length > 0 && (
                  <tr style={{ borderTop: '2px solid var(--gray200)' }}>
                    <td colSpan={3} style={{ padding: '6px', fontWeight: 700, fontSize: 12 }}>Total budget cible</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, fontSize: 12, color: totalCible > 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(totalCible)}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
                {lignesCible.length === 0 && !addingNew && (
                  <tr><td colSpan={6} style={{ padding: '12px 6px', fontSize: 12, color: 'var(--gray400)', fontStyle: 'italic' }}>
                    Vide — copie depuis le réel ou clique "+ Ligne"
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────
export default function Construction() {
  const { exercices, exerciceId } = useExercice()

  const [sourceExId, setSourceExId] = useState('')
  const [sourceVersionId, setSourceVersionId] = useState('')
  const [sourceVersions, setSourceVersions] = useState([])
  const [cibleExId, setCibleExId] = useState('')
  const [cibleVersionId, setCibleVersionId] = useState('')
  const [cibleVersions, setCibleVersions] = useState([])

  const [commissions, setCommissions] = useState([])
  const [actions, setActions] = useState([])
  const [reelData, setReelData] = useState([])
  const [budgetSource, setBudgetSource] = useState([])
  // State central des lignes cible — source unique de vérité
  const [lignesCible, setLignesCible] = useState([])

  const [openComms, setOpenComms] = useState({})
  const [coeff, setCoeff] = useState(1.00)
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadRef() }, [])
  useEffect(() => { if (exerciceId && !sourceExId) setSourceExId(exerciceId) }, [exerciceId])
  useEffect(() => { if (sourceExId) loadSourceVersions() }, [sourceExId])
  useEffect(() => { if (cibleExId) loadCibleVersions() }, [cibleExId])
  useEffect(() => { if (sourceExId && cibleExId) loadData() }, [sourceExId, sourceVersionId, cibleExId, cibleVersionId])

  const loadRef = async () => {
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('budget_commissions').select('*').order('ordre'),
      supabase.from('budget_actions').select('*, budget_commissions(libelle,ordre)').eq('est_actif', true).order('ordre'),
    ])
    setCommissions(c || [])
    setActions(a || [])
  }

  const loadSourceVersions = async () => {
    const { data } = await supabase.from('budget_versions').select('*').eq('exercice_id', sourceExId).order('ordre')
    setSourceVersions(data || [])
    const ref = data?.find(v => v.est_reference) || data?.[0]
    if (ref) setSourceVersionId(ref.id)
  }

  const loadCibleVersions = async () => {
    const { data } = await supabase.from('budget_versions').select('*').eq('exercice_id', cibleExId).order('ordre')
    setCibleVersions(data || [])
    const ref = data?.find(v => v.est_reference) || data?.[0]
    if (ref) setCibleVersionId(ref.id)
  }

  const loadData = async () => {
    setLoading(true)
    const [{ data: reel }, { data: bSrc }, { data: bCib }] = await Promise.all([
      supabase.from('budget_ecritures').select('*').eq('exercice_id', sourceExId),
      sourceVersionId
        ? supabase.from('budget_lignes').select('*').eq('version_id', sourceVersionId)
        : Promise.resolve({ data: [] }),
      cibleVersionId
        ? supabase.from('budget_lignes').select('*').eq('version_id', cibleVersionId)
        : Promise.resolve({ data: [] }),
    ])
    setReelData(reel || [])
    setBudgetSource(bSrc || [])
    setLignesCible(bCib || [])
    setLoading(false)
  }

  // ── Mutations du state central lignesCible ──────────────────
  const addLigne = (ligne) => setLignesCible(prev => [...prev, ligne])

  const updateLigne = (updated) => setLignesCible(prev =>
    prev.map(l => l.id === updated.id ? { ...l, ...updated } : l)
  )

  const deleteLigne = (id) => setLignesCible(prev => prev.filter(l => l.id !== id))

  // Copier toute une commission
  const copierCommission = async (commId) => {
    const actIds = actions.filter(a => a.commission_id === commId).map(a => a.id)
    const lignes = reelData.filter(l => actIds.includes(l.action_id))
    if (lignes.length === 0) { alert('Aucune écriture réelle pour cette commission'); return }
    if (!confirm(`Copier ${lignes.length} écriture(s) avec coeff ×${coeff} ?`)) return
    const toInsert = lignes.map(l => ({
      exercice_id: cibleExId, version_id: cibleVersionId, action_id: l.action_id,
      date_prevue: l.date_ecriture || null, libelle: l.libelle,
      commentaire: l.commentaire || null, montant: applyCoeff(l.montant, coeff),
      compte_comptable: l.code_comptable || null,
    }))
    const { data, error } = await supabase.from('budget_lignes').insert(toInsert).select()
    if (!error && data) data.forEach(d => addLigne(d))
  }

  const toggleComm = (id) => setOpenComms(prev => ({ ...prev, [id]: !prev[id] }))

  const totalReel = reelData.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  const totalBudgetSource = budgetSource.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  const totalBudgetCible = lignesCible.reduce((s, l) => s + parseFloat(l.montant || 0), 0)

  const sourceEx = exercices.find(e => e.id === sourceExId)
  const cibleEx = exercices.find(e => e.id === cibleExId)
  const canWork = sourceExId && cibleExId && cibleVersionId

  const colStyle = { display: 'grid', gridTemplateColumns: '1fr 130px 130px 150px 90px', gap: 8, alignItems: 'center' }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Construction budget N+1</h2>
          <p>Réel {sourceEx?.code || 'N'} + Budget {sourceEx?.code || 'N'} → Budget {cibleEx?.code || 'N+1'}</p>
        </div>
      </div>

      <div className="page-body">

        {/* Configuration */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3>Configuration</h3></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>

              <div style={{ padding: 16, background: 'var(--gray50)', borderRadius: 10, border: '1px solid var(--gray200)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray400)', marginBottom: 10 }}>📂 Source</div>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label>Exercice source</label>
                  <select value={sourceExId} onChange={e => setSourceExId(e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {exercices.map(ex => <option key={ex.id} value={ex.id}>{ex.code} — {ex.libelle}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Version budget à afficher</label>
                  <select value={sourceVersionId} onChange={e => setSourceVersionId(e.target.value)}>
                    <option value="">— Aucune —</option>
                    {sourceVersions.map(v => <option key={v.id} value={v.id}>{v.est_reference ? '⭐ ' : ''}{v.libelle}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ padding: 16, background: 'rgba(61,26,110,.04)', borderRadius: 10, border: '2px solid var(--navy)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--navy)', marginBottom: 10 }}>🎯 Cible</div>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label>Exercice cible</label>
                  <select value={cibleExId} onChange={e => setCibleExId(e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {exercices.filter(e => e.id !== sourceExId).map(ex => <option key={ex.id} value={ex.id}>{ex.code} — {ex.libelle}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Version cible</label>
                  <select value={cibleVersionId} onChange={e => setCibleVersionId(e.target.value)} disabled={!cibleExId}>
                    <option value="">— Sélectionner —</option>
                    {cibleVersions.map(v => <option key={v.id} value={v.id}>{v.est_reference ? '⭐ ' : ''}{v.libelle}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ padding: 16, background: 'rgba(200,168,75,.08)', borderRadius: 10, border: '1px solid var(--gold)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#7a6020', marginBottom: 10 }}>⚙️ Coefficient</div>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label>Multiplicateur</label>
                  <input type="number" step="0.01" min="0.5" max="3" value={coeff}
                    onChange={e => setCoeff(parseFloat(e.target.value) || 1)}
                    style={{ fontWeight: 700, fontSize: 15 }} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[[1,'=0%'],[1.02,'+2%'],[1.03,'+3%'],[1.05,'+5%'],[1.10,'+10%']].map(([c, label]) => (
                    <button key={c} className={`btn btn-xs ${coeff === c ? 'btn-gold' : 'btn-outline'}`} onClick={() => setCoeff(c)}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {!canWork && <div className="alert alert-info">Sélectionne exercice source, exercice cible et version cible pour commencer.</div>}

        {canWork && (
          <>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
              <div className="kpi-card" style={{ borderLeft: '4px solid var(--green)' }}>
                <div className="kpi-label">Réel {sourceEx?.code}</div>
                <div className={`kpi-value ${totalReel >= 0 ? 'positive' : 'negative'}`}>{fmt(totalReel)}</div>
                <div className="kpi-sub">{reelData.length} écritures</div>
              </div>
              <div className="kpi-card" style={{ borderLeft: '4px solid var(--gray400)' }}>
                <div className="kpi-label">Budget {sourceEx?.code}</div>
                <div className={`kpi-value ${totalBudgetSource >= 0 ? 'positive' : 'negative'}`}>{fmt(totalBudgetSource)}</div>
                <div className="kpi-sub">{budgetSource.length} lignes</div>
              </div>
              <div className="kpi-card" style={{ borderLeft: '4px solid var(--navy)' }}>
                <div className="kpi-label">Budget {cibleEx?.code} en cours</div>
                <div className={`kpi-value ${totalBudgetCible >= 0 ? 'positive' : 'negative'}`}>{fmt(totalBudgetCible)}</div>
                <div className="kpi-sub">{lignesCible.length} lignes saisies</div>
              </div>
            </div>

            <div style={{ ...colStyle, padding: '10px 16px', background: 'var(--navy)', borderRadius: '10px 10px 0 0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Commission / Action</div>
              <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>Réel {sourceEx?.code}</div>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase' }}>Budget {sourceEx?.code}</div>
              <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>Budget {cibleEx?.code} ✏️</div>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase' }}>Écart</div>
            </div>

            <div className="card" style={{ borderRadius: '0 0 10px 10px' }}>
              {loading && <div className="loading">Chargement…</div>}
              {commissions.map(comm => {
                const actsComm = actions.filter(a => a.commission_id === comm.id)
                if (actsComm.length === 0) return null
                const commReel = reelData.filter(l => actsComm.some(a => a.id === l.action_id)).reduce((s, l) => s + parseFloat(l.montant || 0), 0)
                const commSrc = budgetSource.filter(l => actsComm.some(a => a.id === l.action_id)).reduce((s, l) => s + parseFloat(l.montant || 0), 0)
                const commCib = lignesCible.filter(l => actsComm.some(a => a.id === l.action_id)).reduce((s, l) => s + parseFloat(l.montant || 0), 0)

                return (
                  <div key={comm.id} style={{ borderBottom: '2px solid var(--gray200)' }}>
                    <div onClick={() => toggleComm(comm.id)}
                      style={{ ...colStyle, padding: '12px 16px', cursor: 'pointer', background: openComms[comm.id] ? 'rgba(61,26,110,.05)' : 'var(--gray50)' }}>
                      <div className="flex gap-2" style={{ alignItems: 'center' }}>
                        <span style={{ fontSize: 14, color: 'var(--navy)', display: 'inline-block', transition: 'transform .2s', transform: openComms[comm.id] ? 'rotate(90deg)' : 'none' }}>▶</span>
                        <strong style={{ color: 'var(--navy)', fontSize: 13 }}>{comm.libelle}</strong>
                        <span className="chip">{actsComm.length} actions</span>
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 13, color: commReel >= 0 ? 'var(--green)' : 'var(--red)' }}>{commReel !== 0 ? fmt(commReel) : '—'}</div>
                      <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--gray500)' }}>{commSrc !== 0 ? fmt(commSrc) : '—'}</div>
                      <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: commCib >= 0 ? 'var(--green)' : commCib < 0 ? 'var(--red)' : 'var(--gray300)' }}>
                        {commCib !== 0 ? fmt(commCib) : <span style={{ fontWeight: 400, color: 'var(--gray300)', fontSize: 12 }}>À saisir</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button className="btn btn-xs btn-outline" title={`Copier tout le réel "${comm.libelle}" ×${coeff}`}
                          onClick={e => { e.stopPropagation(); copierCommission(comm.id) }}>⧉ Tout copier</button>
                      </div>
                    </div>
                    {openComms[comm.id] && actsComm.map(action => (
                      <ActionBloc
                        key={action.id}
                        action={action}
                        reelLignes={reelData.filter(l => l.action_id === action.id)}
                        budgetSourceLignes={budgetSource.filter(l => l.action_id === action.id)}
                        lignesCible={lignesCible.filter(l => l.action_id === action.id)}
                        exerciceCibleId={cibleExId}
                        versionCibleId={cibleVersionId}
                        coeff={coeff}
                        onAdd={addLigne}
                        onUpdate={updateLigne}
                        onDelete={deleteLigne}
                      />
                    ))}
                  </div>
                )
              })}
              <div style={{ ...colStyle, padding: '14px 16px', background: 'var(--navy)', borderRadius: '0 0 10px 10px' }}>
                <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: 13 }}>TOTAL GÉNÉRAL</div>
                <div style={{ textAlign: 'right', fontWeight: 700, color: totalReel >= 0 ? '#6ee7a0' : '#fca5a5', fontSize: 13 }}>{fmt(totalReel)}</div>
                <div style={{ textAlign: 'right', fontWeight: 600, color: 'rgba(255,255,255,.6)', fontSize: 13 }}>{fmt(totalBudgetSource)}</div>
                <div style={{ textAlign: 'right', fontWeight: 700, color: totalBudgetCible >= 0 ? '#6ee7a0' : '#fca5a5', fontSize: 13 }}>{fmt(totalBudgetCible)}</div>
                <div style={{ textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,.5)' }}>{fmt(totalBudgetCible - totalReel)}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
