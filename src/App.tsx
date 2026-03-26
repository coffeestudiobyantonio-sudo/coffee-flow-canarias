import React, { useState, useEffect } from 'react';
import LiveRoastControl from './components/LiveRoastControl';
import Inventory from './components/Inventory';
import QualityLab from './components/QualityLab';
import ManagementDashboard from './components/ManagementDashboard';
import MasterProfiles from './components/MasterProfiles';
import TraceabilityDetective from './components/TraceabilityDetective';
import DailyRoastOrders from './components/DailyRoastOrders';
import ManualRoastControl from './components/ManualRoastControl';
import SiloManager from './components/SiloManager';
import { Database, Activity, LayoutDashboard, Target, Truck, TestTube2, Flame, CheckCircle, Lock, FileSearch, ClipboardList, Timer } from 'lucide-react';
import { fetchSilos, fetchInventoryLots, fetchMasterProfiles, fetchDailyOrders, updateTaskStatus } from './lib/api';

export interface MachineSpecificProfile {
  targetAgtron: number;
  ghostCurve: { time: number, temp: number }[];
}

export interface MasterProfile {
  name: string;
  agtron: number;
  roastedType: string;
  businessUnit: 'LIDL' | 'PROPIA';
  roastStrategy: 'PRE_BLEND' | 'POST_BLEND';
  blend: { origin: string, percentage: number }[];
  sensory: {
    fragrancia: number;
    aroma: number;
    sabor: number;
    cuerpo: number;
  };
  machineProfiles?: { [machineId: string]: MachineSpecificProfile };
}

export interface RoastingMachine {
  id: string;
  name: string;
  maxCapacity: number;
  bbpCooldownBase: number;
  bbpCoefficient: number;
  energyType: 'GAS' | 'ELECTRIC';
}

export interface InventoryLot {
  id: string; // CAN-LIDL-001
  shippingMark?: string; // Origin Lot ID or Bill of Lading
  arrivalNotes?: string; // Pre-shipment cupping or lab notes
  origin: string;
  moisture: number;
  density: number;
  arrivalDate: string; // YYYY-MM-DD
  status: 'VALIDATED' | 'REJECTED' | 'INACTIVE';
  deletedAt?: number;
  stock_kg: number;
  originalStock_kg?: number; // Pre-shrinkage tracking
  price_per_kg: number;
  exclusiveFor: 'LIDL' | 'NONE';
}

export type LotStatus = 'definicion' | 'tueste' | 'laboratorio' | 'validado';

export type OrderCategory = 'MDD' | 'MARCA_PROPIA';

export type Silo = {
  id: number;
  lotId: string | null;
  origin: string | null;
  moisture: number | null;
  currentKg: number;
  maxKg: number;
  lastFillDate?: string | null;
};

export interface ActiveLot {
  id: string;
  profile: MasterProfile;
  status: LotStatus;
  machineId?: string;
  batchWeight?: number; 
  roastData?: { finalTemp: number, finalRor: number, devTime: number };
  batchIndex?: number;    
  totalBatches?: number;  
  orderTotalKg?: number;
  parentOrderId?: string;
  consumedLots?: { lotId: string, weightKg: number, origin: string }[];
  category?: OrderCategory; // Phase 12
}

export interface ConsumedLot {
  lotId: string;
  weightKg: number;
  costPerKg: number;
}

export interface RoastTask {
  id: string; // TSK-XXXX
  parentOrderId: string;
  type: 'ROAST' | 'BLEND';
  masterProfile: MasterProfile;
  machineId?: string; // Assigned at fragmentation
  origins: string[]; // Supports multiple origins for PRE_BLEND or single for POST_BLEND
  targetWeightKg: number;
  actualWeightKg?: number;
  status: 'PENDING' | 'ROASTED' | 'RESTING' | 'LAB_REJECTED';
  consumedLots?: ConsumedLot[]; // Multi-Lot tracking for FIFO Engine
  assignedSilos?: number[]; // Phase 11: Linked source silos
  batchIndex?: number;
  totalBatches?: number;
  parentOrderTotalKg?: number;
  category?: OrderCategory; // Phase 12
}

export interface DailyRoastOrder {
  id: string; // ORD-XXXX
  profileName: string;
  totalKg: number;
  priority: 'URGENTE' | 'STOCK' | 'MUESTRA';
  shrinkagePct: number;
  tasks: RoastTask[];
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  estimatedPmpCost?: number; // PMP Average Price calculated at formulation
  category: OrderCategory; // Phase 12
}

export const ROASTING_MACHINES: RoastingMachine[] = [
  { id: 'TOST-A', name: 'Tostadora A', maxCapacity: 120, bbpCooldownBase: 180, bbpCoefficient: 0.5, energyType: 'ELECTRIC' },
  { id: 'TOST-B', name: 'Tostadora B', maxCapacity: 240, bbpCooldownBase: 360, bbpCoefficient: 0.8, energyType: 'GAS' }
];

function App() {
  const [activeTab, setActiveTab] = useState<'orders' | 'profiles' | 'mgmt' | 'roast' | 'manual_roast' | 'inventory' | 'lab' | 'traceability' | 'silos'>('orders');
  const [activeLot, setActiveLot] = useState<ActiveLot | null>(null);

  const [masterProfiles, setMasterProfiles] = useState<MasterProfile[]>([]);
  const [roastOrders, setRoastOrders] = useState<DailyRoastOrder[]>([]);
  const [inventoryLots, setInventoryLots] = useState<InventoryLot[]>([]);
  const [silos, setSilos] = useState<Silo[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  // Phase 18: Hydrate Initial State from Supabase
  useEffect(() => {
    const loadData = async () => {
      console.log("Fetching DB State from Supabase...");
      const [dbSilos, dbLots, dbProfiles, dbOrders] = await Promise.all([
        fetchSilos(),
        fetchInventoryLots(),
        fetchMasterProfiles(),
        fetchDailyOrders()
      ]);
      
      setSilos(dbSilos);
      setInventoryLots(dbLots);
      setMasterProfiles(dbProfiles);
      setRoastOrders(dbOrders);
      setIsDbLoaded(true);
    };
    loadData();
  }, []);

  if (!isDbLoaded) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center text-white">
        <div className="flex flex-col items-center animate-pulse">
           <Database className="w-12 h-12 text-blue-500 mb-4 animate-bounce" />
           <p className="font-bold tracking-widest uppercase text-sm text-gray-400">Sincronizando con Supabase...</p>
        </div>
      </div>
    );
  }

  const handleLaunchProduction = (profile: MasterProfile) => {
    // Redirigir directamente al Hub de Planificación
    setActiveTab('orders');
    
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-blue-500/90 text-white px-6 py-4 rounded-xl font-bold shadow-[0_0_30px_rgba(59,130,246,0.3)] z-50 animate-bounce flex flex-col space-y-1';
    toast.innerHTML = `
      <span>🚀 Redirigido a Hub de Planificación</span>
      <span class="text-xs bg-black/20 p-2 rounded block mt-1">El perfil ${profile.name} puede ser planificado ahora.</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), 3000);
  };

  const handleLaunchManualRoast = (task: RoastTask) => {
    setActiveLot({
      id: task.id,
      profile: task.masterProfile,
      status: 'tueste',
      machineId: task.machineId,
      batchWeight: task.targetWeightKg,
      batchIndex: task.batchIndex,
      totalBatches: task.totalBatches,
      orderTotalKg: task.parentOrderTotalKg,
      parentOrderId: task.parentOrderId,
      category: task.category
    });
    setActiveTab('manual_roast');
  };

  const handleBatchComplete = async (actualWeight: number) => {
    if (activeLot && activeLot.parentOrderId) {
      const roastedTimestamp = Date.now();
      
      // Phase 19: Push DROP event to Supabase Cloud
      const isSuccess = await updateTaskStatus(activeLot.id, 'ROASTED', { 
        actualWeightKg: actualWeight, 
        roastedAt: roastedTimestamp 
      });

      if (!isSuccess) {
        alert("Error de red: No se pudo registrar el tueste en Supabase.");
        return;
      }

      setRoastOrders(prev => prev.map(order => {
        if (order.id === activeLot.parentOrderId) {
          const updatedTasks = order.tasks.map(t => 
            t.id === activeLot.id ? { ...t, status: 'ROASTED' as const, actualWeightKg: actualWeight, roastedAt: roastedTimestamp } : t
          );
          return { ...order, tasks: updatedTasks };
        }
        return order;
      }));
      setActiveLot(null);
      setActiveTab('orders');
    }
  };

  const handleQualityValidated = () => {
    if (activeLot) {
      setActiveLot({ ...activeLot, status: 'validado' });
    }
  };

  // Stepper UI Component
  const StepperBar = () => {
    const steps = [
      { id: 'definicion', label: '1. Definición', icon: <Target className="w-4 h-4" /> },
      { id: 'tueste', label: '2. Tueste', icon: <Flame className="w-4 h-4" /> },
      { id: 'laboratorio', label: '3. Laboratorio', icon: <TestTube2 className="w-4 h-4" /> },
      { id: 'validado', label: '4. Validado', icon: <CheckCircle className="w-4 h-4" /> }
    ];

    const getStatusIndex = (status: LotStatus) => steps.findIndex(s => s.id === status);
    const currentIndex = activeLot ? getStatusIndex(activeLot.status) : 0;

    return (
      <div className="w-full bg-[#14161a] border-b border-dashboard-border px-8 py-3 flex items-center justify-between shadow-md z-40 relative">
        <div className="flex items-center space-x-6">
          <span className="text-gray-500 font-black text-xs uppercase tracking-widest flex items-center">
            {activeLot ? <><Database className="w-4 h-4 mr-2 text-coffee-light" /> Lote Activo: <span className="text-white ml-2 bg-[#1e222b] px-2 py-0.5 rounded">{activeLot.id}</span></> : 'Sin Lote Producción'}
          </span>
        </div>
        <div className="flex items-center space-x-3">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentIndex;
            const isActive = idx === currentIndex && activeLot !== null;

            return (
              <React.Fragment key={step.id}>
                <div className={`flex items-center px-4 py-1.5 rounded-full text-xs font-bold transition-all
                  ${isActive ? 'bg-coffee-accent text-white shadow-[0_0_15px_rgba(217,119,6,0.3)]' : 
                    isCompleted ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
                    'bg-[#1e222b] text-gray-600 border border-dashboard-border'}`}>
                  <span className="mr-2">{step.icon}</span>
                  {step.label}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-8 h-[2px] rounded ${isCompleted ? 'bg-green-500/50' : 'bg-dashboard-border'}`}></div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  // Route Guards for Sidebar navigation
  const handleNavClick = (targetTab: string) => {
    // Prevent skipping steps if a lot is active
    if (activeLot && activeLot.status !== 'validado') {
      if (activeLot.status === 'tueste' && targetTab === 'lab') {
         alert("🔒 Acceso Denegado: Debes finalizar el ciclo de tueste antes de enviar el lote al Quality Lab.");
         return;
      }
    }
    setActiveTab(targetTab as any);
  };

  return (
    <div className="flex h-screen bg-dashboard-bg overflow-hidden relative">
      
      {/* Sidebar - Industrial Minimalist Design */}
      <aside className="w-20 lg:w-64 bg-[#14161a] border-r border-dashboard-border flex flex-col items-center lg:items-start pt-6 shadow-[10px_0_30px_rgba(0,0,0,0.5)] z-20">
        
        {/* Logo Area */}
        <div className="w-full px-0 lg:px-6 mb-8 flex justify-center lg:justify-start items-center">
          <div className="bg-coffee-accent p-2 lg:p-3 rounded-xl shadow-lg ring-1 ring-white/10">
            <Database className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
          </div>
          <span className="hidden lg:block ml-3 font-black text-white tracking-tighter text-lg uppercase leading-none">
            ARBITRADE <span className="text-coffee-light block text-[10px] tracking-[0.3em]">CANARIAS</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 w-full space-y-1 mt-4 px-3 flex flex-col items-center lg:items-start overflow-y-auto custom-scrollbar pb-6">
          
          {/* MÓDULO 1: RECEPCIÓN Y DISEÑO */}
          <div className="hidden lg:block w-full px-4 mb-2 mt-2">
            <span className="text-[10px] font-black justify-start text-coffee-accent uppercase tracking-widest">Módulo 1: Recepción y Diseño</span>
          </div>
          <NavItem icon={<Truck />} label="1. Inventario & Origen" active={activeTab === 'inventory'} onClick={() => handleNavClick('inventory')} />
          <NavItem icon={<Target />} label="2. Gamas & Perfiles" active={activeTab === 'profiles'} onClick={() => handleNavClick('profiles')} />
          
          {/* MÓDULO 2: PLANTA Y PRODUCCIÓN */}
          <div className="hidden lg:block w-full px-4 mb-2 mt-6">
            <span className="text-[10px] font-black justify-start text-coffee-accent uppercase tracking-widest">Módulo 2: Planta y Producción</span>
          </div>
          <NavItem icon={<Database />} label="3. Gestión de Silos" active={activeTab === 'silos'} onClick={() => handleNavClick('silos')} />
          <NavItem icon={<ClipboardList />} label="4. Hub Planificación" active={activeTab === 'orders'} onClick={() => handleNavClick('orders')} highlight={true} />
          <NavItem icon={<Timer />} label="5. Control de Tueste" active={activeTab === 'manual_roast'} onClick={() => handleNavClick('manual_roast')} pulse={activeLot?.status === 'tueste'} />

          {/* MÓDULO 3: CALIDAD Y DIRECCIÓN */}
          <div className="hidden lg:block w-full px-4 mb-2 mt-6">
            <span className="text-[10px] font-black justify-start text-coffee-accent uppercase tracking-widest">Módulo 3: Calidad y Dirección</span>
          </div>
          <NavItem icon={<TestTube2 />} label="6. Lab de Calidad" active={activeTab === 'lab'} onClick={() => handleNavClick('lab')} locked={activeLot?.status === 'tueste'} pulse={activeLot?.status === 'laboratorio'} />
          <NavItem icon={<FileSearch />} label="7. Trazabilidad Forense" active={activeTab === 'traceability'} onClick={() => handleNavClick('traceability')} highlight={true} />
          <NavItem icon={<LayoutDashboard />} label="8. Panel Ejecutivo" active={activeTab === 'mgmt'} onClick={() => handleNavClick('mgmt')} />
          
          {/* Legacy/Automated Control (Hidden) */}
          <div className="mt-8 pt-4 w-full border-t border-dashboard-border opacity-30 hover:opacity-100 transition-opacity">
            <NavItem icon={<Activity />} label="IoT Auto-Control" active={activeTab === 'roast'} onClick={() => handleNavClick('roast')} />
          </div>
        </nav>

        {/* Bottom Current Target */}
        <div className="mt-auto mb-6 w-full px-0 lg:px-6 flex justify-center lg:justify-start items-center">
          <div className="hidden lg:flex w-full bg-[#1e222b] border border-dashboard-border p-4 rounded-xl flex-col shadow-inner relative overflow-hidden">
            {activeLot && activeLot.status === 'validado' && <div className="absolute inset-0 bg-green-500/10 pointer-events-none"></div>}
            <span className="text-[10px] text-gray-500 font-black mb-1 uppercase tracking-widest leading-tight z-10">Lote Activo</span>
            <div className="flex flex-col mt-1 z-10">
              <span className={`text-sm font-bold truncate ${activeLot ? 'text-coffee-light' : 'text-gray-600'}`}>
                {activeLot ? activeLot.profile.name : "Ninguno en producción"}
              </span>
              {activeLot && (
                <span className="text-xs text-gray-400 mt-1 font-mono">ID: {activeLot.id}</span>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Dashboard */}
      <main className="flex-1 min-w-0 h-full flex flex-col relative z-10 overflow-hidden bg-dashboard-bg">
        <StepperBar />
        
        <div className="flex-1 overflow-y-auto w-full relative">
          {activeTab === 'profiles' && <MasterProfiles onLaunchProduction={handleLaunchProduction} inventoryLots={inventoryLots} masterProfiles={masterProfiles} setMasterProfiles={setMasterProfiles} />}
          {activeTab === 'orders' && <DailyRoastOrders 
              masterProfiles={masterProfiles} 
              inventoryLots={inventoryLots} setInventoryLots={setInventoryLots}
              roastOrders={roastOrders} setRoastOrders={setRoastOrders}
              silos={silos}
              onLaunchManualRoast={handleLaunchManualRoast}
            />}
          {activeTab === 'silos' && <SiloManager silos={silos} setSilos={setSilos} inventoryLots={inventoryLots} setInventoryLots={setInventoryLots} roastOrders={roastOrders} />}
          {activeTab === 'mgmt' && <ManagementDashboard />}
          {activeTab === 'roast' && <LiveRoastControl activeLot={activeLot} onRoastComplete={(data) => handleBatchComplete(activeLot?.batchWeight || 0)} />}
          {activeTab === 'manual_roast' && <ManualRoastControl activeLot={activeLot} onBatchComplete={handleBatchComplete} allOrders={roastOrders} setAllOrders={setRoastOrders} silos={silos} setSilos={setSilos} />}
          {activeTab === 'inventory' && <Inventory inventoryLots={inventoryLots} setInventoryLots={setInventoryLots} silos={silos} />}
          {activeTab === 'lab' && <QualityLab activeLot={activeLot} onQualityValidated={handleQualityValidated} />}
          {activeTab === 'traceability' && <TraceabilityDetective activeLot={activeLot} />}
        </div>
      </main>

    </div>
  );
}

const NavItem = ({ icon, label, active = false, onClick, highlight = false, pulse = false, locked = false }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, highlight?: boolean, pulse?: boolean, locked?: boolean }) => {
  return (
    <div onClick={onClick} className={`w-full flex items-center justify-center lg:justify-start px-0 lg:px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 group relative
      ${highlight && !active && !locked ? 'border border-coffee-accent/30 text-coffee-light hover:bg-coffee-accent/10' : ''}
      ${active ? 'bg-coffee-accent/10 border border-coffee-accent/20 text-coffee-light shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' : 
        locked ? 'text-gray-600 cursor-not-allowed opacity-50' : 'text-gray-400 hover:bg-[#1e222b] hover:text-white'}`}>
      
      <div className={`relative flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6 ${active ? 'text-coffee-light' : locked ? 'text-gray-600' : 'text-gray-400 group-hover:text-white'}`}>
        {icon}
        {pulse && !active && <span className="absolute -top-1 -right-1 w-2 h-2 bg-coffee-accent rounded-full animate-ping"></span>}
        {locked && <Lock className="absolute -bottom-1 -right-2 w-3 h-3 text-red-500 bg-dashboard-bg rounded-full border border-red-500/30" />}
      </div>
      <span className={`hidden lg:block ml-3 text-sm ${active || highlight ? 'font-bold' : locked ? 'line-through' : 'font-medium'}`}>
        {label}
      </span>
      {/* Active Indicator bar */}
      {active && <div className="hidden lg:block absolute left-0 w-1 h-8 bg-coffee-accent rounded-r-md shadow-[0_0_10px_#d97706]" />}
    </div>
  )
}

export default App;
