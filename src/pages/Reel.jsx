import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt, fmtDate, groupBy } from '../lib/utils'
import { exportReelXLSX } from '../lib/exportExcel'

const EMPTY_FORM = {
  numero: '', date_ecriture: '', code_comptable: '', libelle: '',
  commentaire: '', montant: '', action_id: '', banque: '', moyen_paiement: ''
}

export default function Reel() {
  const { exerciceId, currentExercice } = useExercice()
  const [ecritures, setEcritures] = useState([])
  const [actions, setActions] = useState([])
  const [commissions, setCommissions] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterBanque, setFilterBanque] = useState('')
  const [searchText, setSearchText] = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  useEffect(() => { loadReferentiel() }, [])
  useEffect(() => { if (exerciceId) load() }, [exerciceId])

  const loadReferentiel = async () => {
    const [{ data: comm }, { data: act }] = await Promise.all([
      supabase.from('budget_commissions').select('*').order('ordre'),
      supabase.from('budget_actions').select('*').eq('est_actif', true).order('ordre'),
    ])
    setCommissions(comm || [])
    setActions(act || [])
  }

  const load = async () => {
    const { data } = await supabase
      .from('budget_ecritures')
      .select('*, budget_actions(libelle, libelle_complet, commission_id, budget_commissions(libelle))')
      .eq('exercice_id', exerciceId)
      .order('date_ecriture', { ascending: false })
    setEcritures(data || [])
  }

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setErr(''); setModal('edit') }
  const openEdit = (e) => {
    setForm({
      numero: e.numero || '', date_ecriture: e.date_ecriture || '',
      code_comptable: e.code_comptable || '', libelle: e.libelle,
      commentaire: e.commentaire || '', montant: e.montant,
      action_id: e.action_id || '', banque: e.banque || '',
      moyen_paiement: e.moyen_paiement || '',
    })
    setEditId(e.id); setErr(''); setModal('edit')
  }

  const save = async () => {
    if (!form.date_ecriture || !form.libelle || form.montant === '') { setErr('Date, libellé et montant requis.'); return }
    setSaving(true); setErr('')
    const payload = { ...form, exercice_id: exerciceId, montant: parseFloat(form.montant), action_id: form.action_id || null }
    let error
    if (editId) ({ error } = await supabase.from('budget_ecritures').update(payload).eq('id', editId))
    else ({ error } = await supabase.from('budget_ecritures').insert(payload))
    setSaving(false)
    if (error) { setErr(error.message); return }
    setModal(null); load()
  }

  const deleteE = async (id) => {
    if (!confirm('Supprimer cette écriture ?')) return
    await supabase.from('budget_ecritures').delete().eq('id', id)
    load()
  }

  // Listes pour filtres
  const banques = [...new Set(ecritures.map(e => e.banque).filter(Boolean))]
  const months = [...new Set(ecritures.map(e => e.date_ecriture?.slice(0, 7)).filter(Boolean))].sort().reverse()

  const filtered = ecritures.filter(e => {
    if (filterAction && e.action_id !== filterAction) return false
    if (filterBanque && e.banque !== filterBanque) return false
    if (filterMonth && !e.date_ecriture?.startsWith(filterMonth)) return false
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!e.libelle.toLowerCase().includes(s) && !(e.commentaire || '').toLowerCase().includes(s) && !(e.numero || '').toLowerCase().includes(s)) return false
    }
    return true
  })

  const totalReel = filtered.reduce((s, e) => s + parseFloat(e.montant), 0)
  const totalRecettes = filtered.filter(e => parseFloat(e.montant) > 0).reduce((s, e) => s + parseFloat(e.montant), 0)
  const totalDepenses = filtered.filter(e => parseFloat(e.montant) < 0).reduce((s, e) => s + parseFloat(e.montant), 0)

  const exportCSV = () => {
    exportReelXLSX(filtered, currentExercice?.code || '')
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Écritures réelles</h2>
          <p>{currentExercice?.libelle} · {ecritures.length} écriture{ecritures.length > 1 ? 's' : ''}</p>
        </div>
        <div className="btn-group">
          <button className="btn btn-outline" onClick={exportCSV}>⬇ Excel</button>
          <button className="btn btn-gold" onClick={openAdd}>+ Écriture manuelle</button>
        </div>
      </div>

      <div className="page-body">
        {/* KPIs rapides */}
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
          <div className="kpi-card">
            <div className="kpi-label">Solde (sélection)</div>
            <div className={`kpi-value ${totalReel >= 0 ? 'positive' : 'negative'}`}>{fmt(totalReel)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Recettes</div>
            <div className="kpi-value positive">{fmt(totalRecettes)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Dépenses</div>
            <div className="kpi-value negative">{fmt(totalDepenses)}</div>
          </div>
        </div>

        {/* Filtres */}
        <div className="filter-bar">
          <input placeholder="🔍 N°, libellé…" value={searchText} onChange={e => setSearchText(e.target.value)} style={{ maxWidth: 200 }} />
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="">Tous les mois</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
            <option value="">Toutes les actions</option>
            {actions.map(a => <option key={a.id} value={a.id}>{a.libelle_complet}</option>)}
          </select>
          <select value={filterBanque} onChange={e => setFilterBanque(e.target.value)}>
            <option value="">Toutes les banques</option>
            {banques.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <span className="text-muted ml-auto">{filtered.length} ligne{filtered.length > 1 ? 's' : ''}</span>
        </div>

        {/* Tableau */}
        <div className="card">
          <div className="table-wrap scrollable-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Numéro</th>
                  <th>Libellé / Commentaire</th>
                  <th>Action</th>
                  <th className="right">Montant</th>
                  <th>Banque</th>
                  <th>Code</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(e.date_ecriture)}</td>
                    <td><span className="numero-badge">{e.numero}</span></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{e.libelle}</div>
                      {e.commentaire && <div style={{ fontSize: 11, color: 'var(--gray400)' }}>{e.commentaire}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {e.budget_actions ? (
                        <span className="chip">{e.budget_actions?.libelle}</span>
                      ) : (
                        <span className="badge badge-orange">Non affecté</span>
                      )}
                    </td>
                    <td className={`right amount ${parseFloat(e.montant) > 0 ? 'pos' : 'neg'}`}>{fmt(parseFloat(e.montant))}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray400)' }}>{e.banque}</td>
                    <td><span className="numero-badge">{e.code_comptable}</span></td>
                    <td>
                      <div className="inline-edit-actions">
                        <button className="btn btn-xs btn-outline" onClick={() => openEdit(e)}>✏️</button>
                        <button className="btn btn-xs btn-danger" onClick={() => deleteE(e.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8}><div className="empty-state"><div className="icon">💳</div><p>Aucune écriture</p></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editId ? 'Modifier l\'écriture' : 'Nouvelle écriture'}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-error">{err}</div>}
              <div className="form-grid">
                <div className="form-row">
                  <div className="form-group">
                    <label>Date *</label>
                    <input type="date" value={form.date_ecriture} onChange={e => setForm(f => ({ ...f, date_ecriture: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Numéro</label>
                    <input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder="ex: D157-2025/26" />
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
                <div className="form-row">
                  <div className="form-group">
                    <label>Montant * (négatif = dépense)</label>
                    <input type="number" step="0.01" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Code comptable</label>
                    <input value={form.code_comptable} onChange={e => setForm(f => ({ ...f, code_comptable: e.target.value }))} placeholder="ex: 6580" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Action</label>
                  <select value={form.action_id} onChange={e => setForm(f => ({ ...f, action_id: e.target.value }))}>
                    <option value="">— Non affectée —</option>
                    {commissions.map(c => (
                      <optgroup key={c.id} label={c.libelle}>
                        {actions.filter(a => a.commission_id === c.id).map(a => (
                          <option key={a.id} value={a.id}>{a.libelle}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Banque</label>
                    <input value={form.banque} onChange={e => setForm(f => ({ ...f, banque: e.target.value }))} placeholder="Crédit Agricole C/C" />
                  </div>
                  <div className="form-group">
                    <label>Moyen de paiement</label>
                    <input value={form.moyen_paiement} onChange={e => setForm(f => ({ ...f, moyen_paiement: e.target.value }))} placeholder="Virement, Chèque…" />
                  </div>
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
