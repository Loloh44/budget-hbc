import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmtDate } from '../lib/utils'

const EMPTY_FORM = { code: '', libelle: '', date_debut: '', date_fin: '', est_actif: false }

export default function Exercices() {
  const { exercices, reload, exerciceId, setExerciceId } = useExercice()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const openAdd = () => {
    // Pré-remplir avec l'exercice suivant
    const year = new Date().getFullYear()
    setForm({
      code: `${year}-${String(year + 1).slice(-2)}`,
      libelle: `Saison ${year}-${year + 1}`,
      date_debut: `${year}-06-01`,
      date_fin: `${year + 1}-05-31`,
      est_actif: false,
    })
    setEditId(null); setErr(''); setModal(true)
  }

  const openEdit = (ex) => {
    setForm({ code: ex.code, libelle: ex.libelle, date_debut: ex.date_debut, date_fin: ex.date_fin, est_actif: ex.est_actif })
    setEditId(ex.id); setErr(''); setModal(true)
  }

  const save = async () => {
    if (!form.code || !form.libelle || !form.date_debut || !form.date_fin) { setErr('Tous les champs sont requis'); return }
    setSaving(true); setErr('')
    let error
    if (editId) {
      ({ error } = await supabase.from('budget_exercices').update({ ...form }).eq('id', editId))
    } else {
      const { data, error: e } = await supabase.from('budget_exercices').insert({ ...form }).select('id').single()
      error = e
      if (!error && form.est_actif) setExerciceId(data.id)
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setModal(false); reload()
  }

  const toggleActif = async (ex) => {
    await supabase.from('budget_exercices').update({ est_actif: !ex.est_actif }).eq('id', ex.id)
    if (!ex.est_actif) setExerciceId(ex.id)
    reload()
  }

  const deleteEx = async (id) => {
    if (!confirm('Supprimer cet exercice ? Toutes les données associées seront supprimées.')) return
    await supabase.from('budget_exercices').delete().eq('id', id)
    reload()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Exercices budgétaires</h2>
          <p>Gestion des saisons (juin → mai)</p>
        </div>
        <button className="btn btn-gold" onClick={openAdd}>+ Nouvel exercice</button>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Libellé</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {exercices.map(ex => (
                  <tr key={ex.id} style={{ background: ex.id === exerciceId ? 'rgba(200,168,75,.05)' : undefined }}>
                    <td><strong>{ex.code}</strong></td>
                    <td>{ex.libelle}</td>
                    <td>{fmtDate(ex.date_debut)}</td>
                    <td>{fmtDate(ex.date_fin)}</td>
                    <td>
                      {ex.est_actif
                        ? <span className="badge badge-green">✓ Actif</span>
                        : <span className="badge badge-navy">Archivé</span>}
                      {ex.id === exerciceId && <span className="badge badge-gold" style={{ marginLeft: 6 }}>Sélectionné</span>}
                    </td>
                    <td>
                      <div className="inline-edit-actions">
                        <button className="btn btn-xs btn-outline" onClick={() => openEdit(ex)}>✏️</button>
                        <button className="btn btn-xs btn-outline" title={ex.est_actif ? 'Archiver' : 'Activer'} onClick={() => toggleActif(ex)}>
                          {ex.est_actif ? '📦' : '✅'}
                        </button>
                        <button className="btn btn-xs btn-danger" onClick={() => deleteEx(ex.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {exercices.length === 0 && (
                  <tr><td colSpan={6}><div className="empty-state"><div className="icon">📅</div><p>Aucun exercice</p></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="alert alert-info" style={{ marginTop: 20 }}>
          <strong>Note :</strong> L'exercice "actif" est celui proposé par défaut à l'ouverture de l'application. Plusieurs exercices peuvent coexister pour permettre la comparaison dans la synthèse.
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editId ? 'Modifier l\'exercice' : 'Nouvel exercice'}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-error">{err}</div>}
              <div className="form-grid">
                <div className="form-row">
                  <div className="form-group">
                    <label>Code * (ex: 2025-26)</label>
                    <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>
                      <input type="checkbox" checked={form.est_actif} onChange={e => setForm(f => ({ ...f, est_actif: e.target.checked }))} style={{ width: 'auto', marginRight: 6 }} />
                      Exercice actif
                    </label>
                  </div>
                </div>
                <div className="form-group">
                  <label>Libellé *</label>
                  <input value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date de début *</label>
                    <input type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Date de fin *</label>
                    <input type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
