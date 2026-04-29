-- Tabla para las demandas de delegaciones
CREATE TABLE planner_demands (
    id TEXT PRIMARY KEY,
    delegation TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    format TEXT NOT NULL,
    kg_requested NUMERIC NOT NULL,
    total_packages NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla para los días programados generados
CREATE TABLE planner_days (
    day_index INTEGER PRIMARY KEY,
    target_silos JSONB NOT NULL,
    silo_assignments JSONB NOT NULL,
    total_kg NUMERIC NOT NULL,
    blocks JSONB NOT NULL,
    scheduled_date TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (opcional si se usa autenticación pública)
ALTER TABLE planner_demands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Demands" ON planner_demands FOR ALL USING (true);

ALTER TABLE planner_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Days" ON planner_days FOR ALL USING (true);
