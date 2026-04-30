-- ============================================================
-- Données initiales - Référentiel Actions HBC La Fillière
-- ============================================================

-- Commissions
INSERT INTO budget_commissions (code, libelle, ordre) VALUES
  ('ANIMATION',      'Animation',      1),
  ('BUREAU',         'Bureau',         2),
  ('CARITATIF',      'Caritatif',      3),
  ('COMMUNICATION',  'Communication',  4),
  ('EQUIPEMENT',     'Equipement',     5),
  ('PARTENAIRES',    'Partenaires',    6),
  ('SPORTIVE',       'Sportive',       7),
  ('SUPPORTERS',     'Supporters',     8);

-- Actions Animation
WITH c AS (SELECT id FROM budget_commissions WHERE code = 'ANIMATION')
INSERT INTO budget_actions (commission_id, code, libelle, libelle_complet, ordre)
SELECT c.id, code, libelle, libelle_complet, ordre FROM c,
(VALUES
  ('ANIM_BUVETTES',         'Buvettes',           'Animation / Buvettes',           1),
  ('ANIM_MARCHE_NOEL',      'Marché de Noël',      'Animation / Marché de Noël',      2),
  ('ANIM_PAQUES',           'Pâques',              'Animation / Pâques',              3),
  ('ANIM_PARMELHAND',       'Parmel''hand 2025',   'Animation / Parmel''hand 2025',   4),
  ('ANIM_PHOTOS',           'Photos',              'Animation / Photos',              5),
  ('ANIM_PLATEAUX_SENIORS', 'Plateaux Seniors',    'Animation / Plateaux Seniors',    6),
  ('ANIM_SOIREE_CLUB',      'Soirée Club',         'Animation / Soirée Club',         7)
) AS v(code, libelle, libelle_complet, ordre);

-- Actions Bureau
WITH c AS (SELECT id FROM budget_commissions WHERE code = 'BUREAU')
INSERT INTO budget_actions (commission_id, code, libelle, libelle_complet, ordre)
SELECT c.id, code, libelle, libelle_complet, ordre FROM c,
(VALUES
  ('BUR_CADEAUX',        'Cadeaux Reception',  'Bureau / Cadeaux Reception',   1),
  ('BUR_FOURNITURES',    'Fournitures',         'Bureau / Fournitures',         2),
  ('BUR_FRAIS_BANCAIRES','Frais Bancaires',     'Bureau / Frais Bancaires',     3),
  ('BUR_HONORAIRES',     'Honoraires',          'Bureau / Honoraires',          4),
  ('BUR_LOGICIELS',      'Logiciels',           'Bureau / Logiciels',           5),
  ('BUR_PERSONNEL',      'Personnel',           'Bureau / Personnel',           6),
  ('BUR_TELECOM',        'Telecom',             'Bureau / Telecom',             7),
  ('BUR_TRAVAUX',        'Travaux',             'Bureau / Travaux',             8)
) AS v(code, libelle, libelle_complet, ordre);

-- Actions Caritatif
WITH c AS (SELECT id FROM budget_commissions WHERE code = 'CARITATIF')
INSERT INTO budget_actions (commission_id, code, libelle, libelle_complet, ordre)
SELECT c.id, code, libelle, libelle_complet, ordre FROM c,
(VALUES
  ('CAR_CROSS_COEUR',  'Cross du Cœur',  'Caritatif / Cross du Cœur',  1),
  ('CAR_MOVEMBER',     'Movember',        'Caritatif / Movember',        2),
  ('CAR_OCTOBRE_ROSE', 'Octobre Rose',    'Caritatif / Octobre Rose',    3)
) AS v(code, libelle, libelle_complet, ordre);

-- Actions Communication
WITH c AS (SELECT id FROM budget_commissions WHERE code = 'COMMUNICATION')
INSERT INTO budget_actions (commission_id, code, libelle, libelle_complet, ordre)
SELECT c.id, code, libelle, libelle_complet, ordre FROM c,
(VALUES
  ('COM_LOGICIELS', 'Logiciels', 'Communication / Logiciels', 1),
  ('COM_MATERIEL',  'Matériel',  'Communication / Matériel',  2)
) AS v(code, libelle, libelle_complet, ordre);

-- Actions Equipement
WITH c AS (SELECT id FROM budget_commissions WHERE code = 'EQUIPEMENT')
INSERT INTO budget_actions (commission_id, code, libelle, libelle_complet, ordre)
SELECT c.id, code, libelle, libelle_complet, ordre FROM c,
(VALUES
  ('EQU_ARBITRES', 'Arbitres',  'Equipement / Arbitres',  1),
  ('EQU_KITS',     'Kits',      'Equipement / Kits',      2),
  ('EQU_MAILLOTS', 'Maillots',  'Equipement / Maillots',  3),
  ('EQU_MATERIEL', 'Matériel',  'Equipement / Matériel',  4)
) AS v(code, libelle, libelle_complet, ordre);

-- Actions Partenaires
WITH c AS (SELECT id FROM budget_commissions WHERE code = 'PARTENAIRES')
INSERT INTO budget_actions (commission_id, code, libelle, libelle_complet, ordre)
SELECT c.id, code, libelle, libelle_complet, ordre FROM c,
(VALUES
  ('PAR_MAILLOTS',    'Maillots',    'Partenaires / Maillots',    1),
  ('PAR_PANNEAUX',    'Panneaux',    'Partenaires / Panneaux',    2),
  ('PAR_SUBVENTIONS', 'Subventions', 'Partenaires / Subventions', 3)
) AS v(code, libelle, libelle_complet, ordre);

-- Actions Sportive
WITH c AS (SELECT id FROM budget_commissions WHERE code = 'SPORTIVE')
INSERT INTO budget_actions (commission_id, code, libelle, libelle_complet, ordre)
SELECT c.id, code, libelle, libelle_complet, ordre FROM c,
(VALUES
  ('SPO_COMPETITIONS',     'Competitions',      'Sportive / Competitions',      1),
  ('SPO_INTERVENTIONS',    'Interventions',     'Sportive / Interventions',     2),
  ('SPO_LICENCES',         'Licences',          'Sportive / Licences',          3),
  ('SPO_RECOMPENSE',       'Récompense',        'Sportive / Récompense',        4),
  ('SPO_STAGE_AOUT',       'Stage Aout',        'Sportive / Stage Aout',        5),
  ('SPO_STAGE_TOUSSAINT',  'Stage Toussaint',   'Sportive / Stage Toussaint',   6),
  ('SPO_STAGE_NOEL',       'Stage Noel',        'Sportive / Stage Noel',        7),
  ('SPO_STAGE_FEVRIER',    'Stage Février',     'Sportive / Stage Février',     8),
  ('SPO_STAGE_PAQUES',     'Stage Pâques',      'Sportive / Stage Pâques',      9),
  ('SPO_TEAM_CHAMBE',      'Team Chambé',       'Sportive / Team Chambé',       10),
  ('SPO_COHESION_18G',     'Cohésion 18G',      'Sportive / Cohésion 18G',      11),
  ('SPO_COHESION_HANDFIT', 'Cohésion Handfit',  'Sportive / Cohésion Handfit',  12),
  ('SPO_COHESION_SF',      'Cohésion SF',       'Sportive / Cohésion SF',       13),
  ('SPO_COHESION_SG',      'Cohésion SG',       'Sportive / Cohésion SG',       14),
  ('SPO_BOUTIQUE',         'Boutique',          'Sportive / Boutique',          15)
) AS v(code, libelle, libelle_complet, ordre);

-- Actions Supporters
WITH c AS (SELECT id FROM budget_commissions WHERE code = 'SUPPORTERS')
INSERT INTO budget_actions (commission_id, code, libelle, libelle_complet, ordre)
SELECT c.id, code, libelle, libelle_complet, ordre FROM c,
(VALUES
  ('SUP_GENERAL', 'Supporters', 'Supporters', 1)
) AS v(code, libelle, libelle_complet, ordre);

-- Exercice 2025-26
INSERT INTO budget_exercices (code, libelle, date_debut, date_fin, est_actif) VALUES
  ('2025-26', 'Saison 2025-2026', '2025-06-01', '2026-05-31', true);

-- Version initiale
INSERT INTO budget_versions (exercice_id, libelle, description, ordre, est_reference, couleur)
SELECT id, 'Budget Initial', 'Budget voté en début de saison', 1, true, '#0f1f3d'
FROM budget_exercices WHERE code = '2025-26';
