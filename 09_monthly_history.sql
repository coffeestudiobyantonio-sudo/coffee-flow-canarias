-- Tabla para almacenar el histórico de planificaciones mensuales validadas
CREATE TABLE IF NOT EXISTS planner_monthly_history (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    validated_at TIMESTAMPTZ DEFAULT NOW(),
    total_days INTEGER NOT NULL,
    total_kg NUMERIC NOT NULL,
    total_green_kg NUMERIC NOT NULL,
    total_sacks INTEGER NOT NULL,
    days JSONB NOT NULL,
    demands JSONB,
    surplus JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deshabilitar RLS para acceso ágil en desarrollo
ALTER TABLE planner_monthly_history DISABLE ROW LEVEL SECURITY;
