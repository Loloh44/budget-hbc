import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt, groupBy } from '../lib/utils'

export default function Dashboard() {
  const { exerciceId, exercices, setExerciceId, currentExercice } = useExercice()
  const [versions, setVersions] = useState([])
  const [selectedVersionIds, setSelectedVersionIds] = useState([])
  const [synthese, setSynthese] = useState([]) // rows from v_synthese
  const [compareExId, setCompareExId] = useState('')
  const [compareVersions, setCompareVersions] = useState([])
  const [compareSynthese, setCompareSynthese] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (exerciceId) loadVersions() }, [exerciceId])
  useEffect(() => { if (compareExId) loadCompareVersions(); else { setCompareVersions([]); setCompareSynthese([]) } }, [compareExId])
  useEffect(() => { if (selectedVersionIds.length) loadSynthese() }, [selectedVersionIds])

  const loadVersions = async () => {
    const { data } = await supabase.from('budget_versions').select('*').eq('exercice_id', exerciceId).order('ordre')
    setVersions(data || [])
    const ref = data?.find(v => v.est_reference) || data?.[0]
    if (ref) setSelectedVersionIds([ref.id])
  }

  const loadSynthese = async () => {
    setLoading(true)
    const { data } = await supabase.from('budget_v_synthese').select('*').eq('exercice_id', exerciceId).in('version_id', selectedVersionIds).order('commission_ordre').order('action_ordre')
    setSynthese(data || [])
    setLoading(false)
  }

  const loadCompareVersions = async () => {
    const { data } = await supabase.from('budget_versions').select('*').eq('exercice_id', compareExId).order('ordre')
    setCompareVersions(data || [])
    const ref = data?.find(v => v.est_reference) || data?.[0]
    if (ref) {
      const { data: s } = await supabase.from('budget_v_synthese').select('*').eq('exercice_id', compareExId).eq('version_id', ref.id)
      setCompareSynthese(s || [])
    }
  }

  const toggleVersion = (id) => {
    setSelectedVersionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // Construire les données par action pour l'affichage
  // On veut : pour chaque action, le montant réel (identique quelle que soit la version), + le montant de chaque version sélectionnée
  const actionData = {}
  const commissionOrder = {}
  synthese.forEach(row => {
    const key = row.action_id
    if (!actionData[key]) {
      actionData[key] = {
        action_id: row.action_id,
        action_libelle: row.action_libelle,
        action_libelle_complet: row.action_libelle_complet,
        action_ordre: row.action_ordre,
        commission_libelle: row.commission_libelle,
        commission_ordre: row.commission_ordre,
        reel: parseFloat(row.reel || 0),
        versions: {},
      }
      commissionOrder[row.commission_libelle] = row.commission_ordre
    }
    actionData[key].versions[row.version_id] = {
      montant: parseFloat(row.montant_version || 0),
      libelle: row.version_libelle,
      couleur: row.version_couleur,
      est_reference: row.est_reference,
    }
  })

  const actions = Object.values(actionData).sort((a, b) => {
    if (a.commission_ordre !== b.commission_ordre) return a.commission_ordre - b.commission_ordre
    return a.action_ordre - b.action_ordre
  })

  const grouped = groupBy(actions, 'commission_libelle')
  const commissions = Object.keys(grouped).sort((a, b) => (commissionOrder[a] || 0) - (commissionOrder[b] || 0))

  // Totaux
  const totaux = selectedVersionIds.reduce((acc, vid) => {
    const v = versions.find(v => v.id === vid)
    acc[vid] = {
      libelle: v?.libelle || '',
      couleur: v?.couleur || 'var(--navy)',
      total: actions.reduce((s, a) => s + (a.versions[vid]?.montant || 0), 0),
    }
    return acc
  }, {})
  const totalReel = actions.reduce((s, a) => s + a.reel, 0)
  const refVersionId = versions.find(v => v.est_reference)?.id || selectedVersionIds[0]
  const totalRefBudget = totaux[refVersionId]?.total || 0

  const ecartClass = (ecart) => Math.abs(ecart) < 200 ? 'good' : Math.abs(ecart) < 1000 ? 'warn' : 'bad'

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Synthèse Budget vs Réel</h2>
          <p>{currentExercice?.libelle}</p>
        </div>
        <div className="flex gap-2" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--gray400)' }}>Comparer avec :</span>
          <select className="exercice-select" style={{ maxWidth: 180 }} value={compareExId} onChange={e => setCompareExId(e.target.value)}>
            <option value="">Autre exercice…</option>
            {exercices.filter(e => e.id !== exerciceId).map(ex => <option key={ex.id} value={ex.id}>{ex.code}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        {/* KPIs */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Budget référence</div>
            <div className={`kpi-value ${totalRefBudget >= 0 ? 'positive' : 'negative'}`}>{fmt(totalRefBudget)}</div>
            <div className="kpi-sub">{versions.find(v => v.id === refVersionId)?.libelle}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Réel à date</div>
            <div className={`kpi-value ${totalReel >= 0 ? 'positive' : 'negative'}`}>{fmt(totalReel)}</div>
            <div className="kpi-sub">{currentExercice?.code}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Écart Réel / Budget</div>
            <div className={`kpi-value ${(totalReel - totalRefBudget) >= 0 ? 'positive' : 'negative'}`}>{fmt(totalReel - totalRefBudget)}</div>
            <div className="kpi-sub">{totalRefBudget !== 0 ? `${Math.round(totalReel / totalRefBudget * 100)}% réalisé` : '—'}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Versions actives</div>
            <div className="kpi-value">{selectedVersionIds.length}</div>
            <div className="kpi-sub">{versions.length} version{versions.length > 1 ? 's' : ''} disponible{versions.length > 1 ? 's' : ''}</div>
          </div>
        </div>

        {/* Sélecteur versions à afficher */}
        {versions.length > 1 && (
          <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
            <div className="flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--gray400)', marginRight: 4 }}>Afficher :</span>
              {versions.map(v => (
                <button
                  key={v.id}
                  onClick={() => toggleVersion(v.id)}
                  style={{
                    padding: '5px 12px', borderRadius: 99, fontSize: 12, fontFamily: 'var(--font-body)',
                    cursor: 'pointer', border: `2px solid ${v.couleur || 'var(--navy)'}`,
                    background: selectedVersionIds.includes(v.id) ? v.couleur || 'var(--navy)' : 'transparent',
                    color: selectedVersionIds.includes(v.id) ? '#fff' : v.couleur || 'var(--navy)',
                    fontWeight: 500, transition: 'all .15s',
                  }}
                >
                  {v.est_reference && '⭐ '}{v.libelle}
                </button>
              ))}
              {loading && <span className="text-muted" style={{ marginLeft: 8 }}>Chargement…</span>}
            </div>
          </div>
        )}

        {/* Tableau synthèse */}
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Action</th>
                  {selectedVersionIds.map(vid => {
                    const v = versions.find(v => v.id === vid)
                    return <th key={vid} className="right" style={{ color: v?.couleur }}>{v?.libelle}</th>
                  })}
                  <th className="right">Réel</th>
                  <th className="right">Écart</th>
                  <th style={{ width: 110 }}>Réalisation</th>
                  {compareExId && compareVersions.length > 0 && (
                    <th className="right" style={{ color: 'var(--gray400)' }}>
                      {exercices.find(e => e.id === compareExId)?.code} (réf.)
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {commissions.map(comm => {
                  const rows = grouped[comm]
                  const commTotaux = selectedVersionIds.reduce((acc, vid) => {
                    acc[vid] = rows.reduce((s, a) => s + (a.versions[vid]?.montant || 0), 0)
                    return acc
                  }, {})
                  const commReel = rows.reduce((s, a) => s + a.reel, 0)
                  const commRefBudget = commTotaux[refVersionId] || 0
                  return [
                    <tr key={`com-${comm}`} className="commission-row">
                      <td colSpan={selectedVersionIds.length + 3 + (compareExId ? 1 : 0)}>{comm}</td>
                    </tr>,
                    ...rows.map(a => {
                      const refBudget = a.versions[refVersionId]?.montant || 0
                      const ecart = a.reel - refBudget
                      const pct = refBudget !== 0 ? Math.round(a.reel / refBudget * 100) : null
                      const compareRow = compareSynthese.find(r => r.action_id === a.action_id)
                      return (
                        <tr key={a.action_id}>
                          <td style={{ paddingLeft: 22 }}>{a.action_libelle}</td>
                          {selectedVersionIds.map(vid => {
                            const m = a.versions[vid]?.montant || 0
                            const v = versions.find(v => v.id === vid)
                            return (
                              <td key={vid} className={`right amount ${m > 0 ? 'pos' : m < 0 ? 'neg' : ''}`}>
                                {m !== 0 ? fmt(m) : <span className="text-muted">—</span>}
                              </td>
                            )
                          })}
                          <td className={`right amount ${a.reel > 0 ? 'pos' : a.reel < 0 ? 'neg' : ''}`}>
                            {a.reel !== 0 ? fmt(a.reel) : <span className="text-muted">—</span>}
                          </td>
                          <td className={`right amount ecart ${ecartClass(ecart)}`}>
                            {(refBudget !== 0 || a.reel !== 0) ? fmt(ecart) : <span className="text-muted">—</span>}
                          </td>
                          <td>
                            {pct !== null && (
                              <>
                                <span className="text-muted" style={{ fontSize: 11 }}>{pct}%</span>
                                <div className="progress-bar-wrap">
                                  <div className={`progress-bar ${pct > 100 ? 'over' : pct > 80 ? 'warn' : 'good'}`} style={{ width: `${Math.min(Math.abs(pct), 100)}%` }} />
                                </div>
                              </>
                            )}
                          </td>
                          {compareExId && <td className="right amount text-muted">{compareRow ? fmt(parseFloat(compareRow.reel || 0)) : '—'}</td>}
                        </tr>
                      )
                    }),
                    <tr key={`tot-${comm}`} className="subtotal-row">
                      <td style={{ paddingLeft: 22, fontStyle: 'italic' }}>Total {comm}</td>
                      {selectedVersionIds.map(vid => <td key={vid} className={`right amount ${commTotaux[vid] >= 0 ? 'pos' : 'neg'}`}>{fmt(commTotaux[vid])}</td>)}
                      <td className={`right amount ${commReel >= 0 ? 'pos' : 'neg'}`}>{fmt(commReel)}</td>
                      <td className={`right amount ecart ${ecartClass(commReel - commRefBudget)}`}>{fmt(commReel - commRefBudget)}</td>
                      <td />
                      {compareExId && <td className="right amount text-muted">{fmt(compareSynthese.filter(r => rows.some(a => a.action_id === r.action_id)).reduce((s, r) => s + parseFloat(r.reel || 0), 0))}</td>}
                    </tr>
                  ]
                })}
                <tr className="total-row">
                  <td>TOTAL GÉNÉRAL</td>
                  {selectedVersionIds.map(vid => <td key={vid} className="right">{fmt(totaux[vid]?.total || 0)}</td>)}
                  <td className="right">{fmt(totalReel)}</td>
                  <td className="right">{fmt(totalReel - totalRefBudget)}</td>
                  <td />
                  {compareExId && <td className="right">{fmt(compareSynthese.reduce((s, r) => s + parseFloat(r.reel || 0), 0))}</td>}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
