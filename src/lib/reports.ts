import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DailyRoastOrder, MasterProfile } from '../App';
import type { DailyPlan } from '../components/DailyRoastOrders';

/**
 * Utility to get format weight in KG
 */
const getFormatWeight = (format: string): number => {
   const f = format.toLowerCase();
   if (f.includes('250g')) return 0.25;
   if (f.includes('450g')) return 0.45;
   if (f.includes('500g')) return 0.5;
   if (f.includes('1000g') || f.includes('1kg')) return 1;
   if (f.includes('2kg')) return 2;
   return 1; // Default
};

/**
 * Genera un informe profesional en PDF con el desglose detallado de la producción diaria.
 */
export const generateDailyProductionReport = (orders: DailyRoastOrder[]) => {
   const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
   });
   
   const today = new Date().toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
   });

   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 297, 40, 'F');
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(24);
   doc.setFont('helvetica', 'bold');
   doc.text('COFFEE FLOW - ARBITRADE CANARIAS', 15, 20);
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(12);
   doc.text(`INFORME DIARIO DE PRODUCCIÓN Y TRAZABILIDAD - ${today}`, 15, 30);

   const roastTasks = orders.flatMap(o => o.tasks.filter(t => t.type === 'ROAST' && (t.status === 'ROASTED' || t.status === 'RESTING' || t.status === 'COMPLETED')));
   const totalRoastedKg = roastTasks.reduce((acc, t) => acc + (t.actualWeightKg || 0), 0);
   const totalGreenKg = roastTasks.reduce((acc, t) => acc + (t.targetWeightKg || 0), 0);
   const avgShrinkage = totalGreenKg > 0 ? ((totalGreenKg - totalRoastedKg) / totalGreenKg * 100).toFixed(2) : '0.00';
   
   const originsKg: { [origin: string]: number } = {};
   roastTasks.forEach(t => {
      const origin = t.origins[0] || 'Origen Desconocido';
      originsKg[origin] = (originsKg[origin] || 0) + (t.targetWeightKg || 0);
   });
   
   doc.setTextColor(40, 40, 40);
   doc.text('RESUMEN DE JORNADA:', 15, 52);
   
   autoTable(doc, {
      startY: 55,
      margin: { left: 15 },
      tableWidth: 100,
      body: [
         ['Total Café Verde Procesado', `${totalGreenKg.toFixed(1)} kg`],
         ...Object.entries(originsKg).map(([origin, kg]) => [`  - ${origin}`, `${kg.toFixed(1)} kg`]),
         ['Total Café Tostado Producido', `${totalRoastedKg.toFixed(1)} kg`],
         ['Merma Promedio del Día', `${avgShrinkage} %`]
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1 }
   });

   const allTasks = orders.flatMap(o => o.tasks.filter(t => t.status === 'ROASTED' || t.status === 'RESTING' || t.status === 'COMPLETED'));
   let batchCounter = 0;
   const tableRows = allTasks.flatMap(t => {
      if (t.type === 'BLEND') return [];
      batchCounter++;
      const rd = t.roastData || {} as any;
      return [[
         batchCounter.toString(),
         `${t.origins[0] || 'Origen'}\n(${t.masterProfile?.name || 'Gama'})`,
         `${t.targetWeightKg.toFixed(1)} / ${t.actualWeightKg?.toFixed(1) || '--'}`,
         t.actualWeightKg ? (((t.targetWeightKg - t.actualWeightKg) / t.targetWeightKg) * 100).toFixed(1) + '%' : '--',
         rd.turnaroundTemp ? `${rd.turnaroundTemp}°C\n(${rd.turnaroundTime || '0:00'})` : '--',
         rd.yellowTemp ? `${rd.yellowTemp}°C\n(${rd.yellowTime || '0:00'})` : '--',
         rd.maillardTemp ? `${rd.maillardTemp}°C\n(${rd.maillardTime || '0:00'})` : '--',
         rd.firstCrackTemp ? `${rd.firstCrackTemp}°C\n(${rd.firstCrackTime || '0:00'})` : '--',
         rd.finalTemp ? `${rd.finalTemp}°C\n(${rd.finalTime || '0:00'})` : '--',
         t.assignedSilos ? `Silo ${t.assignedSilos[0]}` : '--'
      ]];
   });

   autoTable(doc, {
      startY: 85,
      head: [['#', 'Origen / Perfil', 'Verde/Tost', 'Merma', 'TP', 'Amar.', 'Mail.', '1C', 'Drop', 'Silo']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], fontSize: 8 },
      styles: { fontSize: 8, halign: 'center' }
   });

   doc.save(`INFORME_PRODUCCION_${today.replace(/[\/:]/g, '_')}.pdf`);
};

/**
 * Genera una Orden de Envasado Detallada.
 */
export const generatePackagingOrderReport = (orders: DailyRoastOrder[], demands: any[] = []) => {
   const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
   });

   const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 297, 30, 'F');
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(20);
   doc.text('ARBITRADE - ORDEN DE ENVASADO Y LOGÍSTICA', 15, 15);
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(10);
   doc.text(`PLAN DE ENVASADO - JORNADA ${today} | 1 Caja = 12kg | 1 Pallet = 40 Cajas`, 15, 22);

   const packagingTasks = orders.flatMap(o => o.tasks.filter(t => t.type === 'BLEND'));

   const tableRows = packagingTasks.map((t, idx) => {
      const profile = t.masterProfile;
      const format = (profile as any)?.format || '1000g';
      const weight = getFormatWeight(format);
      
      const totalKg = t.targetWeightKg;
      const packages = Math.round(totalKg / weight);
      const boxes = totalKg / 12;
      const pallets = boxes / 40;

      // Find delegation from demands
      let delegation = 'STOCK / PROPIA';
      if (t.fulfilledDemandIds && t.fulfilledDemandIds.length > 0) {
         const demand = demands.find(d => d.id === t.fulfilledDemandIds![0]);
         if (demand) delegation = demand.delegation;
      }

      // Dynamically calculate which silos actually contain this gama's origins
      const parentOrder = orders.find(o => o.id === t.parentOrderId);
      const profileSilos = parentOrder ? Array.from(new Set(
         parentOrder.tasks
            .filter(rt => rt.type === 'ROAST' && rt.masterProfile?.name === t.masterProfile?.name)
            .flatMap(rt => rt.assignedSilos || [])
      )).sort((a,b) => a-b) : (t.assignedSilos || []);

      return [
         (idx + 1).toString(),
         delegation,
         profile?.name || 'GAMA',
         format,
         `${totalKg.toFixed(1)} kg`,
         packages.toLocaleString(),
         boxes.toFixed(1),
         pallets.toFixed(2),
         profileSilos.length > 0 ? profileSilos.join(', ') : '--'
      ];
   });

   autoTable(doc, {
      startY: 40,
      head: [['#', 'Delegación', 'Gama', 'Formato', 'Total Kg', 'Paquetes', 'Cajas (12kg)', 'Pallets (40c)', 'Silos']],
      body: tableRows,
      headStyles: { fillColor: [30, 34, 43], fontSize: 9 },
      styles: { fontSize: 9, halign: 'center' },
      columnStyles: { 1: { halign: 'left', fontStyle: 'bold' }, 2: { halign: 'left' } }
   });

   doc.save(`ORDEN_ENVASADO_${today.replace(/\//g, '_')}.pdf`);
};

/**
 * Genera el Informe de Paletizado por Delegación.
 */
export const generatePalletShippingReport = (orders: DailyRoastOrder[], demands: any[] = []) => {
   const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
   });

   const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 210, 30, 'F');
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(18);
   doc.text('ARBITRADE - HOJA DE PALETIZADO Y ENVÍO', 15, 15);
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(10);
   doc.text(`DESGLOSE POR PALLETS Y DELEGACIÓN - ${today}`, 15, 22);

   const packagingTasks = orders.flatMap(o => o.tasks.filter(t => t.type === 'BLEND'));
   
   // Group tasks by Delegation
   const tasksByDelegation: { [key: string]: any[] } = {};
   packagingTasks.forEach(t => {
      let delegation = 'STOCK / PROPIA';
      if (t.fulfilledDemandIds && t.fulfilledDemandIds.length > 0) {
         const demand = demands.find(d => d.id === t.fulfilledDemandIds![0]);
         if (demand) delegation = demand.delegation;
      }
      if (!tasksByDelegation[delegation]) tasksByDelegation[delegation] = [];
      tasksByDelegation[delegation].push(t);
   });

   let currentY = 40;

   Object.entries(tasksByDelegation).forEach(([delegation, tasks]) => {
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`DELEGACIÓN: ${delegation}`, 15, currentY);
      currentY += 5;

      // Group into pallets (480kg per pallet = 40 boxes of 12kg)
      const PALLET_CAPACITY_KG = 480;
      let pallets: { kg: number, items: { name: string, kg: number }[] }[] = [{ kg: 0, items: [] }];

      tasks.forEach(t => {
         let remainingKg = t.targetWeightKg;
         while (remainingKg > 0) {
            let currentPallet = pallets[pallets.length - 1];
            const spaceInPallet = PALLET_CAPACITY_KG - currentPallet.kg;
            
            if (spaceInPallet <= 0) {
               pallets.push({ kg: 0, items: [] });
               currentPallet = pallets[pallets.length - 1];
            }

            const kgToAdd = Math.min(remainingKg, PALLET_CAPACITY_KG - currentPallet.kg);
            currentPallet.kg += kgToAdd;
            currentPallet.items.push({ name: t.masterProfile?.name || 'GAMA', kg: kgToAdd });
            remainingKg -= kgToAdd;
         }
      });

      const palletRows = pallets.map((p, idx) => [
         `PALLET #${idx + 1}`,
         p.items.map(i => `${i.name}: ${Math.ceil(i.kg / 12)} cj (${i.kg.toFixed(1)}kg)`).join('\n'),
         `${p.kg.toFixed(1)} kg`,
         Math.ceil(p.kg / 12).toString() + ' Cajas'
      ]);

      autoTable(doc, {
         startY: currentY,
         head: [['# Pallet', 'Gamas Incluidas', 'Peso Total', 'Cajas Estimadas']],
         body: palletRows,
         theme: 'grid',
         headStyles: { fillColor: [100, 100, 100] },
         styles: { fontSize: 9 },
         margin: { left: 15 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;
      if (currentY > 250) {
         doc.addPage();
         currentY = 20;
      }
   });

   doc.save(`HOJA_PALETIZADO_${today.replace(/\//g, '_')}.pdf`);
};

/**
 * Genera un informe en PDF de toda la planificación de tueste generada.
 */
export const generateRoastingPlanReport = (days: DailyPlan[], masterProfiles: MasterProfile[]) => {
   const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
   });
   
   const today = new Date().toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric'
   });

   days.forEach((day, index) => {
      if (index > 0) {
         doc.addPage();
      }

      // Header Banner
      doc.setFillColor(30, 34, 43);
      doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(217, 119, 6);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('COFFEE FLOW - PLAN DE TUESTE', 15, 12);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text(`PLANIFICACIÓN MENSUAL GENERADA - EXPORTADO EL ${today}`, 15, 20);

      let yOffset = 40;

      doc.setTextColor(40, 40, 40);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const dateStr = day.scheduledDate ? ` - Fecha: ${day.scheduledDate}` : '';
      doc.text(`DÍA PLANIFICADO #${day.dayIndex}${dateStr}`, 15, yOffset);
      yOffset += 5;

      // Calculate green coffee usage
      let dayTotalGreen = 0;
      const greenByOrigin: { [origin: string]: number } = {};

      day.siloAssignments.forEach(silo => {
         silo.batches.forEach(batch => {
            const profile = masterProfiles.find(p => p.name === batch.profileName);
            if (!profile) return;
            const blendComponent = profile.blend.find(b => b.origin === silo.origin);
            const sackWeight = Number(blendComponent?.sackWeight || (blendComponent as any)?.sack_weight || 60);
            const batchGreen = sackWeight * 2;
            dayTotalGreen += batchGreen;
            greenByOrigin[silo.origin] = (greenByOrigin[silo.origin] || 0) + batchGreen;
         });
      });

      // Daily details table
      const summaryRows = [
         ['Total Café Tostado Estimado', `${day.totalKg.toFixed(1)} kg`],
         ['Total Café Verde Necesario', `${dayTotalGreen.toFixed(1)} kg`],
         ...Object.entries(greenByOrigin).map(([origin, kg]) => [`  - Verde (${origin})`, `${kg.toFixed(1)} kg (aprox. ${(kg/60).toFixed(1)} sacos)`]),
         ['Silos de Destino Asignados', `Silos ${day.targetSilos.join(', ')}`]
      ];

      autoTable(doc, {
         startY: yOffset,
         margin: { left: 15, right: 15 },
         body: summaryRows,
         theme: 'plain',
         styles: { fontSize: 9, cellPadding: 1 },
         columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } }
      });

      yOffset = (doc as any).lastAutoTable.finalY + 6;

      // Table of Profiles/Formats scheduled
      const blockRows = day.blocks.map(b => [
         b.profileName,
         b.format,
         `${b.targetKg.toFixed(1)} kg`
      ]);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Gamas y Formatos Planificados:', 15, yOffset);
      yOffset += 3;

      autoTable(doc, {
         startY: yOffset,
         margin: { left: 15, right: 15 },
         head: [['Perfil / Gama', 'Formato', 'Peso Tostado Objetivo']],
         body: blockRows,
         theme: 'grid',
         headStyles: { fillColor: [40, 40, 40], fontSize: 8 },
         styles: { fontSize: 8 }
      });

      yOffset = (doc as any).lastAutoTable.finalY + 6;

      // Table of Roasting Batches/Silo allocations
      const batchRows: string[][] = [];
      day.siloAssignments.forEach(silo => {
         silo.batches.forEach((batch) => {
            const profile = masterProfiles.find(p => p.name === batch.profileName);
            const blendComponent = profile?.blend.find(b => b.origin === silo.origin);
            const sackWeight = Number(blendComponent?.sackWeight || (blendComponent as any)?.sack_weight || 60);
            const greenKg = sackWeight * 2;
            batchRows.push([
               `Silo ${silo.siloId}`,
               silo.origin,
               batch.profileName,
               batch.format,
               `${greenKg} kg`
            ]);
         });
      });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Distribución de Tandas y Carga de Silos:', 15, yOffset);
      yOffset += 3;

      autoTable(doc, {
         startY: yOffset,
         margin: { left: 15, right: 15 },
         head: [['Silo', 'Origen del Café', 'Gama / Perfil', 'Formato', 'Café Verde Necesario']],
         body: batchRows,
         theme: 'striped',
         headStyles: { fillColor: [80, 80, 80], fontSize: 8 },
         styles: { fontSize: 8 }
      });
   });

   doc.save(`PLAN_DE_TUESTE_${today.replace(/\//g, '_')}.pdf`);
};
