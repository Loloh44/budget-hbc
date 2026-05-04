import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt } from '../lib/utils'
import { exportBudgetXLSX } from '../lib/exportExcel'

const EMPTY_FORM = {
  action_id: '', date_prevue: '', libelle: '', commentaire: '',
  montant: '', compte_comptable: '',
}

// Colonnes triables : clé interne → fonction d'accès sur une ligne
const SORT_COLS = {
  date:     l => l.date_prevue || '',
  action:   l => l.budget_actions?.libelle || '',
  libelle:  l => l.libelle || '',
  montant:  l => parseFloat(l.montant) || 0,
  compte:   l => l.compte_comptable || '',
}

function SortTh({ col, label, sort, onSort, className }) {
  const active = sort.col === col
  const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <th
      className={className}
      onClick={() => onSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      title="Cliquer pour trier"
    >
      {label}<span style={{ color: active ? 'var(--gold)' : 'var(--gray200)', fontSize: 11 }}>{active ? arrow : ' ⇅'}</span>
    </th>
  )
}

export default function Budget() {
  const { exerciceId, currentExercice } = useExercice()
  const [versions, setVersions] = useState([])
  const [versionId, setVersionId] = useState('')
  const [lignes, setLignes] = useState([])
  const [actions, setActions] = useState([])
  const [commissions, setCommissions] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [searchText, setSearchText] = useState('')
  const [sort, setSort] = useState({ col: null, dir: 'asc' })

  useEffect(() => { loadReferentiel() }, [])
  useEffect(() => { if (exerciceId) loadVersions() }, [exerciceId])
  useEffect(() => { if (versionId) loadLignes() }, [versionId])

  const loadReferentiel = async () => {
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('budget_commissions').select('*').order('ordre'),
      supabase.from('budget_actions').select('*, budget_commissions(libelle,ordre)').eq('est_actif', true).order('libelle'),
    ])
    setCommissions(c || [])
    // Tri alphabétique pour le filtre
    setActions((a || []).sort((x, y) => x.libelle_complet.localeCompare(y.libelle_complet, 'fr')))
  }

  const loadVersions = async () => {
    const { data } = await supabase.from('budget_versions').select('*').eq('exercice_id', exerciceId).order('ordre')
    setVersions(data || [])
    const ref = data?.find(v => v.est_reference) || data?.[0]
    if (ref) setVersionId(ref.id)
  }

  const loadLignes = async () => {
    const { data, error } = await supabase
      .from('budget_lignes')
      .select('*, budget_actions(libelle, libelle_complet, commission_id, ordre, budget_commissions(libelle, ordre))')
      .eq('version_id', versionId)
    if (error) { console.error('loadLignes:', error); setLignes([]); return }
    // Tri par défaut : commission → action
    const sorted = (data || []).sort((a, b) => {
      const cA = a.budget_actions?.budget_commissions?.ordre ?? 99
      const cB = b.budget_actions?.budget_commissions?.ordre ?? 99
      if (cA !== cB) return cA - cB
      return (a.budget_actions?.ordre ?? 99) - (b.budget_actions?.ordre ?? 99)
    })
    setLignes(sorted)
  }

  const handleSort = (col) => {
    setSort(prev => ({
      col,
      dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc'
    }))
  }

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setErr(''); setModal('edit') }
  const openEdit = (l) => {
    setForm({ action_id: l.action_id, date_prevue: l.date_prevue || '', libelle: l.libelle, commentaire: l.commentaire || '', montant: l.montant, compte_comptable: l.compte_comptable || '' })
    setEditId(l.id); setErr(''); setModal('edit')
  }

  const save = async () => {
    if (!form.action_id || !form.libelle || form.montant === '') { setErr('Action, libellé et montant requis.'); return }
    setSaving(true); setErr('')
    const payload = { ...form, exercice_id: exerciceId, version_id: versionId, montant: parseFloat(form.montant), updated_at: new Date().toISOString() }
    let error
    if (editId) ({ error } = await supabase.from('budget_lignes').update(payload).eq('id', editId))
    else ({ error } = await supabase.from('budget_lignes').insert(payload))
    setSaving(false)
    if (error) { setErr(error.message); return }
    setModal(null); loadLignes()
  }

  const deleteLigne = async (id) => {
    if (!confirm('Supprimer cette ligne ?')) return
    await supabase.from('budget_lignes').delete().eq('id', id)
    loadLignes()
  }

  // Filtrage
  let filtered = lignes.filter(l => {
    if (filterAction && l.action_id !== filterAction) return false
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!l.libelle.toLowerCase().includes(s) && !(l.commentaire || '').toLowerCase().includes(s)) return false
    }
    return true
  })

  // Tri colonnes (si actif, on abandonne le regroupement par commission)
  const isSorted = !!sort.col
  if (isSorted) {
    const fn = SORT_COLS[sort.col]
    filtered = [...filtered].sort((a, b) => {
      const vA = fn(a), vB = fn(b)
      const cmp = typeof vA === 'number' ? vA - vB : String(vA).localeCompare(String(vB), 'fr')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }

  // Regroupement par commission (uniquement si pas de tri actif)
  const grouped = {}
  if (!isSorted) {
    filtered.forEach(l => {
      const k = l.budget_actions?.budget_commissions?.libelle || 'Autre'
      if (!grouped[k]) grouped[k] = []
      grouped[k].push(l)
    })
  }

  const currentVersion = versions.find(v => v.id === versionId)
  const total = filtered.reduce((s, l) => s + parseFloat(l.montant), 0)

  const exportCSV = () => {
    exportBudgetXLSX(filtered, currentExercice?.code || '', currentVersion?.libelle || '')
  }

  const sortProps = { sort, onSort: handleSort }

  const renderRow = (l) => (
    <tr key={l.id}>
      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        {l.date_prevue ? new Date(l.date_prevue).toLocaleDateString('fr-FR', { month: '2-digit', year: '2-digit' }) : <span className="text-muted">—</span>}
      </td>
      <td style={{ fontSize: 12, color: 'var(--gray600)' }}>{l.budget_actions?.libelle}</td>
      <td>{l.libelle}</td>
      <td style={{ color: 'var(--gray400)', fontSize: 12 }}>{l.commentaire}</td>
      <td className={`right amount ${parseFloat(l.montant) > 0 ? 'pos' : 'neg'}`}>{fmt(parseFloat(l.montant))}</td>
      <td><span className="numero-badge">{l.compte_comptable}</span></td>
      <td>
        <div className="inline-edit-actions">
          <button className="btn btn-xs btn-outline" onClick={() => openEdit(l)}>✏️</button>
          <button className="btn btn-xs btn-danger" onClick={() => deleteLigne(l.id)}>🗑</button>
        </div>
      </td>
    </tr>
  )

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Lignes budgétaires</h2>
          <p>{currentExercice?.libelle}</p>
        </div>
        <div className="btn-group">
          <button className="btn btn-outline" onClick={exportCSV}>⬇ Excel</button>
          <button className="btn btn-gold" onClick={openAdd} disabled={!versionId}>+ Nouvelle ligne</button>
        </div>
      </div>

      <div className="page-body">
        {/* Sélecteur version */}
        {versions.length > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto' }}>
              {versions.map(v => (
                <button key={v.id} onClick={() => { setVersionId(v.id); setSort({ col: null, dir: 'asc' }) }}
                  style={{ padding: '12px 20px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', background: versionId === v.id ? v.couleur || 'var(--navy)' : 'transparent', color: versionId === v.id ? '#fff' : 'var(--gray600)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: versionId === v.id ? 600 : 400, borderBottom: versionId === v.id ? `3px solid ${v.couleur || 'var(--navy)'}` : '3px solid transparent', transition: 'all .15s' }}>
                  {v.est_reference && '⭐ '}{v.libelle}
                </button>
              ))}
            </div>
          </div>
        )}

        {versions.length === 0 && (
          <div className="alert alert-info">
            Aucune version. Créez-en une dans <a href="#/versions" style={{ color: 'var(--navy)', fontWeight: 600 }}>Versions & Simulations</a>.
          </div>
        )}

        {versionId && (
          <>
            <div className="filter-bar">
              <input placeholder="🔍 Rechercher…" value={searchText} onChange={e => setSearchText(e.target.value)} style={{ maxWidth: 220 }} />
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ maxWidth: 260 }}>
                <option value="">Toutes les actions</option>
                {actions.map(a => <option key={a.id} value={a.id}>{a.libelle_complet}</option>)}
              </select>
              {isSorted && (
                <button className="btn btn-xs btn-outline" onClick={() => setSort({ col: null, dir: 'asc' })} title="Revenir au groupement par commission">
                  ↺ Regrouper par commission
                </button>
              )}
              <span className="text-muted ml-auto">
                {filtered.length} ligne{filtered.length > 1 ? 's' : ''} · <strong style={{ color: total >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(total)}</strong>
              </span>
            </div>

            <div className="card">
              <div className="table-wrap scrollable-table">
                <table>
                  <thead>
                    <tr>
                      <SortTh col="date"    label="Date"      {...sortProps} />
                      <SortTh col="action"  label="Action"    {...sortProps} />
                      <SortTh col="libelle" label="Libellé"   {...sortProps} />
                      <th>Commentaire</th>
                      <SortTh col="montant" label="Montant"   {...sortProps} className="right" />
                      <SortTh col="compte"  label="Compte"    {...sortProps} />
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {isSorted
                      ? filtered.map(renderRow)
                      : Object.entries(grouped).map(([comm, rows]) => {
                          const tot = rows.reduce((s, l) => s + parseFloat(l.montant), 0)
                          return [
                            <tr key={`c-${comm}`} className="commission-row">
                              <td colSpan={7}>{comm} · <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>{fmt(tot)}</span></td>
                            </tr>,
                            ...rows.map(renderRow)
                          ]
                        })
                    }
                    {filtered.length === 0 && (
                      <tr><td colSpan={7}><div className="empty-state"><div className="icon">📋</div><p>Aucune ligne</p></div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editId ? 'Modifier la ligne' : 'Nouvelle ligne'}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-error">{err}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label>Action *</label>
                  <select value={form.action_id} onChange={e => setForm(f => ({ ...f, action_id: e.target.value }))}>
                    <option value="">— Sélectionner —</option>
                    {commissions.map(c => (
                      <optgroup key={c.id} label={c.libelle}>
                        {actions.filter(a => a.commission_id === c.id).sort((x,y) => x.libelle.localeCompare(y.libelle,'fr')).map(a => (
                          <option key={a.id} value={a.id}>{a.libelle}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date prévue</label>
                    <input type="date" value={form.date_prevue} onChange={e => setForm(f => ({ ...f, date_prevue: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Compte comptable</label>
                    <input value={form.compte_comptable} onChange={e => setForm(f => ({ ...f, compte_comptable: e.target.value }))} placeholder="ex: 6580" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Libellé *</label>
                  <input value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Commentaire</label>
                  <input value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Montant * (négatif = dépense, positif = recette)</label>
                  <input type="number" step="0.01" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} placeholder="ex: -500 ou 1200" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
