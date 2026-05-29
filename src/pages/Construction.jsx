import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt } from '../lib/utils'

const MOIS = ['Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.','Janv.','Févr.','Mars','Avr.','Mai']
const MOIS_NUM = ['06','07','08','09','10','11','12','01','02','03','04','05']

function moisLabel(dateStr) {
  if (!dateStr) return '—'
  const m = dateStr.slice(5, 7)
  const y = dateStr.slice(0, 4)
  const idx = MOIS_NUM.indexOf(m)
  return idx >= 0 ? `${MOIS[idx]} ${y.slice(2)}` : `${m}/${y}`
}

function applyCoeff(montant, coeff) {
  return Math.round(parseFloat(montant) * coeff * 100) / 100
}

// ── Ligne budget éditable ─────────────────────────────────────
function LigneBudget({ ligne, onUpdate, onDelete, actionId, exerciceCibleId, versionCibleId }) {
  const [editing, setEditing] = useState(!ligne.id)
  const [form, setForm] = useState({
    date_prevue: ligne.date_prevue || '',
    libelle: ligne.libelle || '',
    commentaire: ligne.commentaire || '',
    montant: ligne.montant !== undefined ? ligne.montant : '',
    compte_comptable: ligne.compte_comptable || '',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.libelle || form.montant === '') return
    setSaving(true)
    const payload = {
      exercice_id: exerciceCibleId,
      version_id: versionCibleId,
      action_id: actionId,
      date_prevue: form.date_prevue || null,
      libelle: form.libelle,
      commentaire: form.commentaire || null,
      montant: parseFloat(form.montant),
      compte_comptable: form.compte_comptable || null,
      updated_at: new Date().toISOString(),
    }
    let result
    if (ligne.id) {
      result = await supabase.from('budget_lignes').update(payload).eq('id', ligne.id).select('id').single()
    } else {
      result = await supabase.from('budget_lignes').insert(payload).select('id').single()
    }
    setSaving(false)
    if (!result.error) { setEditing(false); onUpdate({ ...payload, id: result.data.id, _tmpId: ligne._tmpId }) }
  }

  const del = async () => {
    if (!ligne.id) { onDelete(ligne._tmpId); return }
    if (!confirm('Supprimer cette ligne ?')) return
    await supabase.from('budget_lignes').delete().eq('id', ligne.id)
    onDelete(ligne.id)
  }

  const inputStyle = { padding: '4px 6px', border: '1px solid var(--gray200)', borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: 12, background: 'white' }

  if (editing) return (
    <tr style={{ background: 'rgba(200,168,75,.08)' }}>
      <td><input type="date" value={form.date_prevue} onChange={e => setForm(f => ({ ...f, date_prevue: e.target.value }))} style={{ ...inputStyle, width: 130 }} /></td>
      <td><input value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))} placeholder="Libellé *" style={{ ...inputStyle, width: '100%' }} /></td>
      <td><input value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} placeholder="Commentaire" style={{ ...inputStyle, width: '100%' }} /></td>
      <td><input type="number" step="0.01" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} placeholder="Montant *" style={{ ...inputStyle, width: 100, textAlign: 'right' }} /></td>
      <td><input value={form.compte_comptable} onChange={e => setForm(f => ({ ...f, compte_comptable: e.target.value }))} placeholder="Compte" style={{ ...inputStyle, width: 70 }} /></td>
      <td>
        <div className="inline-edit-actions">
          <button className="btn btn-xs btn-primary" onClick={save} disabled={saving}>{saving ? '…' : '✓'}</button>
          <button className="btn btn-xs btn-outline" onClick={() => { if (!ligne.id) onDelete(ligne._tmpId); else setEditing(false) }}>✕</button>
        </div>
      </td>
    </tr>
  )

  return (
    <tr style={{ borderBottom: '1px solid var(--gray100)' }}>
      <td style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '5px 6px', color: 'var(--gray600)' }}>{moisLabel(ligne.date_prevue)}</td>
      <td style={{ fontSize: 12, padding: '5px 6px' }}>{ligne.libelle}</td>
      <td style={{ fontSize: 11, color: 'var(--gray400)', padding: '5px 6px' }}>{ligne.commentaire}</td>
      <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, padding: '5px 6px', color: parseFloat(ligne.montant) > 0 ? 'var(--green)' : 'var(--red)' }}>
        {fmt(parseFloat(ligne.montant))}
      </td>
      <td style={{ padding: '5px 6px' }}><span className="numero-badge">{ligne.compte_comptable}</span></td>
      <td style={{ padding: '5px 6px' }}>
        <div className="inline-edit-actions">
          <button className="btn btn-xs btn-outline" onClick={() => setEditing(true)}>✏️</button>
          <button className="btn btn-xs btn-danger" onClick={del}>🗑</button>
        </div>
      </td>
    </tr>
  )
}

// ── Bloc action ───────────────────────────────────────────────
function ActionBloc({ action, reelLignes, budgetSourceLignes, budgetCibleLignes, exerciceCibleId, versionCibleId, coeff, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [localCible, setLocalCible] = useState(budgetCibleLignes)

  useEffect(() => { setLocalCible(budgetCibleLignes) }, [budgetCibleLignes])

  const totalReel = reelLignes.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  const totalSrc = budgetSourceLignes.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  const totalCible = localCible.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  const ecart = totalCible - totalReel

  const copierReel = async (e) => {
    e.stopPropagation()
    if (reelLignes.length === 0) return
    if (!confirm(`Copier ${reelLignes.length} ligne(s) avec coeff ×${coeff} ?`)) return
    const toInsert = reelLignes.map(l => ({
      exercice_id: exerciceCibleId, version_id: versionCibleId, action_id: action.id,
      date_prevue: l.date_ecriture || null, libelle: l.libelle, commentaire: l.commentaire || null,
      montant: applyCoeff(l.montant, coeff), compte_comptable: l.code_comptable || null,
    }))
    const { data } = await supabase.from('budget_lignes').insert(toInsert).select()
    if (data) { setLocalCible(prev => [...prev, ...data]); onRefresh() }
  }

  const ajouterLigne = (e) => {
    e.stopPropagation()
    setLocalCible(prev => [...prev, { _tmpId: crypto.randomUUID(), libelle: '', montant: '' }])
    setOpen(true)
  }

  const handleUpdate = (updated) => {
    setLocalCible(prev => prev.map(l => l.id === updated.id || l._tmpId === updated._tmpId ? updated : l))
    onRefresh()
  }

  const handleDelete = (key) => {
    setLocalCible(prev => prev.filter(l => l.id !== key && l._tmpId !== key))
    onRefresh()
  }

  const thStyle = { padding: '4px 6px', fontSize: 10, fontWeight: 600, color: 'var(--gray400)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'left' }

  return (
    <div style={{ borderBottom: '1px solid var(--gray100)' }}>
      {/* Ligne résumé */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 150px 90px', gap: 8, padding: '9px 16px', cursor: 'pointer', alignItems: 'center', transition: 'background .1s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--gray50)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
      >
        <div className="flex gap-2" style={{ alignItems: 'center' }}>
          <span style={{ color: 'var(--gray400)', fontSize: 12, display: 'inline-block', transition: 'transform .2s', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
          <span style={{ fontSize: 13 }}>{action.libelle}</span>
          {localCible.filter(l => l.id).length > 0 && <span className="chip">{localCible.filter(l => l.id).length}L</span>}
        </div>
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 500, color: totalReel > 0 ? 'var(--green)' : totalReel < 0 ? 'var(--red)' : 'var(--gray300)' }}>
          {totalReel !== 0 ? fmt(totalReel) : '—'}
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--gray500)' }}>
          {totalSrc !== 0 ? fmt(totalSrc) : '—'}
        </div>
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: totalCible > 0 ? 'var(--green)' : totalCible < 0 ? 'var(--red)' : 'var(--gray300)' }}>
          {totalCible !== 0 ? fmt(totalCible) : <span style={{ fontWeight: 400, fontSize: 12 }}>À saisir</span>}
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: Math.abs(ecart) < 200 ? 'var(--green)' : Math.abs(ecart) < 1000 ? 'var(--orange)' : 'var(--red)' }}>
          {(totalReel !== 0 || totalCible !== 0) && fmt(ecart)}
        </div>
      </div>

      {/* Détail déplié */}
      {open && (
        <div style={{ background: '#faf9fc', borderTop: '1px solid var(--gray100)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

          {/* Réel */}
          <div style={{ padding: '12px 16px', borderRight: '2px solid var(--gray200)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray400)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              📊 Réel ({reelLignes.length} écriture{reelLignes.length !== 1 ? 's' : ''})
            </div>
            {reelLignes.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--gray400)', fontStyle: 'italic' }}>Aucune écriture réelle</p>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Libellé</th>
                      <th style={thStyle}>Commentaire</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reelLignes.map(l => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--gray100)' }}>
                        <td style={{ padding: '4px 6px', fontSize: 11, whiteSpace: 'nowrap', color: 'var(--gray600)' }}>{moisLabel(l.date_ecriture)}</td>
                        <td style={{ padding: '4px 6px', fontSize: 12 }}>{l.libelle}</td>
                        <td style={{ padding: '4px 6px', fontSize: 11, color: 'var(--gray400)' }}>{l.commentaire}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: parseFloat(l.montant) > 0 ? 'var(--green)' : 'var(--red)' }}>
                          {fmt(parseFloat(l.montant))}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--gray200)' }}>
                      <td colSpan={3} style={{ padding: '6px 6px', fontWeight: 700, fontSize: 12 }}>Total réel</td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, fontSize: 12, color: totalReel > 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(totalReel)}</td>
                    </tr>
                  </tbody>
                </table>
              )
            }
            {reelLignes.length > 0 && (
              <button className="btn btn-xs btn-outline" style={{ marginTop: 10 }} onClick={copierReel}>
                ⧉ Copier vers budget (×{coeff})
              </button>
            )}
          </div>

          {/* Budget cible */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>✏️ Budget cible ({localCible.filter(l => l.id).length} ligne{localCible.filter(l => l.id).length !== 1 ? 's' : ''})</span>
              <button className="btn btn-xs btn-gold" onClick={ajouterLigne}>+ Ligne</button>
            </div>
            {localCible.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--gray400)', fontStyle: 'italic', marginBottom: 8 }}>Vide — copie le réel ou ajoute des lignes manuellement</p>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Libellé</th>
                      <th style={thStyle}>Commentaire</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Montant</th>
                      <th style={thStyle}>Compte</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {localCible.map(l => (
                      <LigneBudget
                        key={l.id || l._tmpId}
                        ligne={l}
                        actionId={action.id}
                        exerciceCibleId={exerciceCibleId}
                        versionCibleId={versionCibleId}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                      />
                    ))}
                    <tr style={{ borderTop: '2px solid var(--gray200)' }}>
                      <td colSpan={3} style={{ padding: '6px 6px', fontWeight: 700, fontSize: 12 }}>Total budget cible</td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, fontSize: 12, color: totalCible > 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(totalCible)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              )
            }
            {localCible.length === 0 && (
              <button className="btn btn-xs btn-gold" style={{ marginTop: 4 }} onClick={ajouterLigne}>+ Ajouter une ligne</button>
            )}
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
  const [budgetCible, setBudgetCible] = useState([])

  const [openComms, setOpenComms] = useState({})
  const [coeff, setCoeff] = useState(1.00)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => { loadRef() }, [])
  useEffect(() => { if (exerciceId && !sourceExId) setSourceExId(exerciceId) }, [exerciceId])
  useEffect(() => { if (sourceExId) loadSourceVersions() }, [sourceExId])
  useEffect(() => { if (cibleExId) loadCibleVersions() }, [cibleExId])
  useEffect(() => { if (sourceExId && cibleExId) loadData() }, [sourceExId, sourceVersionId, cibleExId, cibleVersionId, refreshKey])

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
    setBudgetCible(bCib || [])
    setLoading(false)
  }

  const copierCommission = async (commId) => {
    const actIds = actions.filter(a => a.commission_id === commId).map(a => a.id)
    const lignes = reelData.filter(l => actIds.includes(l.action_id))
    if (lignes.length === 0) { alert('Aucune écriture réelle pour cette commission'); return }
    if (!confirm(`Copier ${lignes.length} écriture(s) de cette commission vers le budget cible avec coeff ×${coeff} ?`)) return
    const toInsert = lignes.map(l => ({
      exercice_id: cibleExId, version_id: cibleVersionId, action_id: l.action_id,
      date_prevue: l.date_ecriture || null, libelle: l.libelle, commentaire: l.commentaire || null,
      montant: applyCoeff(l.montant, coeff), compte_comptable: l.code_comptable || null,
    }))
    await supabase.from('budget_lignes').insert(toInsert)
    setRefreshKey(k => k + 1)
  }

  const toggleComm = (id) => setOpenComms(prev => ({ ...prev, [id]: !prev[id] }))

  const totalReel = reelData.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  const totalBudgetSource = budgetSource.reduce((s, l) => s + parseFloat(l.montant || 0), 0)
  const totalBudgetCible = budgetCible.reduce((s, l) => s + parseFloat(l.montant || 0), 0)

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
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray400)', marginBottom: 10 }}>📂 Source (référence)</div>
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
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--navy)', marginBottom: 10 }}>🎯 Cible (nouveau budget)</div>
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
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#7a6020', marginBottom: 10 }}>⚙️ Coefficient de revalorisation</div>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label>Multiplicateur appliqué à la copie du réel</label>
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

        {!canWork && (
          <div className="alert alert-info">Sélectionne un exercice source, un exercice cible et une version cible pour commencer.</div>
        )}

        {canWork && (
          <>
            {/* KPIs */}
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
              <div className="kpi-card" style={{ borderLeft: '4px solid var(--green)' }}>
                <div className="kpi-label">Réel {sourceEx?.code}</div>
                <div className={`kpi-value ${totalReel >= 0 ? 'positive' : 'negative'}`}>{fmt(totalReel)}</div>
                <div className="kpi-sub">{reelData.length} écritures importées</div>
              </div>
              <div className="kpi-card" style={{ borderLeft: '4px solid var(--gray400)' }}>
                <div className="kpi-label">Budget {sourceEx?.code}</div>
                <div className={`kpi-value ${totalBudgetSource >= 0 ? 'positive' : 'negative'}`}>{fmt(totalBudgetSource)}</div>
                <div className="kpi-sub">{budgetSource.length} lignes</div>
              </div>
              <div className="kpi-card" style={{ borderLeft: '4px solid var(--navy)' }}>
                <div className="kpi-label">Budget {cibleEx?.code} en cours</div>
                <div className={`kpi-value ${totalBudgetCible >= 0 ? 'positive' : 'negative'}`}>{fmt(totalBudgetCible)}</div>
                <div className="kpi-sub">{budgetCible.length} lignes saisies</div>
              </div>
            </div>

            {/* En-tête colonnes */}
            <div style={{ ...colStyle, padding: '10px 16px', background: 'var(--navy)', borderRadius: '10px 10px 0 0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Commission / Action</div>
              <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Réel {sourceEx?.code}</div>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Budget {sourceEx?.code}</div>
              <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Budget {cibleEx?.code} ✏️</div>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Écart</div>
            </div>

            {/* Corps */}
            <div className="card" style={{ borderRadius: '0 0 10px 10px' }}>
              {loading && <div className="loading">Chargement…</div>}

              {commissions.map(comm => {
                const actsComm = actions.filter(a => a.commission_id === comm.id)
                if (actsComm.length === 0) return null
                const commReel = reelData.filter(l => actsComm.some(a => a.id === l.action_id)).reduce((s, l) => s + parseFloat(l.montant || 0), 0)
                const commSrc = budgetSource.filter(l => actsComm.some(a => a.id === l.action_id)).reduce((s, l) => s + parseFloat(l.montant || 0), 0)
                const commCib = budgetCible.filter(l => actsComm.some(a => a.id === l.action_id)).reduce((s, l) => s + parseFloat(l.montant || 0), 0)

                return (
                  <div key={comm.id} style={{ borderBottom: '2px solid var(--gray200)' }}>
                    {/* En-tête commission */}
                    <div
                      onClick={() => toggleComm(comm.id)}
                      style={{ ...colStyle, padding: '12px 16px', cursor: 'pointer', background: openComms[comm.id] ? 'rgba(61,26,110,.05)' : 'var(--gray50)' }}
                    >
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
                        <button className="btn btn-xs btn-outline"
                          title={`Copier tout le réel "${comm.libelle}" ×${coeff}`}
                          onClick={e => { e.stopPropagation(); copierCommission(comm.id) }}>
                          ⧉ Tout copier
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    {openComms[comm.id] && actsComm.map(action => (
                      <ActionBloc
                        key={action.id}
                        action={action}
                        reelLignes={reelData.filter(l => l.action_id === action.id)}
                        budgetSourceLignes={budgetSource.filter(l => l.action_id === action.id)}
                        budgetCibleLignes={budgetCible.filter(l => l.action_id === action.id)}
                        exerciceCibleId={cibleExId}
                        versionCibleId={cibleVersionId}
                        coeff={coeff}
                        onRefresh={() => setRefreshKey(k => k + 1)}
                      />
                    ))}
                  </div>
                )
              })}

              {/* Total général */}
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
