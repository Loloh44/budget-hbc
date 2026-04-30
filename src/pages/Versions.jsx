import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt } from '../lib/utils'

const COULEURS = [
  { label: 'Marine',  val: '#0f1f3d' },
  { label: 'Or',      val: '#c8a84b' },
  { label: 'Vert',    val: '#1a7a4a' },
  { label: 'Rouge',   val: '#c0392b' },
  { label: 'Violet',  val: '#6c3483' },
  { label: 'Bleu',    val: '#1a5276' },
  { label: 'Orange',  val: '#d97706' },
  { label: 'Gris',    val: '#5a6472' },
]

const EMPTY_FORM = { libelle: '', description: '', couleur: '#0f1f3d', est_reference: false }

export default function Versions() {
  const { exerciceId, currentExercice } = useExercice()
  const [versions, setVersions] = useState([])
  const [totaux, setTotaux] = useState({})
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [dupId, setDupId] = useState(null)
  const [dupLibelle, setDupLibelle] = useState('')
  const [dupDesc, setDupDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { if (exerciceId) load() }, [exerciceId])

  const load = async () => {
    const { data } = await supabase
      .from('budget_versions')
      .select('*')
      .eq('exercice_id', exerciceId)
      .order('ordre')
    setVersions(data || [])
    if (data?.length) loadTotaux(data.map(v => v.id))
  }

  const loadTotaux = async (versionIds) => {
    const { data } = await supabase
      .from('budget_lignes')
      .select('version_id, montant')
      .in('version_id', versionIds)
    const t = {}
    ;(data || []).forEach(l => {
      if (!t[l.version_id]) t[l.version_id] = { total: 0, recettes: 0, depenses: 0, nb: 0 }
      const m = parseFloat(l.montant)
      t[l.version_id].total += m
      t[l.version_id].nb++
      if (m > 0) t[l.version_id].recettes += m
      else t[l.version_id].depenses += m
    })
    setTotaux(t)
  }

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, ordre: versions.length + 1 })
    setEditId(null); setErr(''); setModal('form')
  }

  const openEdit = (v) => {
    setForm({ libelle: v.libelle, description: v.description || '', couleur: v.couleur || '#0f1f3d', est_reference: v.est_reference, ordre: v.ordre })
    setEditId(v.id); setErr(''); setModal('form')
  }

  const openDup = (v) => {
    setDupId(v.id)
    setDupLibelle(`Copie de ${v.libelle}`)
    setDupDesc('')
    setErr(''); setModal('dup')
  }

  const save = async () => {
    if (!form.libelle) { setErr('Le libellé est requis'); return }
    setSaving(true); setErr('')
    const payload = {
      exercice_id: exerciceId,
      libelle: form.libelle,
      description: form.description || null,
      couleur: form.couleur,
      est_reference: form.est_reference,
      ordre: parseInt(form.ordre) || versions.length + 1,
      updated_at: new Date().toISOString(),
    }
    let error
    if (editId) ({ error } = await supabase.from('budget_versions').update(payload).eq('id', editId))
    else ({ error } = await supabase.from('budget_versions').insert(payload))
    setSaving(false)
    if (error) { setErr(error.message); return }
    setModal(null); load()
  }

  const duplicate = async () => {
    if (!dupLibelle) { setErr('Libellé requis'); return }
    setSaving(true); setErr('')
    const { data, error } = await supabase.rpc('dupliquer_version', {
      p_version_source_id: dupId,
      p_nouveau_libelle: dupLibelle,
      p_description: dupDesc || null,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setModal(null); load()
  }

  const setReference = async (v) => {
    // Retirer le flag sur toutes les versions de l'exercice
    await supabase.from('budget_versions').update({ est_reference: false }).eq('exercice_id', exerciceId)
    await supabase.from('budget_versions').update({ est_reference: true }).eq('id', v.id)
    load()
  }

  const deleteVersion = async (id) => {
    const nb = totaux[id]?.nb || 0
    if (!confirm(`Supprimer cette version ?${nb > 0 ? `\n\n⚠️ Elle contient ${nb} ligne(s) budgétaire(s) qui seront aussi supprimées.` : ''}`)) return
    await supabase.from('budget_versions').delete().eq('id', id)
    load()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Versions & Simulations</h2>
          <p>{currentExercice?.libelle} · {versions.length} version{versions.length > 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-gold" onClick={openAdd}>+ Nouvelle version</button>
      </div>

      <div className="page-body">
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <strong>Comment ça fonctionne :</strong> chaque version est un jeu de lignes budgétaires indépendant. La version <strong>Référence</strong> est celle affichée par défaut dans la synthèse. Utilisez <strong>Dupliquer</strong> pour partir d'une base existante et faire des simulations sans toucher au budget officiel.
        </div>

        {versions.length === 0 && (
          <div className="card">
            <div className="empty-state">
              <div className="icon">🗂️</div>
              <p>Aucune version pour cet exercice.<br />Créez un "Budget Initial" pour commencer.</p>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 14 }}>
          {versions.map(v => {
            const t = totaux[v.id] || { total: 0, recettes: 0, depenses: 0, nb: 0 }
            return (
              <div key={v.id} className="card" style={{ borderLeft: `4px solid ${v.couleur || '#0f1f3d'}` }}>
                <div className="card-header">
                  <div className="flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: v.couleur || '#0f1f3d', flexShrink: 0 }} />
                    <strong style={{ fontSize: 15, color: 'var(--navy)' }}>{v.libelle}</strong>
                    {v.est_reference && <span className="badge badge-gold">⭐ Référence</span>}
                    <span className="chip">{t.nb} ligne{t.nb > 1 ? 's' : ''}</span>
                  </div>
                  <div className="inline-edit-actions">
                    {!v.est_reference && (
                      <button className="btn btn-xs btn-outline" title="Définir comme référence" onClick={() => setReference(v)}>⭐ Référence</button>
                    )}
                    <button className="btn btn-xs btn-outline" title="Dupliquer pour simulation" onClick={() => openDup(v)}>⧉ Dupliquer</button>
                    <button className="btn btn-xs btn-outline" onClick={() => openEdit(v)}>✏️</button>
                    <button className="btn btn-xs btn-danger" onClick={() => deleteVersion(v.id)}>🗑</button>
                  </div>
                </div>
                <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, paddingTop: 14 }}>
                  {v.description && (
                    <div style={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--gray600)', fontStyle: 'italic' }}>
                      {v.description}
                    </div>
                  )}
                  <div>
                    <div className="kpi-label">Résultat prévisionnel</div>
                    <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: t.total >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>
                      {fmt(t.total)}
                    </div>
                  </div>
                  <div>
                    <div className="kpi-label">Recettes prévues</div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--green)', marginTop: 2 }}>{fmt(t.recettes)}</div>
                  </div>
                  <div>
                    <div className="kpi-label">Dépenses prévues</div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--red)', marginTop: 2 }}>{fmt(t.depenses)}</div>
                  </div>
                  <div>
                    <div className="kpi-label">Créée le</div>
                    <div style={{ fontSize: 13, color: 'var(--gray600)', marginTop: 2 }}>{new Date(v.created_at).toLocaleDateString('fr-FR')}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal création/édition */}
      {modal === 'form' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editId ? 'Modifier la version' : 'Nouvelle version'}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-error">{err}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label>Libellé * (ex: Budget Initial, Révision 1, Simulation hausse licences)</label>
                  <input value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))} placeholder="ex: Révision 1 — Janvier 2026" />
                </div>
                <div className="form-group">
                  <label>Description (notes libres)</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="ex: Révision après résultats buvette Q1, hausse du budget licences estimée à +8%..." />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Couleur dans le dashboard</label>
                    <select value={form.couleur} onChange={e => setForm(f => ({ ...f, couleur: e.target.value }))}>
                      {COULEURS.map(c => <option key={c.val} value={c.val}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Ordre d'affichage</label>
                    <input type="number" value={form.ordre || ''} onChange={e => setForm(f => ({ ...f, ordre: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.est_reference} onChange={e => setForm(f => ({ ...f, est_reference: e.target.checked }))} style={{ width: 'auto' }} />
                    Version de référence (affichée par défaut dans la synthèse)
                  </label>
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

      {/* Modal duplication */}
      {modal === 'dup' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Dupliquer la version</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-error">{err}</div>}
              <div className="alert alert-info" style={{ marginBottom: 14 }}>
                Toutes les lignes budgétaires seront copiées dans la nouvelle version. Vous pourrez les modifier librement sans impacter l'original.
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Nom de la nouvelle version *</label>
                  <input value={dupLibelle} onChange={e => setDupLibelle(e.target.value)} placeholder="ex: Simulation +5% licences" autoFocus />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea value={dupDesc} onChange={e => setDupDesc(e.target.value)} placeholder="Décrivez l'hypothèse testée…" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn btn-gold" onClick={duplicate} disabled={saving}>{saving ? 'Duplication…' : '⧉ Dupliquer'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
