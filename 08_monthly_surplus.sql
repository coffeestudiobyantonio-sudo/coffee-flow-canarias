-- Tabla para almacenar los sobrantes mensuales de café ya fabricado (cajas y paquetes sueltos)
CREATE TABLE IF NOT EXISTS planner_monthly_surplus (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL, -- Ej: '2026-09' o 'Septiembre 2026'
    profile_name TEXT NOT NULL,
    format TEXT NOT NULL,
    boxes NUMERIC DEFAULT 0,
    packages NUMERIC DEFAULT 0,
    total_kg NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deshabilitar RLS para acceso ágil en desarrollo
ALTER TABLE planner_monthly_surplus DISABLE ROW LEVEL SECURITY;
