import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DailyRoastOrder, MasterProfile } from '../App';
import type { DailyPlan } from '../components/DailyRoastOrders';
import { getOriginSackWeight } from './api';

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
   doc.text(`PLAN DE ENVASADO - JORNADA ${today} | 1 Caja = 10kg | 1 Pallet = 48 Cajas (480kg)`, 15, 22);

   const packagingTasks = orders.flatMap(o => o.tasks.filter(t => t.type === 'BLEND'));

   const tableRows = packagingTasks.map((t, idx) => {
      const profile = t.masterProfile;
      const format = (profile as any)?.format || '1000g';
      const weight = getFormatWeight(format);
      
      const totalKg = t.targetWeightKg;
      const packages = Math.round(totalKg / weight);
      const boxes = totalKg / 10;
      const pallets = boxes / 48;

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
      head: [['#', 'Delegación', 'Gama', 'Formato', 'Total Kg', 'Paquetes', 'Cajas (10kg)', 'Pallets (48c)', 'Silos']],
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

      // Group into pallets (480kg per pallet = 48 boxes of 10kg)
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
         p.items.map(i => `${i.name}: ${Math.ceil(i.kg / 10)} cj (${i.kg.toFixed(1)}kg)`).join('\n'),
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
 * ============================================================================
 * FORMATO 1 (NUEVO / OFICIAL): FICHAS TÉCNICAS OFICIALES ARBITRADE CANARIAS
 * ============================================================================
 * Genera la ficha oficial de 2 páginas en formato horizontal A4 de Arbitrade Canarias
 * para cada día de tueste, con la tabla térmica de planta (pág. 1) y el resumen de
 * envasado y control con títulos en negrita y campos en blanco para rellenado manual (pág. 2).
 */
export const renderArbitradeDaySheet = (
   doc: any,
   day: DailyPlan,
   masterProfiles: MasterProfile[]
) => {
   // Flatten all scheduled batches for the day
   const allBatches: { origin: string; greenKg: number; profileName: string; format: string; siloId: number }[] = [];
   day.siloAssignments.forEach(silo => {
      silo.batches.forEach(b => {
         const sw = getOriginSackWeight(silo.origin, b.profileName, masterProfiles);
         allBatches.push({
            origin: silo.origin.trim(),
            greenKg: sw * 2,
            profileName: b.profileName,
            format: b.format,
            siloId: silo.siloId
         });
      });
   });

   const pageWidth = 297;
   const margin = 10;
   const contentWidth = 277;

   // -------------------------------------------------------------------------
   // PÁGINA 1: CONTROL DE TANDAS DE TUESTE (Ficha Técnica de Planta)
   // -------------------------------------------------------------------------
   doc.setFillColor(253, 232, 228);
   doc.setDrawColor(0, 0, 0);
   doc.setLineWidth(0.4);
   doc.rect(margin, 9, contentWidth, 11, 'FD');

   doc.setTextColor(0, 0, 0);
   doc.setFontSize(13);
   doc.setFont('helvetica', 'bold');
   doc.text('DIA DE TUESTE ARBITRADE CANARIAS', pageWidth / 2, 16.5, { align: 'center' });

   if (day.scheduledDate) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`FECHA: ${day.scheduledDate} (DÍA #${day.dayIndex})`, contentWidth + margin - 4, 16.5, { align: 'right' });
   }

   // Tabla dinámica: Mínimo 12 filas o el total de tandas si hay más (ej. 13, 14, 16 tandas)
   const totalRows = Math.max(12, allBatches.length);
   const tableBody: any[] = [];
   for (let i = 1; i <= totalRows; i++) {
      const batch = allBatches[i - 1];
      if (batch) {
         tableBody.push([
            `${i}`,
            batch.origin,
            `${batch.greenKg}`,
            '', // Tª entrada (en blanco para fábrica)
            '', '', // Punto Inflección: Tº, Tiempo
            '', '', // Etapa Amarilla: Tº, Tiempo
            '', '', // Etapa Marrón: Tº, Tiempo
            '', '', // Primer Crack: Tº, Tiempo
            '', '', // Final Tueste: Tº, Tiempo
            `${batch.siloId}` // SILO Nº
         ]);
      } else {
         tableBody.push([
            `${i}`,
            '', '', '',
            '', '',
            '', '',
            '', '',
            '', '',
            '', '',
            ''
         ]);
      }
   }

   // Altura de fila y padding dinámicos para que todas las tandas (hasta 16-18) quepan nítidas en la página 1
   let cellHeight = 11;
   let fontSize = 8;
   let cellPadding = 2;

   if (totalRows >= 18) {
      cellHeight = 8.6;
      fontSize = 7;
      cellPadding = 1.0;
   } else if (totalRows >= 16) {
      cellHeight = 9.6;
      fontSize = 7.5;
      cellPadding = 1.3;
   } else if (totalRows >= 14) {
      cellHeight = 10.2;
      fontSize = 7.5;
      cellPadding = 1.6;
   } else if (totalRows >= 13) {
      cellHeight = 10.6;
      fontSize = 8;
      cellPadding = 1.8;
   }

   autoTable(doc, {
      startY: 22,
      margin: { left: margin, right: margin, top: 10, bottom: 8 },
      tableWidth: contentWidth,
      head: [
         [
            { content: '', colSpan: 1, styles: { fillColor: [255, 238, 0] } },
            { content: 'TUESTE DE CAFÉ', colSpan: 3, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'PUNTO INFLECCIÓN', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'ETAPA AMARILLA', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'ETAPA MARRÓN', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'PRIMER CRACK', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'FINAL TUESTE', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'SILO', colSpan: 1, styles: { halign: 'center', fillColor: [255, 238, 0] } }
         ],
         [
            { content: '', styles: { fillColor: [255, 238, 0] } },
            { content: 'Variedad', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Cantidad (Kg)', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tª entrada', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Nº', styles: { halign: 'center', fillColor: [255, 238, 0] } }
         ]
      ] as any,
      body: tableBody as any,
      theme: 'grid',
      headStyles: {
         textColor: [0, 0, 0],
         fontStyle: 'bold',
         fontSize: 7.5,
         lineColor: [0, 0, 0],
         lineWidth: 0.35,
         cellPadding: 2
      },
      styles: {
         textColor: [0, 0, 0],
         lineColor: [0, 0, 0],
         lineWidth: 0.35,
         fontSize,
         minCellHeight: cellHeight,
         cellPadding,
         valign: 'middle'
      },
      columnStyles: {
         0: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
         1: { cellWidth: 36, halign: 'left', fontStyle: 'bold' },
         2: { cellWidth: 21, halign: 'center', fontStyle: 'bold' },
         3: { cellWidth: 20, halign: 'center' },
         4: { cellWidth: 16, halign: 'center' },
         5: { cellWidth: 20, halign: 'center' },
         6: { cellWidth: 16, halign: 'center' },
         7: { cellWidth: 20, halign: 'center' },
         8: { cellWidth: 16, halign: 'center' },
         9: { cellWidth: 20, halign: 'center' },
         10: { cellWidth: 16, halign: 'center' },
         11: { cellWidth: 20, halign: 'center' },
         12: { cellWidth: 16, halign: 'center' },
         13: { cellWidth: 20, halign: 'center' },
         14: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }
      }
   });

   // -------------------------------------------------------------------------
   // PÁGINA 2: RESUMEN DE CAFÉ VERDE, TOSTADO Y EMPAQUETADO
   // -------------------------------------------------------------------------
   doc.addPage('a4', 'landscape');

   // Encabezado Melocotón
   doc.setFillColor(253, 232, 228);
   doc.setDrawColor(0, 0, 0);
   doc.setLineWidth(0.4);
   doc.rect(margin, 9, contentWidth, 11, 'FD');

   doc.setTextColor(0, 0, 0);
   doc.setFontSize(13);
   doc.setFont('helvetica', 'bold');
   doc.text('DIA DE TUESTE ARBITRADE CANARIAS', pageWidth / 2, 16.5, { align: 'center' });

   if (day.scheduledDate) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`FECHA: ${day.scheduledDate} (DÍA #${day.dayIndex})`, contentWidth + margin - 4, 16.5, { align: 'right' });
   }

   const blocks = day.blocks || [];
   const prod1 = blocks[0] ? `${blocks[0].profileName.toUpperCase()}` : 'MAURICE TIMANFAYA';
   const prod2 = blocks[1] ? `${blocks[1].profileName.toUpperCase()}` : 'MAURICE LAURISILVA';
   const prod3 = blocks[2] ? `${blocks[2].profileName.toUpperCase()}` : 'MAURICE PINZÓN AZUL';

   const topTableHead = [
      [
         { content: 'TOTAL KG CAFÉ VERDE', colSpan: 1, styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } },
         { content: 'TOTAL KG CAFÉ TOSTADO', colSpan: 1, styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } },
         { content: prod1, colSpan: 3, styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } }
      ]
   ];

   const topTableBody = [
      [
         { content: 'Arábica:', styles: { fontStyle: 'bold', halign: 'left' } },
         { content: 'Arábica:', styles: { fontStyle: 'bold', halign: 'left' } },
         { content: 'TOTAL KG. EMPAQUETADOS:', styles: { fontStyle: 'bold', halign: 'left' } },
         { content: 'Nº LOTE:', styles: { fontStyle: 'bold', halign: 'left' } },
         { content: 'FECHA DE CADUCIDAD:', styles: { fontStyle: 'bold', halign: 'left' } }
      ],
      [
         { content: '', colSpan: 2, styles: { fillColor: [255, 255, 255] } },
         { content: prod2, colSpan: 3, styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } }
      ],
      [
         { content: 'Robusta:', styles: { fontStyle: 'bold', halign: 'left' } },
         { content: 'Robusta:', styles: { fontStyle: 'bold', halign: 'left' } },
         { content: 'TOTAL KG. EMPAQUETADOS:', styles: { fontStyle: 'bold', halign: 'left' } },
         { content: 'Nº LOTE:', styles: { fontStyle: 'bold', halign: 'left' } },
         { content: 'FECHA DE CADUCIDAD:', styles: { fontStyle: 'bold', halign: 'left' } }
      ],
      [
         { content: '', colSpan: 2, styles: { fillColor: [255, 255, 255] } },
         { content: prod3, colSpan: 3, styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } }
      ],
      [
         { content: '', colSpan: 2, styles: { fillColor: [255, 255, 255] } },
         { content: 'TOTAL KG. EMPAQUETADOS:', styles: { fontStyle: 'bold', halign: 'left' } },
         { content: 'Nº LOTE:', styles: { fontStyle: 'bold', halign: 'left' } },
         { content: 'FECHA DE CADUCIDAD:', styles: { fontStyle: 'bold', halign: 'left' } }
      ]
   ];

   autoTable(doc, {
      startY: 22,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      head: topTableHead as any,
      body: topTableBody as any,
      theme: 'grid',
      headStyles: {
         textColor: [0, 0, 0],
         fontStyle: 'bold',
         fontSize: 8.5,
         lineColor: [0, 0, 0],
         lineWidth: 0.35,
         cellPadding: 2
      },
      styles: {
         textColor: [0, 0, 0],
         lineColor: [0, 0, 0],
         lineWidth: 0.35,
         fontSize: 8,
         minCellHeight: 9,
         valign: 'middle'
      },
      columnStyles: {
         0: { cellWidth: 46 },
         1: { cellWidth: 46 },
         2: { cellWidth: 65 },
         3: { cellWidth: 55 },
         4: { cellWidth: 65 }
      }
   });

   let yOffset = (doc as any).lastAutoTable.finalY + 5;

   // SECCIÓN 2: CAFÉ DE ESPECIALIDAD
   autoTable(doc, {
      startY: yOffset,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      head: [
         [{ content: 'CAFÉ DE ESPECIALIDAD', colSpan: 6, styles: { fillColor: [255, 238, 0], halign: 'center', fontSize: 11, fontStyle: 'bold' } }]
      ] as any,
      body: [
         // Fila 1
         [
            { content: 'TOTAL KG CAFÉ VERDE', styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } },
            { content: 'TOTAL KG CAFÉ TOSTADO', styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } },
            { content: 'ORIGEN:', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } },
            { content: 'ORIGEN:', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } }
         ],
         [
            '', '',
            { content: 'TOTAL KG. EMPAQUETADOS', styles: { halign: 'center', fontStyle: 'bold', fontSize: 7.5 } },
            { content: 'Nº LOTE Y CADUCIDAD', styles: { halign: 'center', fontStyle: 'bold', fontSize: 7.5 } },
            { content: 'TOTAL KG. EMPAQUETADOS', styles: { halign: 'center', fontStyle: 'bold', fontSize: 7.5 } },
            { content: 'Nº LOTE Y CADUCIDAD', styles: { halign: 'center', fontStyle: 'bold', fontSize: 7.5 } }
         ],
         // Fila 2
         [
            { content: 'TOTAL KG CAFÉ VERDE', styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } },
            { content: 'TOTAL KG CAFÉ TOSTADO', styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } },
            { content: 'ORIGEN:', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } },
            { content: 'ORIGEN:', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } }
         ],
         [
            '', '',
            { content: 'TOTAL KG. EMPAQUETADOS', styles: { halign: 'center', fontStyle: 'bold', fontSize: 7.5 } },
            { content: 'Nº LOTE Y CADUCIDAD', styles: { halign: 'center', fontStyle: 'bold', fontSize: 7.5 } },
            { content: 'TOTAL KG. EMPAQUETADOS', styles: { halign: 'center', fontStyle: 'bold', fontSize: 7.5 } },
            { content: 'Nº LOTE Y CADUCIDAD', styles: { halign: 'center', fontStyle: 'bold', fontSize: 7.5 } }
         ]
      ] as any,
      theme: 'grid',
      styles: {
         textColor: [0, 0, 0],
         lineColor: [0, 0, 0],
         lineWidth: 0.35,
         fontSize: 8,
         minCellHeight: 8.5,
         valign: 'middle'
      },
      columnStyles: {
         0: { cellWidth: 46 },
         1: { cellWidth: 46 },
         2: { cellWidth: 46 },
         3: { cellWidth: 47 },
         4: { cellWidth: 46 },
         5: { cellWidth: 46 }
      }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 6;

   // SECCIÓN 3: ENTREGA EN ALMACÉN Y FIRMAS DE CONTROL
   doc.setDrawColor(0, 0, 0);
   doc.setLineWidth(0.4);
   doc.rect(margin, yOffset, 95, 24);
   doc.setFontSize(8);
   doc.setFont('helvetica', 'bold');
   doc.text('Día que se entrega la mercancía en el almacén:', margin + 3, yOffset + 7);
   doc.text('¿Se entregó el total de la mercancía?:', margin + 3, yOffset + 17);
   doc.setFont('helvetica', 'normal');
   doc.text('SI       NO', margin + 65, yOffset + 17);

   doc.rect(margin + 99, yOffset, 75, 24);
   doc.setFont('helvetica', 'bold');
   doc.text('Si la respuesta es NO, kg entregados:', margin + 102, yOffset + 7);

   doc.rect(margin + 178, yOffset, 99, 24);
   doc.setFont('helvetica', 'bold');
   doc.text('Revisado por:', margin + 181, yOffset + 6);
   doc.text('Responsable de Compras y Almacén:', margin + 181, yOffset + 12);
   doc.text('Firma:', margin + 181, yOffset + 19);
};

export const generateSingleDayArbitradeReport = (day: DailyPlan, masterProfiles: MasterProfile[]) => {
   const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
   });

   renderArbitradeDaySheet(doc, day, masterProfiles);

   const dayLabel = day.scheduledDate ? day.scheduledDate.replace(/\//g, '-') : `DIA_${day.dayIndex}`;
   doc.save(`FICHA_OFICIAL_ARBITRADE_DIA_${day.dayIndex}_${dayLabel}.pdf`);
};

export const generateArbitradePlanReport = (days: DailyPlan[], masterProfiles: MasterProfile[], monthStr?: string) => {
   const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
   });

   days.forEach((day, idx) => {
      if (idx > 0) {
         doc.addPage('a4', 'landscape');
      }
      renderArbitradeDaySheet(doc, day, masterProfiles);
   });

   const safeMonth = (monthStr || 'MES').replace(/\s+/g, '_');
   doc.save(`FICHAS_OFICIALES_ARBITRADE_${safeMonth}.pdf`);
};

/**
 * ============================================================================
 * FORMATO 2 (ANTERIOR / RESUMIDO): PLAN GENERAL CON PORTADA Y HOJAS DE PLANTA
 * ============================================================================
 * Genera el formato anterior en A4 vertical:
 * - Página 1: Portada ejecutiva, aprovisionamiento mensual de café verde y desglose por gama/formato.
 * - Páginas siguientes: Hoja resumida de cada día con control de tandas, observaciones y firmas.
 */
export const renderDayWorksheet = (
   doc: any,
   day: DailyPlan,
   masterProfiles: MasterProfile[],
   today: string
) => {
   // Header Banner
   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 210, 28, 'F');
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(16);
   doc.setFont('helvetica', 'bold');
   doc.text('HOJA DE TRABAJO DE TUESTE - PLANTA', 15, 12);
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(9);
   const dateStr = day.scheduledDate ? ` | Fecha Prevista: ${day.scheduledDate}` : ` | Emitido: ${today}`;
   doc.text(`JORNADA #${day.dayIndex}${dateStr} | Silos Asignados: Silos ${day.targetSilos.join(', ')}`, 15, 20);

   let yOffset = 33;

   // Calculate green coffee usage for this day
   let dayTotalGreen = 0;
   const greenByOrigin: { [origin: string]: { kg: number, sacks: number, sackWeight: number } } = {};

   day.siloAssignments.forEach(silo => {
      silo.batches.forEach(batch => {
         const sackWeight = getOriginSackWeight(silo.origin, batch.profileName, masterProfiles);
         const batchGreen = sackWeight * 2;
         dayTotalGreen += batchGreen;
         const originKey = silo.origin.trim();
         if (!greenByOrigin[originKey]) {
            greenByOrigin[originKey] = { kg: 0, sacks: 0, sackWeight };
         }
         greenByOrigin[originKey].kg += batchGreen;
         greenByOrigin[originKey].sacks += 2;
         greenByOrigin[originKey].sackWeight = sackWeight;
      });
   });

   // Resumen rápido de la jornada
   const summaryRows = [
      ['Total Café Tostado Previsto:', `${day.totalKg.toFixed(1)} kg`, 'Total Café Verde Requerido:', `${dayTotalGreen.toFixed(1)} kg`],
      ['Desglose de Café Verde:', Object.entries(greenByOrigin).map(([orig, v]: any) => `${orig}: ${v.kg} kg (${v.sacks} sc de ${v.sackWeight}kg)`).join(' | '), 'Estado:', '[  ] PENDIENTE DE TUESTE']
   ];

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      body: summaryRows as any,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.8 },
      columnStyles: {
         0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 44 },
         1: { cellWidth: 46 },
         2: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 44 },
         3: { cellWidth: 46 }
      }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 6;

   // Tabla de Tandas
   let batchCounter = 1;
   const batchRows: any[] = [];
   day.siloAssignments.forEach(silo => {
      silo.batches.forEach((batch) => {
         const sackWeight = getOriginSackWeight(silo.origin, batch.profileName, masterProfiles);
         const greenKg = sackWeight * 2;
         
         batchRows.push([
            '[  ]',
            `#${batchCounter++}`,
            `Silo ${silo.siloId}`,
            silo.origin.trim(),
            `2 sacos (${sackWeight}kg/sc = ${greenKg}kg)`,
            batch.profileName,
            batch.format,
            '____________'
         ]);
      });
   });

   doc.setFontSize(8.5);
   doc.setFont('helvetica', 'bold');
   doc.setTextColor(40, 40, 40);
   doc.text('CONTROL Y REGISTRO DE TANDAS EN PLANTA (Marcar con bolígrafo al tostar):', 15, yOffset);
   yOffset += 2.5;

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      head: [['OK', 'Nº', 'Silo', 'Origen Verde', 'Carga Verde', 'Gama / Perfil', 'Formato', 'Tostado Real']] as any,
      body: batchRows as any,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], fontSize: 8, halign: 'center' },
      styles: { fontSize: 7.5, cellPadding: 1.8, halign: 'left' },
      columnStyles: {
         0: { halign: 'center', cellWidth: 12, fontStyle: 'bold' },
         1: { halign: 'center', cellWidth: 10 },
         2: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
         3: { cellWidth: 26 },
         4: { cellWidth: 26 },
         5: { fontStyle: 'bold', cellWidth: 44 },
         6: { cellWidth: 18 },
         7: { halign: 'center', cellWidth: 28 }
      }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 6;

   // Cuadro de Observaciones y Firmas
   if (yOffset > 240) {
      doc.addPage();
      yOffset = 20;
   }

   doc.setDrawColor(180, 180, 180);
   doc.setLineDashPattern([1, 1], 0);
   doc.roundedRect(15, yOffset, 180, 26, 2, 2, 'S');

   doc.setFontSize(7.5);
   doc.setFont('helvetica', 'bold');
   doc.setTextColor(80, 80, 80);
   doc.text('INCIDENCIAS / OBSERVACIONES DEL TOSTADOR:', 18, yOffset + 5);

   doc.setFont('helvetica', 'normal');
   doc.text('Merma observada / Temperaturas / Silos: ________________________________________________________________________', 18, yOffset + 12);
   doc.text('__________________________________________________________________________________________________________________', 18, yOffset + 19);

   yOffset += 32;

   doc.setFontSize(7.5);
   doc.setFont('helvetica', 'bold');
   doc.text('Operario Tostador: ___________________________', 15, yOffset);
   doc.text('Firma Operario: ___________________________', 80, yOffset);
   doc.text('VºBº Calidad / Planta: ___________________________', 145, yOffset);
};

export const generateSingleDaySummaryReport = (day: DailyPlan, masterProfiles: MasterProfile[]) => {
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

   renderDayWorksheet(doc, day, masterProfiles, today);

   const dayLabel = day.scheduledDate ? day.scheduledDate.replace(/\//g, '-') : `DIA_${day.dayIndex}`;
   doc.save(`FICHA_RESUMIDA_PLANTA_DIA_${day.dayIndex}_${dayLabel}.pdf`);
};

export const generateSummaryPlanReport = (
   days: DailyPlan[],
   masterProfiles: MasterProfile[],
   monthStr?: string,
   demands: any[] = []
) => {
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

   const BOXES_PER_PALLET = 48;

   const getUnitsPerBox = (format: string): number => {
      switch (format) {
         case '1000g': return 10;
         case '500g': return 20;
         case '450g': return 20;
         case '250g': return 40;
         case '2KG': return 5;
         default: return 10;
      }
   };

   // -------------------------------------------------------------------------
   // PÁGINA 1: PORTADA EJECUTIVA Y LOGÍSTICA DE EXPEDICIÓN
   // -------------------------------------------------------------------------
   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 210, 30, 'F');
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(17);
   doc.setFont('helvetica', 'bold');
   doc.text('COFFEE FLOW - PLAN GENERAL DE TUESTE', 15, 13);
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(8.5);
   doc.text(`PLANIFICACIÓN MENSUAL, APROVISIONAMIENTO Y LOGÍSTICA DE EXPEDICIÓN | ${monthStr || 'MES COMPLETO'}`, 15, 22);

   let yOffset = 36;

   let globalTotalRoasted = 0;
   let globalTotalGreen = 0;
   const globalGreenByOrigin: { [origin: string]: { kg: number, sacks: number, sackWeight: number } } = {};
   const globalBlocks: { [key: string]: { profileName: string, format: string, totalKg: number, days: number[] } } = {};

   days.forEach(day => {
      globalTotalRoasted += day.totalKg;
      
      day.siloAssignments.forEach(silo => {
         silo.batches.forEach(batch => {
            const sackWeight = getOriginSackWeight(silo.origin, batch.profileName, masterProfiles);
            const batchGreen = sackWeight * 2;
            globalTotalGreen += batchGreen;
            const originKey = silo.origin.trim();
            if (!globalGreenByOrigin[originKey]) {
               globalGreenByOrigin[originKey] = { kg: 0, sacks: 0, sackWeight };
            }
            globalGreenByOrigin[originKey].kg += batchGreen;
            globalGreenByOrigin[originKey].sacks += 2;
            globalGreenByOrigin[originKey].sackWeight = sackWeight;
         });
      });

      day.blocks.forEach(b => {
         const key = `${b.profileName}__${b.format}`;
         if (!globalBlocks[key]) {
            globalBlocks[key] = { profileName: b.profileName, format: b.format, totalKg: 0, days: [] };
         }
         globalBlocks[key].totalKg += b.targetKg;
         if (!globalBlocks[key].days.includes(day.dayIndex)) {
            globalBlocks[key].days.push(day.dayIndex);
         }
      });
   });

   // -------------------------------------------------------------------------
   // NORMALIZACIÓN LOGÍSTICA: REGLA DE CANARIAS Y PENÍNSULA
   // - Tueste en Las Palmas (Gran Canaria).
   // - Timanfaya 1 kg: Todos los meses, 800 kg son para Tenerife (en cajas de 10 kg = 80 cj = 1.67 pal).
   // - El resto de Timanfaya 1 kg se consume en Gran Canaria en jaulas de 400 kg (0 cajas).
   // - Gran Canaria no utiliza cajas de cartón excepto para Maurice Alicanto 250 g (40 pk/cj = 10 kg).
   // - Resto de delegaciones (Tenerife y Península): siempre en cajas de 10 kg y pallets de 48 cajas (480 kg).
   // -------------------------------------------------------------------------

   interface NormalizedDemandItem {
      delegation: string;
      profileName: string;
      format: string;
      kg: number;
      packages: number;
      boxesCount: number;
      palletsCount: number;
      jaulasCount: number;
      packagingNote: string;
      isJaulas: boolean;
   }

   const normalizedDemands: NormalizedDemandItem[] = [];

   // Obtenemos demandas base
   const rawDemands = (demands && demands.length > 0)
      ? demands.filter(d => d.status !== 'COMPLETED' && d.status !== 'REVIEWED')
      : [];

   // Si no hay demandas explícitas, sintetizamos a partir de los bloques de producción calculados
   if (rawDemands.length === 0) {
      Object.values(globalBlocks).forEach(b => {
         rawDemands.push({
            id: `SYNTH-${b.profileName}`,
            delegation: 'Gran Canaria',
            profileName: b.profileName,
            format: b.format,
            kgRequested: b.totalKg,
            totalPackages: Math.round(b.totalKg / getFormatWeight(b.format))
         });
      });
   }

   // 1. Separar Timanfaya 1kg del resto
   const timanfayaDemands = rawDemands.filter(d => 
      (d.profileName || '').toLowerCase().includes('timanfaya') && (d.format === '1000g' || !d.format)
   );
   const otherDemands = rawDemands.filter(d => 
      !((d.profileName || '').toLowerCase().includes('timanfaya') && (d.format === '1000g' || !d.format))
   );

   if (timanfayaDemands.length > 0) {
      const totalTimanfayaKg = timanfayaDemands.reduce((sum, d) => sum + (d.kgRequested || 0), 0);
      const existingTfDemand = timanfayaDemands.find(d => (d.delegation || '').toLowerCase().includes('tenerife'));
      // Fijo mensual: 800 kg para Tenerife (o el valor especificado si hay una demanda concreta)
      const tfKg = existingTfDemand ? (existingTfDemand.kgRequested || 800) : 800;
      const gcKg = Math.max(0, totalTimanfayaKg - tfKg);

      // Tenerife: 800 kg en cajas (80 cajas, 1.67 pallets)
      const tfBoxes = Math.round(tfKg / 10);
      const tfPallets = tfBoxes / BOXES_PER_PALLET;
      normalizedDemands.push({
         delegation: 'Tenerife',
         profileName: timanfayaDemands[0].profileName || 'MAURICE TIMANFAYA 1 KG',
         format: '1000g',
         kg: tfKg,
         packages: tfKg,
         boxesCount: tfBoxes,
         palletsCount: tfPallets,
         jaulasCount: 0,
         packagingNote: 'Cajas (Envío Tenerife - 80 cj)',
         isJaulas: false
      });

      // Gran Canaria: Resto en jaulas de 400 kg (0 cajas)
      if (gcKg > 0) {
         const gcJaulas = gcKg / 400;
         normalizedDemands.push({
            delegation: 'Gran Canaria',
            profileName: timanfayaDemands[0].profileName || 'MAURICE TIMANFAYA 1 KG',
            format: '1000g',
            kg: gcKg,
            packages: gcKg,
            boxesCount: 0,
            palletsCount: 0,
            jaulasCount: gcJaulas,
            packagingNote: 'Jaulas 400 kg (Local GC)',
            isJaulas: true
         });
      }
   }

   // 2. Procesar el resto de demandas
   otherDemands.forEach(d => {
      const kg = d.kgRequested || 0;
      const fmt = d.format || '1000g';
      const weightPerPkg = getFormatWeight(fmt);
      const packages = Math.round(kg / weightPerPkg);

      const delLower = (d.delegation || '').toLowerCase();
      const isGC = delLower.includes('gran canaria') || delLower === 'canarias' || delLower === 'las palmas';
      const isTF = delLower.includes('tenerife');
      const isAlicanto250 = (d.profileName || '').toLowerCase().includes('alicanto') && fmt === '250g';

      if (isGC) {
         if (isAlicanto250) {
            const boxes = Math.round(kg / 10);
            const pallets = boxes / BOXES_PER_PALLET;
            normalizedDemands.push({
               delegation: 'Gran Canaria',
               profileName: d.profileName || 'GAMA',
               format: fmt,
               kg,
               packages,
               boxesCount: boxes,
               palletsCount: pallets,
               jaulasCount: 0,
               packagingNote: 'Cajas (Excepción GC)',
               isJaulas: false
            });
         } else {
            const jaulas = kg / 400;
            normalizedDemands.push({
               delegation: 'Gran Canaria',
               profileName: d.profileName || 'GAMA',
               format: fmt,
               kg,
               packages,
               boxesCount: 0,
               palletsCount: 0,
               jaulasCount: jaulas,
               packagingNote: 'Jaulas Locales (Sin Cajas)',
               isJaulas: true
            });
         }
      } else {
         const boxes = Math.round(kg / 10);
         const pallets = boxes / BOXES_PER_PALLET;
         normalizedDemands.push({
            delegation: d.delegation || 'CENTRAL',
            profileName: d.profileName || 'GAMA',
            format: fmt,
            kg,
            packages,
            boxesCount: boxes,
            palletsCount: pallets,
            jaulasCount: 0,
            packagingNote: isTF ? 'Pallet / Cajas (Tenerife)' : 'Pallet / Cajas',
            isJaulas: false
         });
      }
   });

   // Totales Globales
   const totalGlobalBoxes = normalizedDemands.reduce((acc, item) => acc + item.boxesCount, 0);
   const totalGlobalJaulas = normalizedDemands.reduce((acc, item) => acc + item.jaulasCount, 0);
   const totalGlobalPallets = totalGlobalBoxes / BOXES_PER_PALLET;

   // Resumen Ejecutivo (KPIs con Cajas reales, Pallets y Jaulas GC)
   const kpiRows = [
      ['Jornadas Programadas:', `${days.length} Días de Tueste`, 'Total Café Tostado:', `${globalTotalRoasted.toLocaleString()} kg`],
      ['Total Café Verde:', `${globalTotalGreen.toLocaleString()} kg`, 'Total Sacos Verde:', `${Object.values(globalGreenByOrigin).reduce((acc: number, v: any) => acc + v.sacks, 0)} sacos`],
      ['Cajas a Fabricar (10kg):', `${Math.round(totalGlobalBoxes).toLocaleString()} cajas`, 'Expedición Pallets / Jaulas:', `${totalGlobalPallets.toFixed(2)} pal (48c) + ${totalGlobalJaulas.toFixed(1)} jlas GC`]
   ];

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      body: kpiRows as any,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.8 },
      columnStyles: {
         0: { fontStyle: 'bold', fillColor: [240, 240, 240], cellWidth: 46 },
         1: { fontStyle: 'bold', textColor: [217, 119, 6], cellWidth: 44 },
         2: { fontStyle: 'bold', fillColor: [240, 240, 240], cellWidth: 46 },
         3: { fontStyle: 'bold', textColor: [30, 120, 30], cellWidth: 44 }
      }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 6;

   // 1. Tabla 1: Aprovisionamiento de Café Verde por Origen
   doc.setFontSize(9.5);
   doc.setFont('helvetica', 'bold');
   doc.setTextColor(40, 40, 40);
   doc.text('1. APROVISIONAMIENTO DE CAFÉ VERDE (Necesidades de Almacén / Compras):', 15, yOffset);
   yOffset += 2.5;

   const greenRows = Object.entries(globalGreenByOrigin).map(([origin, val]: any) => {
      const pct = globalTotalGreen > 0 ? ((val.kg / globalTotalGreen) * 100).toFixed(1) : '0';
      return [
         origin,
         `${val.sackWeight} kg / saco`,
         `${val.kg.toFixed(1)} kg`,
         `${val.sacks} sacos`,
         `${pct} %`
      ];
   });

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      head: [['Origen / Variedad', 'Peso por Saco', 'Kg Verde Requerido', 'Total Sacos Necesarios', '% del Consumo']] as any,
      body: greenRows as any,
      theme: 'striped',
      headStyles: { fillColor: [40, 40, 40], fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 1.5 }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 6;

   // 2. Tabla 2: Pallets Totales por Gama a Hacer
   doc.setFontSize(9.5);
   doc.setFont('helvetica', 'bold');
   doc.setTextColor(40, 40, 40);
   doc.text('2. LOGÍSTICA DE PRODUCCIÓN: PALLETS Y CAJAS TOTALES POR GAMA:', 15, yOffset);
   yOffset += 2.5;

   const productLogisticsRows = Object.values(globalBlocks).map(p => {
      const weightPerPkg = getFormatWeight(p.format);
      const unitsPerBox = getUnitsPerBox(p.format);
      const totalPackages = Math.round(p.totalKg / weightPerPkg);
      const isTimanfaya1kg = p.profileName.toLowerCase().includes('timanfaya') && p.format === '1000g';

      let boxesText = `${Math.round(p.totalKg / 10)} cj (${unitsPerBox} ud/cj)`;
      let palletsText = `${(p.totalKg / 480).toFixed(2)} pal`;

      if (isTimanfaya1kg) {
         // Desglose de Timanfaya 1kg entre Jaulas GC y Cajas Tenerife
         // Regla fija: 800 kg mensuales para Tenerife (80 cj, 1.67 pal) y el resto en jaulas de 400kg para Gran Canaria
         const tfDemand = normalizedDemands.find(d => d.delegation.toLowerCase().includes('tenerife') && d.profileName.toLowerCase().includes('timanfaya'));
         const tfKg = tfDemand ? tfDemand.kg : 800;
         const tfBoxes = Math.round(tfKg / 10);
         const tfPal = (tfBoxes / BOXES_PER_PALLET).toFixed(2);
         const gcKg = Math.max(0, p.totalKg - tfKg);
         const gcJaulas = (gcKg / 400).toFixed(1);

         boxesText = `${tfBoxes} cj TF (10ud) + ${gcKg}kg GC`;
         palletsText = `${gcJaulas} jlas GC (400k) + ${tfPal} pal TF (80 cj)`;
      }

      return [
         p.profileName,
         p.format,
         `${p.totalKg.toLocaleString()} kg`,
         totalPackages.toLocaleString(),
         boxesText,
         palletsText,
         p.days.map(d => `Día ${d}`).join(', ')
      ];
   });

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      head: [['Gama / Perfil', 'Formato', 'Total Tostado', 'Paquetes', 'Cajas (10kg)', 'Pallets (48c) / Jaulas', 'Jornadas']] as any,
      body: productLogisticsRows as any,
      theme: 'striped',
      headStyles: { fillColor: [217, 119, 6], fontSize: 7.5, textColor: [255, 255, 255] },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      columnStyles: {
         0: { fontStyle: 'bold', cellWidth: 42 },
         1: { cellWidth: 15 },
         2: { fontStyle: 'bold', cellWidth: 20 },
         3: { cellWidth: 18 },
         4: { cellWidth: 30 },
         5: { fontStyle: 'bold', cellWidth: 37 },
         6: { cellWidth: 18 }
      }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 6;

   // 3. Tabla 3: Pallets Totales por Gama por Delegación
   doc.setFontSize(9.5);
   doc.setFont('helvetica', 'bold');
   doc.setTextColor(40, 40, 40);
   doc.text('3. DISTRIBUCIÓN Y PALLETS POR GAMA Y DELEGACIÓN (Logística Canarias & Península):', 15, yOffset);
   yOffset += 2.5;

   const delegationRows = normalizedDemands.map(item => [
      item.delegation,
      item.profileName,
      item.format,
      `${item.kg.toLocaleString()} kg`,
      item.packages.toLocaleString(),
      item.isJaulas ? '0 cj (Jaulas)' : `${item.boxesCount} cj`,
      item.isJaulas ? `${item.jaulasCount.toFixed(1)} jaulas` : `${item.palletsCount.toFixed(2)} pal`,
      item.packagingNote
   ]);

   const delegationSummary: { [key: string]: { kg: number, boxes: number, pallets: number, jaulas: number } } = {};
   normalizedDemands.forEach(item => {
      const delKey = item.delegation;
      if (!delegationSummary[delKey]) {
         delegationSummary[delKey] = { kg: 0, boxes: 0, pallets: 0, jaulas: 0 };
      }
      delegationSummary[delKey].kg += item.kg;
      delegationSummary[delKey].boxes += item.boxesCount;
      delegationSummary[delKey].pallets += item.palletsCount;
      delegationSummary[delKey].jaulas += item.jaulasCount;
   });

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      head: [['Delegación', 'Gama Solicitada', 'Formato', 'Kg Pedidos', 'Paquetes', 'Cajas (10k)', 'Pallets / Jla', 'Tipo Expedición']] as any,
      body: delegationRows as any,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], fontSize: 7.5 },
      styles: { fontSize: 7, cellPadding: 1.4 },
      columnStyles: {
         0: { fontStyle: 'bold', fillColor: [248, 248, 248], cellWidth: 24 },
         1: { fontStyle: 'bold', cellWidth: 40 },
         2: { cellWidth: 14 },
         3: { fontStyle: 'bold', cellWidth: 18 },
         4: { cellWidth: 16 },
         5: { cellWidth: 18 },
         6: { fontStyle: 'bold', textColor: [217, 119, 6], cellWidth: 22 },
         7: { cellWidth: 28, fontSize: 6.5 }
      }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 4;

   // Resumen inline por delegación
   if (Object.keys(delegationSummary).length > 0) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80, 80, 80);
      const delSummaryText = Object.entries(delegationSummary)
         .map(([del, data]) => {
            const parts = [];
            if (data.boxes > 0) parts.push(`${Math.round(data.boxes)} cj = ${data.pallets.toFixed(2)} pal`);
            if (data.jaulas > 0) parts.push(`${data.jaulas.toFixed(1)} jlas (400k)`);
            return `${del.toUpperCase()}: ${data.kg.toLocaleString()} kg (${parts.join(' + ') || 'Jaulas locales'})`;
         })
         .join('   |   ');
      doc.text(`Totales Expedición: ${delSummaryText}`, 15, yOffset);
   }

   // -------------------------------------------------------------------------
   // PÁGINAS SIGUIENTES: HOJA DE TRABAJO INDIVIDUAL DE CADA DÍA
   // -------------------------------------------------------------------------
   days.forEach(day => {
      doc.addPage();
      renderDayWorksheet(doc, day, masterProfiles, today);
   });

   const safeMonth = (monthStr || 'GENERAL').replace(/\s+/g, '_');
   doc.save(`PLAN_RESUMIDO_TUESTE_${safeMonth}_${today.replace(/\//g, '_')}.pdf`);
};

// Aliases para compatibilidad hacia atrás
export const generateSingleDayPlanReport = generateSingleDayArbitradeReport;
export const generateRoastingPlanReport = generateArbitradePlanReport;
