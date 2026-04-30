-- ============================================================
-- HBC La Fillière - Budget Application Schema
-- Tables préfixées budget_ pour cohabiter avec la buvette
-- ============================================================

-- Exercices budgétaires (ex: 2025-26)
CREATE TABLE budget_exercices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  est_actif BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Commissions (niveau 1 : Animation, Bureau, Sportive...)
CREATE TABLE budget_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  ordre INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Actions (niveau 2 : Animation / Buvettes, Bureau / Personnel...)
CREATE TABLE budget_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID NOT NULL REFERENCES budget_commissions(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  libelle_complet TEXT NOT NULL,
  ordre INTEGER DEFAULT 0,
  est_actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Versions de budget (Initial, Révision 1, Simulation X, ...)
CREATE TABLE budget_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercice_id UUID NOT NULL REFERENCES budget_exercices(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  description TEXT,
  ordre INTEGER DEFAULT 0,
  est_reference BOOLEAN DEFAULT false,
  couleur TEXT DEFAULT '#0f1f3d',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lignes budgétaires
CREATE TABLE budget_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercice_id UUID NOT NULL REFERENCES budget_exercices(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES budget_versions(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES budget_actions(id),
  date_prevue DATE,
  libelle TEXT NOT NULL,
  commentaire TEXT,
  montant NUMERIC(10,2) NOT NULL,
  compte_comptable TEXT,
  rubrique TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Écritures réelles (importées depuis BasiCompta)
CREATE TABLE budget_ecritures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercice_id UUID NOT NULL REFERENCES budget_exercices(id) ON DELETE CASCADE,
  action_id UUID REFERENCES budget_actions(id),
  numero TEXT,
  date_ecriture DATE NOT NULL,
  code_comptable TEXT,
  libelle TEXT NOT NULL,
  commentaire TEXT,
  montant NUMERIC(10,2) NOT NULL,
  banque TEXT,
  moyen_paiement TEXT,
  date_rapprochement DATE,
  import_batch TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX idx_budget_versions_exercice  ON budget_versions(exercice_id);
CREATE INDEX idx_budget_lignes_exercice    ON budget_lignes(exercice_id);
CREATE INDEX idx_budget_lignes_version     ON budget_lignes(version_id);
CREATE INDEX idx_budget_lignes_action      ON budget_lignes(action_id);
CREATE INDEX idx_budget_ecritures_exercice ON budget_ecritures(exercice_id);
CREATE INDEX idx_budget_ecritures_action   ON budget_ecritures(action_id);
CREATE INDEX idx_budget_ecritures_numero   ON budget_ecritures(numero);

-- Vue synthèse par version et action
CREATE OR REPLACE VIEW budget_v_synthese AS
SELECT
  e.id AS exercice_id,
  e.code AS exercice_code,
  e.libelle AS exercice_libelle,
  c.id AS commission_id,
  c.libelle AS commission_libelle,
  c.ordre AS commission_ordre,
  a.id AS action_id,
  a.libelle AS action_libelle,
  a.libelle_complet AS action_libelle_complet,
  a.ordre AS action_ordre,
  v.id AS version_id,
  v.libelle AS version_libelle,
  v.est_reference,
  v.couleur AS version_couleur,
  v.ordre AS version_ordre,
  COALESCE(SUM(bl.montant), 0) AS montant_version,
  COALESCE((
    SELECT SUM(er.montant)
    FROM budget_ecritures er
    WHERE er.exercice_id = e.id AND er.action_id = a.id
  ), 0) AS reel,
  COUNT(DISTINCT bl.id) AS nb_lignes
FROM budget_exercices e
JOIN budget_versions v ON v.exercice_id = e.id
CROSS JOIN budget_actions a
JOIN budget_commissions c ON a.commission_id = c.id
LEFT JOIN budget_lignes bl ON bl.version_id = v.id AND bl.action_id = a.id
WHERE a.est_actif = true
GROUP BY
  e.id, e.code, e.libelle,
  c.id, c.libelle, c.ordre,
  a.id, a.libelle, a.libelle_complet, a.ordre,
  v.id, v.libelle, v.est_reference, v.couleur, v.ordre;

-- Fonction duplication de version (pour simulations)
CREATE OR REPLACE FUNCTION dupliquer_version(
  p_version_source_id UUID,
  p_nouveau_libelle TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_nouvelle_id UUID;
  v_exercice_id UUID;
  v_ordre INTEGER;
BEGIN
  SELECT exercice_id INTO v_exercice_id
  FROM budget_versions WHERE id = p_version_source_id;

  SELECT COALESCE(MAX(ordre), 0) + 1 INTO v_ordre
  FROM budget_versions WHERE exercice_id = v_exercice_id;

  INSERT INTO budget_versions (exercice_id, libelle, description, ordre, est_reference, couleur)
  SELECT exercice_id, p_nouveau_libelle, COALESCE(p_description, 'Copie de ' || libelle), v_ordre, false, '#c8a84b'
  FROM budget_versions WHERE id = p_version_source_id
  RETURNING id INTO v_nouvelle_id;

  INSERT INTO budget_lignes (exercice_id, version_id, action_id, date_prevue, libelle, commentaire, montant, compte_comptable, rubrique)
  SELECT exercice_id, v_nouvelle_id, action_id, date_prevue, libelle, commentaire, montant, compte_comptable, rubrique
  FROM budget_lignes WHERE version_id = p_version_source_id;

  RETURN v_nouvelle_id;
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE budget_exercices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_actions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lignes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_ecritures   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_budget_exercices"   ON budget_exercices   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_budget_commissions" ON budget_commissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_budget_actions"     ON budget_actions     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_budget_versions"    ON budget_versions    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_budget_lignes"      ON budget_lignes      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_budget_ecritures"   ON budget_ecritures   FOR ALL USING (true) WITH CHECK (true);
