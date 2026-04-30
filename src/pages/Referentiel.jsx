import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Referentiel() {
  const [commissions, setCommissions] = useState([])
  const [actions, setActions] = useState([])
  const [tab, setTab] = useState('commissions')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('budget_commissions').select('*').order('ordre'),
      supabase.from('budget_actions').select('*, budget_commissions(libelle, ordre)').order('ordre'),
    ])
    setCommissions(c || [])
    setActions(a || [])
  }

  // --- Commissions ---
  const openAddComm = () => { setForm({ code: '', libelle: '', ordre: commissions.length + 1 }); setEditId(null); setErr(''); setModal('comm') }
  const openEditComm = (c) => { setForm({ code: c.code, libelle: c.libelle, ordre: c.ordre }); setEditId(c.id); setErr(''); setModal('comm') }
  const saveComm = async () => {
    if (!form.code || !form.libelle) { setErr('Code et libellé requis'); return }
    setSaving(true); setErr('')
    const payload = { code: form.code.toUpperCase(), libelle: form.libelle, ordre: parseInt(form.ordre) || 0 }
    let error
    if (editId) ({ error } = await supabase.from('budget_commissions').update(payload).eq('id', editId))
    else ({ error } = await supabase.from('budget_commissions').insert(payload))
    setSaving(false)
    if (error) { setErr(error.message); return }
    setModal(null); load()
  }
  const deleteComm = async (id) => {
    if (!confirm('Supprimer cette commission ? Les actions associées seront aussi supprimées.')) return
    await supabase.from('budget_commissions').delete().eq('id', id)
    load()
  }

  // --- Actions ---
  const openAddAction = () => { setForm({ commission_id: commissions[0]?.id || '', code: '', libelle: '', libelle_complet: '', ordre: 0, est_actif: true }); setEditId(null); setErr(''); setModal('action') }
  const openEditAction = (a) => {
    setForm({ commission_id: a.commission_id, code: a.code, libelle: a.libelle, libelle_complet: a.libelle_complet, ordre: a.ordre, est_actif: a.est_actif })
    setEditId(a.id); setErr(''); setModal('action')
  }
  const saveAction = async () => {
    if (!form.commission_id || !form.code || !form.libelle) { setErr('Commission, code et libellé requis'); return }
    setSaving(true); setErr('')
    const comm = commissions.find(c => c.id === form.commission_id)
    const libelleFull = form.libelle_complet || `${comm?.libelle} / ${form.libelle}`
    const payload = {
      commission_id: form.commission_id,
      code: form.code.toUpperCase(),
      libelle: form.libelle,
      libelle_complet: libelleFull,
      ordre: parseInt(form.ordre) || 0,
      est_actif: form.est_actif,
    }
    let error
    if (editId) ({ error } = await supabase.from('budget_actions').update(payload).eq('id', editId))
    else ({ error } = await supabase.from('budget_actions').insert(payload))
    setSaving(false)
    if (error) { setErr(error.message); return }
    setModal(null); load()
  }
  const deleteAction = async (id) => {
    if (!confirm('Supprimer cette action ?')) return
    await supabase.from('budget_actions').delete().eq('id', id)
    load()
  }
  const toggleAction = async (a) => {
    await supabase.from('budget_actions').update({ est_actif: !a.est_actif }).eq('id', a.id)
    load()
  }

  // Auto-remplir libellé complet quand commission ou libellé change
  const updateActionForm = (field, value) => {
    const next = { ...form, [field]: value }
    if (field === 'libelle' || field === 'commission_id') {
      const comm = commissions.find(c => c.id === (field === 'commission_id' ? value : form.commission_id))
      if (comm) next.libelle_complet = `${comm.libelle} / ${field === 'libelle' ? value : form.libelle}`
    }
    setForm(next)
  }

  const grouped = commissions.map(c => ({
    ...c,
    actions: actions.filter(a => a.commission_id === c.id)
  }))

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Référentiel des actions</h2>
          <p>{commissions.length} commissions · {actions.length} actions</p>
        </div>
      </div>

      <div className="page-body">
        <div className="tabs">
          <button className={`tab ${tab === 'commissions' ? 'active' : ''}`} onClick={() => setTab('commissions')}>Commissions</button>
          <button className={`tab ${tab === 'actions' ? 'active' : ''}`} onClick={() => setTab('actions')}>Actions (liste complète)</button>
        </div>

        {/* Onglet Commissions → arborescence */}
        {tab === 'commissions' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-gold" onClick={openAddComm}>+ Commission</button>
            </div>
            {grouped.map(c => (
              <div key={c.id} className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="flex gap-2" style={{ alignItems: 'center' }}>
                    <span className="badge badge-navy">#{c.ordre}</span>
                    <strong style={{ color: 'var(--navy)' }}>{c.libelle}</strong>
                    <span className="text-muted" style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.code}</span>
                    <span className="chip">{c.actions.length} action{c.actions.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="inline-edit-actions">
                    <button className="btn btn-xs btn-outline" onClick={() => openEditComm(c)}>✏️</button>
                    <button className="btn btn-xs btn-danger" onClick={() => deleteComm(c.id)}>🗑</button>
                    <button className="btn btn-xs btn-gold" onClick={() => { setForm({ commission_id: c.id, code: '', libelle: '', libelle_complet: `${c.libelle} / `, ordre: c.actions.length + 1, est_actif: true }); setEditId(null); setErr(''); setModal('action') }}>+ Action</button>
                  </div>
                </div>
                {c.actions.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <tbody>
                        {c.actions.map(a => (
                          <tr key={a.id} style={{ opacity: a.est_actif ? 1 : 0.5 }}>
                            <td style={{ width: 40, color: 'var(--gray400)', fontSize: 12 }}>{a.ordre}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gray400)', width: 160 }}>{a.code}</td>
                            <td><strong>{a.libelle}</strong></td>
                            <td style={{ color: 'var(--gray400)', fontSize: 12 }}>{a.libelle_complet}</td>
                            <td style={{ width: 100 }}>
                              {!a.est_actif && <span className="badge badge-orange">Inactif</span>}
                            </td>
                            <td style={{ width: 120 }}>
                              <div className="inline-edit-actions">
                                <button className="btn btn-xs btn-outline" onClick={() => openEditAction(a)}>✏️</button>
                                <button className="btn btn-xs btn-outline" title={a.est_actif ? 'Désactiver' : 'Activer'} onClick={() => toggleAction(a)}>{a.est_actif ? '🔴' : '🟢'}</button>
                                <button className="btn btn-xs btn-danger" onClick={() => deleteAction(a.id)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Onglet Actions flat */}
        {tab === 'actions' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-gold" onClick={openAddAction}>+ Action</button>
            </div>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ordre</th>
                      <th>Code</th>
                      <th>Commission</th>
                      <th>Libellé</th>
                      <th>Libellé complet</th>
                      <th>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map(a => (
                      <tr key={a.id} style={{ opacity: a.est_actif ? 1 : 0.5 }}>
                        <td>{a.ordre}</td>
                        <td><span className="numero-badge">{a.code}</span></td>
                        <td style={{ fontSize: 12 }}>{a.budget_commissions?.libelle}</td>
                        <td>{a.libelle}</td>
                        <td style={{ color: 'var(--gray400)', fontSize: 12 }}>{a.libelle_complet}</td>
                        <td>{a.est_actif ? <span className="badge badge-green">Actif</span> : <span className="badge badge-orange">Inactif</span>}</td>
                        <td>
                          <div className="inline-edit-actions">
                            <button className="btn btn-xs btn-outline" onClick={() => openEditAction(a)}>✏️</button>
                            <button className="btn btn-xs btn-outline" onClick={() => toggleAction(a)}>{a.est_actif ? '🔴' : '🟢'}</button>
                            <button className="btn btn-xs btn-danger" onClick={() => deleteAction(a.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal Commission */}
      {modal === 'comm' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editId ? 'Modifier la commission' : 'Nouvelle commission'}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-error">{err}</div>}
              <div className="form-grid">
                <div className="form-row">
                  <div className="form-group">
                    <label>Code * (ex: ANIMATION)</label>
                    <input value={form.code || ''} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Ordre d'affichage</label>
                    <input type="number" value={form.ordre || ''} onChange={e => setForm(f => ({ ...f, ordre: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Libellé *</label>
                  <input value={form.libelle || ''} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={saveComm} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Action */}
      {modal === 'action' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editId ? 'Modifier l\'action' : 'Nouvelle action'}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-error">{err}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label>Commission *</label>
                  <select value={form.commission_id || ''} onChange={e => updateActionForm('commission_id', e.target.value)}>
                    {commissions.map(c => <option key={c.id} value={c.id}>{c.libelle}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Code * (ex: ANIM_BUVETTES)</label>
                    <input value={form.code || ''} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Ordre</label>
                    <input type="number" value={form.ordre || ''} onChange={e => setForm(f => ({ ...f, ordre: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Libellé court *</label>
                  <input value={form.libelle || ''} onChange={e => updateActionForm('libelle', e.target.value)} placeholder="ex: Buvettes" />
                </div>
                <div className="form-group">
                  <label>Libellé complet (BasiCompta)</label>
                  <input value={form.libelle_complet || ''} onChange={e => setForm(f => ({ ...f, libelle_complet: e.target.value }))} placeholder="ex: Animation / Buvettes" />
                </div>
                <div className="form-group">
                  <label>
                    <input type="checkbox" checked={form.est_actif || false} onChange={e => setForm(f => ({ ...f, est_actif: e.target.checked }))} style={{ width: 'auto', marginRight: 6 }} />
                    Action active
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={saveAction} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
