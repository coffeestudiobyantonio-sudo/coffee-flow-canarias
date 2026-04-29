-- Actualización del esquema para seguimiento de demandas
ALTER TABLE planner_demands ADD COLUMN status TEXT DEFAULT 'PENDING';

-- Actualización de los días planificados para saber qué demandas cubren
ALTER TABLE planner_days ADD COLUMN fulfilled_demand_ids JSONB DEFAULT '[]';

-- Actualización de las tareas de producción para arrastrar los IDs de demanda
ALTER TABLE roast_tasks ADD COLUMN fulfilled_demand_ids JSONB DEFAULT '[]';

