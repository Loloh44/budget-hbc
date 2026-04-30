export const fmt = (n, decimals = 0) => {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n) + ' €'
}

export const fmtNum = (n) => {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export const fmtDate = (d) => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR')
}

export const fmtDateInput = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toISOString().slice(0, 10)
}

export const montantClass = (n) => {
  if (!n) return ''
  return n > 0 ? 'pos' : 'neg'
}

export const ecartClass = (ecart, montant) => {
  if (!ecart) return ''
  // Pour dépenses (montant < 0), rester sous le budget est bon
  // Pour recettes (montant > 0), dépasser le budget est bon
  const pct = montant !== 0 ? Math.abs(ecart / montant) : 0
  if (pct < 0.05) return 'good'
  if (pct < 0.15) return 'warn'
  return 'bad'
}

export const progressClass = (pct) => {
  if (pct <= 80) return 'good'
  if (pct <= 100) return 'warn'
  return 'over'
}

export const groupBy = (arr, key) => {
  return arr.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : item[key]
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {})
}

export const sum = (arr, key) => arr.reduce((s, x) => s + (parseFloat(x[key]) || 0), 0)
