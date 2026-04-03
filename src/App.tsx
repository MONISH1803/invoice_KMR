import React, { useState, useEffect } from 'react';
import { Calculator, AlertCircle, Info, ChevronDown, ChevronUp, BookOpen, LineChart as LineChartIcon, Sliders } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const EUROCODE_ALLOYS = [
  // Eurocode EN 1999-1-1 Table 3.2a thickness limits + characteristic strengths (sheet/strip/plate)
  // NOTE: For alloy dropdown groups that contain multiple tempers (e.g. H14/H24/H34), we use the conservative (lower) fo
  // and the conservative (lower) HAZ reduction factor rho_o from the table cell, and we apply the EC9 max thickness limit.
  { id: '3004-H14', name: '3004-H14/H24/H34', maxThickness: 6.13, getProps: (t: number, sectionType: string) => { if (t <= 6) return { fo: 180, fu: 220, rho_o: 0.42, rho_u: 0.70 }; return { fo: 170, fu: 220, rho_o: 0.44, rho_u: 0.70 }; } },
  { id: '3004-H16', name: '3004-H16/H26/H36', maxThickness: 4.13, getProps: (t: number, sectionType: string) => { if (t <= 4) return { fo: 200, fu: 240, rho_o: 0.38, rho_u: 0.65 }; return { fo: 190, fu: 240, rho_o: 0.39, rho_u: 0.65 }; } },
  { id: '3005-H14', name: '3005-H14/H24', maxThickness: 6.13, getProps: (t: number, sectionType: string) => { if (t <= 6) return { fo: 150, fu: 170, rho_o: 0.37, rho_u: 0.68 }; return { fo: 130, fu: 170, rho_o: 0.43, rho_u: 0.68 }; } },
  { id: '3005-H16', name: '3005-H16/H26', maxThickness: 4.13, getProps: (t: number, sectionType: string) => { if (t <= 4) return { fo: 175, fu: 195, rho_o: 0.32, rho_u: 0.59 }; return { fo: 160, fu: 195, rho_o: 0.35, rho_u: 0.59 }; } },
  { id: '3103-H14', name: '3103-H14/H24', maxThickness: 25, getProps: (t: number, sectionType: string) => { if (t <= 2) return { fo: 120, fu: 140, rho_o: 0.37, rho_u: 0.64 }; return { fo: 110, fu: 140, rho_o: 0.40, rho_u: 0.64 }; } },
  { id: '3103-H16', name: '3103-H16/H26', maxThickness: 4, getProps: (t: number, sectionType: string) => { if (t <= 4) return { fo: 145, fu: 160, rho_o: 0.30, rho_u: 0.56 }; return { fo: 135, fu: 160, rho_o: 0.33, rho_u: 0.56 }; } },
  { id: '5005-O', name: '5005/5005A-O/H111', maxThickness: 50, getProps: (t: number, sectionType: string) => { return { fo: 35, fu: 100, rho_o: 1.0, rho_u: 1.0 }; } },
  { id: '5005-H12', name: '5005/5005A-H12/H22/H32', maxThickness: 12.5, getProps: (t: number, sectionType: string) => { return { fo: 80, fu: 125, rho_o: 0.46, rho_u: 0.80 }; } },
  { id: '5005-H14', name: '5005/5005A-H14/H24/H34', maxThickness: 12.5, getProps: (t: number, sectionType: string) => { return { fo: 120, fu: 145, rho_o: 0.37, rho_u: 0.69 }; } },
  { id: '5049-O', name: '5049-O/H111', maxThickness: 100, getProps: (t: number, sectionType: string) => { return { fo: 80, fu: 190, rho_o: 1.0, rho_u: 1.0 }; } },
  { id: '5049-H14', name: '5049-H14/H24/H34', maxThickness: 25, getProps: (t: number, sectionType: string) => { return { fo: 190, fu: 240, rho_o: 0.53, rho_u: 0.79 }; } },
  { id: '5052-H12', name: '5052-H12/H22/H32', maxThickness: 40, getProps: (t: number, sectionType: string) => { return { fo: 130, fu: 210, rho_o: 0.50, rho_u: 0.81 }; } },
  { id: '5052-H14', name: '5052-H14/H24/H34', maxThickness: 25, getProps: (t: number, sectionType: string) => { return { fo: 180, fu: 230, rho_o: 0.44, rho_u: 0.74 }; } },
  { id: '5083-O', name: '5083-O/H111', maxThickness: 80, getProps: (t: number, sectionType: string) => { if (t <= 50) return { fo: 125, fu: 275, rho_o: 1.0, rho_u: 1.0 }; return { fo: 115, fu: 270, rho_o: 1.0, rho_u: 1.0 }; } },
  { id: '5083-H12', name: '5083-H12/H22/H32', maxThickness: 40, getProps: (t: number, sectionType: string) => { return { fo: 250, fu: 305, rho_o: 0.62, rho_u: 0.90 }; } },
  { id: '5083-H14', name: '5083-H14/H24/H34', maxThickness: 25, getProps: (t: number, sectionType: string) => { return { fo: 280, fu: 340, rho_o: 0.55, rho_u: 0.81 }; } },
  { id: '5454-O', name: '5454-O/H111', maxThickness: 80, getProps: (t: number, sectionType: string) => { return { fo: 85, fu: 215, rho_o: 1.0, rho_u: 1.0 }; } },
  { id: '5454-H14', name: '5454-H14/H24/H34', maxThickness: 25, getProps: (t: number, sectionType: string) => { return { fo: 220, fu: 270, rho_o: 0.48, rho_u: 0.80 }; } },
  { id: '5754-O', name: '5754-O/H111', maxThickness: 100, getProps: (t: number, sectionType: string) => { return { fo: 80, fu: 190, rho_o: 1.0, rho_u: 1.0 }; } },
  { id: '5754-H14', name: '5754-H14/H24/H34', maxThickness: 25, getProps: (t: number, sectionType: string) => { return { fo: 190, fu: 240, rho_o: 0.53, rho_u: 0.79 }; } },
  { id: '6005A-T4', name: '6005A-T4', getProps: (t: number, sectionType: string) => { return { fo: 110, fu: 180, rho_o: 0.82, rho_u: 0.72 }; } },
  { id: '6005A-T6', name: '6005A-T6', getProps: (t: number, sectionType: string) => { if (t <= 5) return { fo: 215, fu: 255, rho_o: 0.53, rho_u: 0.65 }; return { fo: 200, fu: 250, rho_o: 0.58, rho_u: 0.66 }; } },
  { id: '6060-T4', name: '6060-T4', getProps: (t: number, sectionType: string) => { return { fo: 60, fu: 120, rho_o: 1.0, rho_u: 0.83 }; } },
  { id: '6060-T5', name: '6060-T5', getProps: (t: number, sectionType: string) => { return { fo: 120, fu: 160, rho_o: 0.50, rho_u: 0.63 }; } },
  { id: '6060-T6', name: '6060-T6', getProps: (t: number, sectionType: string) => { return { fo: 150, fu: 190, rho_o: 0.43, rho_u: 0.53 }; } },
  { id: '6060-T66', name: '6060-T66', getProps: (t: number, sectionType: string) => { return { fo: 160, fu: 215, rho_o: 0.41, rho_u: 0.47 }; } },
  { id: '6061-T4', name: '6061-T4/T451', maxThickness: 12.5, getProps: (t: number, sectionType: string) => { return { fo: 110, fu: 205, rho_o: 0.86, rho_u: 0.73 }; } },
  { id: 'HE30-WP (6061-T6)', name: '6061-T6/T651 (HE30-WP)', maxThickness: 80, getProps: (t: number, sectionType: string) => { if (sectionType === 'Plate') { return { fo: 240, fu: 290, rho_o: 0.48, rho_u: 0.60 }; } else { return { fo: 240, fu: 260, rho_o: 0.48, rho_u: 0.60 }; } } },
  { id: '6063-T4', name: '6063-T4', getProps: (t: number, sectionType: string) => { return { fo: 65, fu: 130, rho_o: 1.0, rho_u: 0.77 }; } },
  { id: '6063-T5', name: '6063-T5', getProps: (t: number, sectionType: string) => { return { fo: 130, fu: 175, rho_o: 0.50, rho_u: 0.57 }; } },
  { id: 'HE9-WP (6063-T6)', name: '6063-T6 (HE9-WP)', getProps: (t: number, sectionType: string) => { return { fo: 170, fu: 215, rho_o: 0.38, rho_u: 0.47 }; } },
  { id: '6063-T66', name: '6063-T66', getProps: (t: number, sectionType: string) => { return { fo: 200, fu: 245, rho_o: 0.33, rho_u: 0.41 }; } },
  { id: '6082-T4', name: '6082-T4/T451', getProps: (t: number, sectionType: string) => { return { fo: 110, fu: 205, rho_o: 0.91, rho_u: 0.78 }; } },
  { id: 'HE20-WP (6082-T6)', name: '6082-T6/T651 (HE20-WP)', getProps: (t: number, sectionType: string) => { if (sectionType === 'Plate') { if (t <= 6) return { fo: 260, fu: 310, rho_o: 0.48, rho_u: 0.60 }; if (t <= 12.5) return { fo: 255, fu: 300, rho_o: 0.49, rho_u: 0.62 }; return { fo: 240, fu: 295, rho_o: 0.52, rho_u: 0.63 }; } else { if (t <= 5) return { fo: 250, fu: 290, rho_o: 0.50, rho_u: 0.64 }; return { fo: 260, fu: 310, rho_o: 0.48, rho_u: 0.60 }; } } },
  { id: '7020-T6', name: '7020-T6/T651', getProps: (t: number, sectionType: string) => { return { fo: 280, fu: 350, rho_o: 0.73, rho_u: 0.80 }; } },
  { id: 'Generic/Unspecified', name: 'Generic/Unspecified', getProps: (t: number, sectionType: string) => { return { fo: 250, fu: 290, rho_o: 1.0, rho_u: 1.0 }; } }
];

const IS8147_ALLOYS = [
  { id: 'IS-64430-WP', name: 'IS 64430 (H30) WP', getProps: (t: number, sectionType: string) => { if (sectionType === 'Plate') { if (t <= 6.3) return { sigma_at: 250, sigma_at_rupture: 295 }; return { sigma_at: 240, sigma_at_rupture: 285 }; } else { if (t <= 6.3) return { sigma_at: 255, sigma_at_rupture: 295 }; return { sigma_at: 270, sigma_at_rupture: 310 }; } } },
  { id: 'IS-65032-WP', name: 'IS 65032 (H20) WP', getProps: (t: number, sectionType: string) => { return { sigma_at: 235, sigma_at_rupture: 280 }; } },
  { id: 'IS-63400-P', name: 'IS 63400 (H9) P', getProps: (t: number, sectionType: string) => { if (t <= 3.15) return { sigma_at: 140, sigma_at_rupture: 175 }; return { sigma_at: 110, sigma_at_rupture: 155 }; } },
  { id: 'IS-63400-M', name: 'IS 63400 (H9) M', getProps: (t: number, sectionType: string) => { if (sectionType === 'Plate') { return { sigma_at: 125, sigma_at_rupture: 280 }; } else { return { sigma_at: 130, sigma_at_rupture: 275 }; } } },
  { id: 'IS-54300-O', name: 'IS 54300 (N8) O', getProps: (t: number, sectionType: string) => { if (sectionType === 'Plate') { if (t <= 6.3) return { sigma_at: 130, sigma_at_rupture: 265 }; return { sigma_at: 115, sigma_at_rupture: 270 }; } else { return { sigma_at: 130, sigma_at_rupture: 280 }; } } },
  { id: 'Generic/Unspecified', name: 'Generic/Unspecified', getProps: (t: number, sectionType: string) => { return { sigma_at: 105, sigma_at_rupture: 105 }; } }
];



// Calculation Logic strictly adhering to EN 1999-1-1 and IS 8147:1976
export function calculateConnectionCapacities(inputs: any) {
  const {
    width, thickness, dia, noOfHoles: n, rows: n_line,
    g, s: p, e, fy, fu, gammaM0, gammaM1, gammaM2,
    sigma_at, sigma_at_rupture, tau_a, connection, considerHAZ, rho_o, rho_u
  } = inputs;

  let fy_eff = fy;
  let fu_eff = fu;
  if (connection === 'Welded' && considerHAZ) {
    fy_eff = fy * (rho_o !== undefined ? rho_o : inputs.rho);
    fu_eff = fu * (rho_u !== undefined ? rho_u : inputs.rho);
  }

  // 1. Geometric Variables & Area Logic
  const dh = dia + 2; // Hole Diameter: Bolt Diameter + 2mm
  
  let Ag = 0;
  let An = 0;
  
  if (inputs.sectionType === 'Plate') {
    Ag = width * thickness;
    An = connection === 'Welded' ? Ag : (width - (n * dh)) * thickness;
  } else if (inputs.sectionType === 'Single Angle') {
    Ag = (inputs.leg1 + inputs.leg2 - thickness) * thickness;
    An = connection === 'Welded' ? Ag : Ag - (n * dh * thickness);
  } else if (inputs.sectionType === 'Double Angle') {
    Ag = 2 * (inputs.leg1 + inputs.leg2 - thickness) * thickness;
    An = connection === 'Welded' ? Ag : Ag - (n * dh * 2 * thickness);
  }
  
  // Net Tension Area for Block Shear (Ant): (Gauge - dh) * Thickness
  let Ant = connection === 'Welded' ? 0 : (g - dh) * thickness;
  let Atg = connection === 'Welded' ? 0 : g * thickness;
  if (inputs.sectionType === 'Double Angle') {
    Ant *= 2;
    Atg *= 2;
  }
  
  // Net Shear Area for Block Shear (Anv): 2 * (Edge + Pitch * (n_line - 1) - (n_line - 0.5) * dh) * Thickness
  let Anv = connection === 'Welded' ? 0 : 2 * (e + p * (n_line - 1) - (n_line - 0.5) * dh) * thickness;
  let Avg = connection === 'Welded' ? 0 : 2 * (e + p * (n_line - 1)) * thickness;
  if (inputs.sectionType === 'Double Angle') {
    Anv *= 2;
    Avg *= 2;
  }

  // 2. Eurocode 9 (EN 1999-1-1) Implementation
  // Yielding (N_pl,Rd): (Ag * fy) / gammaM0
  const ecYield = (Ag * fy_eff) / gammaM0 / 1000;
  
  // Constraint: Apply beta (Shear Lag) ONLY to Rupture. beta = 0.65 for 2 bolts/line and 0.70 for 3+ bolts/line.
  // EN 1999-1-1 Clause 6.2.3 (2) b - only applies to unsymmetrically connected members like Single Angles
  let beta = 1.0;
  if (connection === 'Bolted' && inputs.sectionType === 'Single Angle') {
    beta = n_line >= 3 ? 0.70 : (n_line === 2 ? 0.65 : 1.0);
  }
  
  // Rupture (N_u,Rd): (0.9 × Aeff × fu) / gammaM2
  const Aeff = An * beta;
  const ecRupture = (0.9 * Aeff * fu_eff) / gammaM2 / 1000;
  
  // Block Shear (V_eff,Rd): (fu * Ant / gammaM2) + (fy * Anv / (sqrt(3) * gammaM1))
  // Constraint: Do NOT apply beta to Block Shear. Use uniform tension distribution factor (u_bs = 1.0).
  let ecBlockShear = 0;
  if (connection === 'Bolted' && n_line > 0 && p > 0) {
    ecBlockShear = ((fu_eff * Ant) / gammaM2 + (fy_eff * Anv) / (Math.sqrt(3) * gammaM1)) / 1000;
  }

  // 3. IS 8147:1976 (Working Stress) Implementation
  // Yielding: Ag * sigma_at
  const isYield = (Ag * sigma_at) / 1000;
  
  // Rupture: Aeff * sigma_at_rupture
  let isAeff = An;
  let isK = 1.0;
  if (connection === 'Bolted') {
    if (inputs.sectionType === 'Single Angle') {
      const a1 = (inputs.leg1 - thickness / 2) * thickness - (n * dh * thickness);
      const a2 = (inputs.leg2 - thickness / 2) * thickness;
      isK = (3 * a1) / (3 * a1 + a2);
      isAeff = a1 + a2 * isK;
    } else if (inputs.sectionType === 'Double Angle') {
      const a1 = 2 * ((inputs.leg1 - thickness / 2) * thickness - (n * dh * thickness));
      const a2 = 2 * (inputs.leg2 - thickness / 2) * thickness;
      isK = (5 * a1) / (5 * a1 + a2);
      isAeff = a1 + a2 * isK;
    }
  }
  const isRupture = (isAeff * sigma_at_rupture) / 1000;
  
  // Block Shear: IS 800:2007 Clause 6.4.1 implementation (since IS 8147 doesn't specify)
  // Tdb1 = (Avg * fy / (sqrt(3) * gammaM1) + 0.9 * Ant * fu / gammaM2)
  // Tdb2 = (0.9 * Anv * fu / (sqrt(3) * gammaM2) + Atg * fy / gammaM1)
  let isBlockShear = 0;
  let isTdb1 = 0;
  let isTdb2 = 0;
  if (connection === 'Bolted' && n_line > 0 && p > 0) {
    isTdb1 = ((Avg * fy_eff) / (Math.sqrt(3) * gammaM1) + (0.9 * Ant * fu_eff) / gammaM2) / 1000;
    isTdb2 = ((0.9 * Anv * fu_eff) / (Math.sqrt(3) * gammaM2) + (Atg * fy_eff) / gammaM1) / 1000;
    isBlockShear = Math.min(isTdb1, isTdb2);
  }

  // 4. Output Requirements
  const ecFinal = ecBlockShear > 0 ? Math.min(ecYield, ecRupture, ecBlockShear) : Math.min(ecYield, ecRupture);
  let ecMode = ecFinal === ecYield ? 'Yielding' : (ecFinal === ecRupture ? 'Rupture' : 'Block Shear');

  const isFinal = isBlockShear > 0 ? Math.min(isYield, isRupture, isBlockShear) : Math.min(isYield, isRupture);
  let isMode = isFinal === isYield ? 'Yielding' : (isFinal === isRupture ? 'Rupture' : 'Block Shear');

  return {
    eurocode: { yield: ecYield, rupture: ecRupture, blockShear: ecBlockShear, final: ecFinal, mode: ecMode, bsPath: 'Standard' },
    is8147: { yield: isYield, rupture: isRupture, blockShear: isBlockShear, final: isFinal, mode: isMode, bsPath: 'Standard' },
    derived: { holeDia: dh, ag: Ag, an: An, beta, aeff: Aeff, isK, isAeff, criticalAnPath: 'Standard', rupturePaths: [] },
    bsPathsList: [{
      id: 'Standard',
      description: 'Standard block shear',
      is_bs: isBlockShear,
      ec_bs: ecBlockShear
    }]
  };
}

export default function App() {
    const [activeTab, setActiveTab] = useState('calculator');
  const [paramVar, setParamVar] = useState('thickness');

  const [inputs, setInputs] = useState({
    id: 'M-01',
    sectionType: 'Plate',
    connection: 'Bolted',
    eurocodeAlloy: 'Generic/Unspecified',
    is8147Alloy: 'Generic/Unspecified',
    width: 100,
    leg1: 100,
    leg2: 100,
    thickness: 10,
    dia: 16,
    noOfHoles: 2,
    rows: 2,
    s: 50,
    g: 50,
    e: 30,
    betaMode: 'Auto',
    x: 20,
    L: 100,
    manualBeta: 0.8,
    fy: 250,
    fu: 290,
    sigma_at: 105,
    sigma_at_rupture: 105,
    tau_a: 65,
    sigmaAtMode: 'Auto',
    gammaM0: 1.1,
    gammaM1: 1.1,
    gammaM2: 1.25,
    fo: 250,
    foMode: 'Auto',
    considerHAZ: false,
    rho: 1.0,
    rho_o: 1.0,
    rho_u: 1.0,
    holePattern: 'Straight',
    stagger_p: 25,
    stagger_g: 50,
  });

  const [derived, setDerived] = useState({
    holeDia: 18,
    ag: 1000,
    an: 820,
    beta: 1.0,
    aeff: 820,
    isK: 1.0,
    isAeff: 820,
    criticalAnPath: 'Straight',
    rupturePaths: [] as any[],
  });

  const [results, setResults] = useState({
    is8147: { yield: 0, rupture: 0, blockShear: 0, final: 0, mode: '', bsPath: '' },
    eurocode: { yield: 0, rupture: 0, blockShear: 0, final: 0, mode: '', bsPath: '' },
    bsPathsList: [] as any[],
  });

  const [showFormulas, setShowFormulas] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    setInputs((prev) => {
      let parsedValue: any = value;
      if (type === 'checkbox') {
        parsedValue = (e.target as HTMLInputElement).checked;
      } else {
        parsedValue = ['id', 'sectionType', 'connection', 'holePattern', 'eurocodeAlloy', 'is8147Alloy', 'betaMode', 'sigmaAtMode', 'foMode'].includes(name) ? value : Number(value);
      }
      const newInputs = { ...prev, [name]: parsedValue };

      if (name === 'fy' && newInputs.foMode === 'Auto') {
        newInputs.fo = Number(parsedValue);
      }
      if (name === 'foMode' && parsedValue === 'Auto') {
        newInputs.fo = newInputs.fy;
      }

      if (name === 'eurocodeAlloy' || name === 'thickness' || name === 'sectionType') {
        const ecAlloyVal = name === 'eurocodeAlloy' ? parsedValue : prev.eurocodeAlloy;
        const tVal = name === 'thickness' ? parsedValue : prev.thickness;
        const sectionTypeVal = name === 'sectionType' ? parsedValue : prev.sectionType;

        const ecAlloyData = EUROCODE_ALLOYS.find(a => a.name === ecAlloyVal) || EUROCODE_ALLOYS.find(a => a.id === 'Generic/Unspecified');
        if (ecAlloyData) {
          const ecProps = ecAlloyData.getProps(tVal, sectionTypeVal);
          newInputs.fy = ecProps.fo;
          newInputs.fu = ecProps.fu;
          newInputs.rho_o = ecProps.rho_o;
          newInputs.rho_u = ecProps.rho_u;

          if (newInputs.foMode === 'Auto') newInputs.fo = newInputs.fy;
        }
      }

      if (name === 'is8147Alloy' || name === 'thickness' || name === 'sectionType') {
        const isAlloyVal = name === 'is8147Alloy' ? parsedValue : prev.is8147Alloy;
        const tVal = name === 'thickness' ? parsedValue : prev.thickness;
        const sectionTypeVal = name === 'sectionType' ? parsedValue : prev.sectionType;

        const isAlloyData = IS8147_ALLOYS.find(a => a.name === isAlloyVal) || IS8147_ALLOYS.find(a => a.id === 'Generic/Unspecified');
        if (isAlloyData && newInputs.sigmaAtMode === 'Auto') {
          const isProps = isAlloyData.getProps(tVal, sectionTypeVal);
          newInputs.sigma_at = isProps.sigma_at;
          newInputs.sigma_at_rupture = isProps.sigma_at_rupture;
        }
      }

      if (name === 'sigmaAtMode' && parsedValue === 'Auto') {
        const isAlloyData = IS8147_ALLOYS.find(a => a.name === newInputs.is8147Alloy) || IS8147_ALLOYS.find(a => a.id === 'Generic/Unspecified');
        if (isAlloyData) {
          const isProps = isAlloyData.getProps(newInputs.thickness, newInputs.sectionType);
          newInputs.sigma_at = isProps.sigma_at;
          newInputs.sigma_at_rupture = isProps.sigma_at_rupture;
        }
      }

      return newInputs;
    });
  };

  useEffect(() => {
    const results = calculateConnectionCapacities(inputs);
    setDerived(results.derived as any);
    setResults({
      is8147: results.is8147,
      eurocode: results.eurocode,
      bsPathsList: results.bsPathsList
    });
  }, [inputs]);

  const chartData = [
    { name: 'Yield', 'IS 8147': results.is8147.yield, 'Eurocode': results.eurocode.yield },
    { name: 'Rupture', 'IS 8147': results.is8147.rupture, 'Eurocode': results.eurocode.rupture },
    { name: 'Block Shear', 'IS 8147': results.is8147.blockShear, 'Eurocode': results.eurocode.blockShear },
    { name: 'Final', 'IS 8147': results.is8147.final, 'Eurocode': results.eurocode.final },
  ];

  const selectedEcAlloy = EUROCODE_ALLOYS.find(a => a.name === inputs.eurocodeAlloy);


  const generateParametricData = () => {
    const data = [];
    let minVal, maxVal, steps;

    if (paramVar === 'noOfHoles') {
      minVal = Math.max(1, inputs.noOfHoles - 5);
      maxVal = inputs.noOfHoles + 5;
      steps = maxVal - minVal;
    } else {
      const baseVal = inputs[paramVar];
      minVal = baseVal * 0.5; // -50%
      maxVal = baseVal * 1.5; // +50%
      steps = 20;
    }

    const stepSize = (maxVal - minVal) / steps;

    for (let i = 0; i <= steps; i++) {
      let val = minVal + i * stepSize;
      if (paramVar === 'noOfHoles') val = Math.round(val);

      const testInputs = { ...inputs, [paramVar]: val };

      if (paramVar === 'thickness') {
        const ecAlloyData = EUROCODE_ALLOYS.find(a => a.name === testInputs.eurocodeAlloy) || EUROCODE_ALLOYS.find(a => a.id === 'Generic/Unspecified');
        if (ecAlloyData) {
          const ecProps = ecAlloyData.getProps(val, testInputs.sectionType);
          testInputs.fy = ecProps.fo;
          testInputs.fu = ecProps.fu;
          testInputs.rho_o = ecProps.rho_o;
          testInputs.rho_u = ecProps.rho_u;
          if (testInputs.foMode === 'Auto') testInputs.fo = testInputs.fy;
        }

        const isAlloyData = IS8147_ALLOYS.find(a => a.name === testInputs.is8147Alloy) || IS8147_ALLOYS.find(a => a.id === 'Generic/Unspecified');
        if (isAlloyData && testInputs.sigmaAtMode === 'Auto') {
          const isProps = isAlloyData.getProps(val, testInputs.sectionType);
          testInputs.sigma_at = isProps.sigma_at;
          testInputs.sigma_at_rupture = isProps.sigma_at_rupture;
        }
      }

      const results = calculateConnectionCapacities(testInputs);
      data.push({
        paramValue: paramVar === 'noOfHoles' ? val : Number(val.toFixed(2)),
        Eurocode: Number(results.eurocode.final.toFixed(2)),
        IS8147: Number(results.is8147.final.toFixed(2)),
      });
    }
    return data;
  };

  const parametricData = activeTab === 'parametric' ? generateParametricData() : [];

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex items-center justify-between border-b border-neutral-300 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 flex items-center gap-3">
              <Calculator className="w-8 h-8 text-indigo-600" />
              Tension Member Design
            </h1>
            <p className="text-neutral-500 mt-2">
              Comparative analysis between IS 8147:1976 and Eurocode EN 1999
            </p>
          </div>
        </header>

        <div className="flex space-x-1 bg-neutral-200/50 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setActiveTab('calculator')} 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'calculator' ? 'bg-white text-indigo-700 shadow-sm' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'}`}
          >
            <Calculator className="w-4 h-4" />
            Calculator
          </button>
          <button 
            onClick={() => setActiveTab('parametric')} 
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'parametric' ? 'bg-white text-indigo-700 shadow-sm' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'}`}
          >
            <LineChartIcon className="w-4 h-4" />
            Parametric Analysis
          </button>
        </div>

        {activeTab === 'calculator' && (
        <div className="calculator-content">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold">Section Parameters</h2>
              </div>
              
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">ID</label>
                  <input type="text" name="id" value={inputs.id} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Section Type</label>
                  <select name="sectionType" value={inputs.sectionType} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none">
                    <option>Plate</option>
                    <option>Single Angle</option>
                    <option>Double Angle</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Connection</label>
                  <select name="connection" value={inputs.connection} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none">
                    <option>Bolted</option>
                    <option>Welded</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Hole Pattern</label>
                  <select name="holePattern" value={inputs.holePattern} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" disabled={inputs.connection === 'Welded'}>
                    <option>Straight</option>
                    <option>Staggered</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Eurocode Alloy</label>
                  <select name="eurocodeAlloy" value={inputs.eurocodeAlloy} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none">
                    {EUROCODE_ALLOYS.map(a => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">IS 8147 Alloy</label>
                  <select name="is8147Alloy" value={inputs.is8147Alloy} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none">
                    {IS8147_ALLOYS.map(a => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </div>

                {inputs.sectionType === 'Plate' ? (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-500 uppercase">Width (mm)</label>
                    <input type="number" name="width" value={inputs.width} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Leg 1 (mm)</label>
                      <input type="number" name="leg1" value={inputs.leg1} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Leg 2 (mm)</label>
                      <input type="number" name="leg2" value={inputs.leg2} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                    </div>
                  </>
                )}
                
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Thickness (mm)</label>
                  <input type="number" name="thickness" value={inputs.thickness} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                  {typeof selectedEcAlloy?.maxThickness === 'number' && (
                    <p className={`text-xs mt-1 ${inputs.thickness > (selectedEcAlloy.maxThickness as number) ? 'text-rose-600' : 'text-neutral-500'}`}>
                      EC9 thickness limit for <span className="font-medium">{inputs.eurocodeAlloy}</span>: ≤ {selectedEcAlloy.maxThickness} mm
                    </p>
                  )}
                </div>
                
                {inputs.connection === 'Bolted' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Bolt Dia d (mm)</label>
                      <input type="number" name="dia" value={inputs.dia} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Hole Dia dh (mm)</label>
                      <input type="number" value={derived.holeDia} readOnly className="w-full px-3 py-2 bg-neutral-200 border border-neutral-300 rounded-lg text-neutral-500 outline-none cursor-not-allowed" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Bolts in Cross-Section (n)</label>
                      <input type="number" name="noOfHoles" value={inputs.noOfHoles} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Bolts in Line of Force</label>
                      <input type="number" name="rows" value={inputs.rows} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Pitch s (mm)</label>
                      <input type="number" name="s" value={inputs.s} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Gauge g (mm)</label>
                      <input type="number" name="g" value={inputs.g} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Edge Dist e (mm)</label>
                      <input type="number" name="e" value={inputs.e} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                    </div>
                  </>
                )}

                {inputs.connection === 'Bolted' && inputs.holePattern === 'Staggered' && (
                  <div className="md:col-span-2 lg:col-span-3 p-4 bg-purple-50 border border-purple-200 rounded-xl mt-2 space-y-4">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-purple-800 uppercase flex items-center gap-1">
                        Staggered Geometry Parameters
                      </label>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-purple-700 uppercase">Stagger Pitch p (mm)</label>
                        <input type="number" name="stagger_p" value={inputs.stagger_p} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-purple-300 rounded-lg outline-none" />
                        <p className="text-[10px] text-purple-600 mt-1">Longitudinal distance between staggered holes.</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-purple-700 uppercase">Stagger Gauge g (mm)</label>
                        <input type="number" name="stagger_g" value={inputs.stagger_g} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-purple-300 rounded-lg outline-none" />
                        <p className="text-[10px] text-purple-600 mt-1">Transverse distance between staggered holes.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">fy (MPa) - Eurocode</label>
                  <input type="number" name="fy" value={inputs.fy} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">fu (MPa) - Eurocode</label>
                  <input type="number" name="fu" value={inputs.fu} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                </div>

                <div className="space-y-1 md:col-span-2 lg:col-span-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mt-2">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-xs font-bold text-blue-800 uppercase flex items-center gap-1">
                      Permissible Stresses - IS 8147
                    </label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="sigmaAtMode" value="Auto" checked={inputs.sigmaAtMode === 'Auto'} onChange={handleInputChange} className="w-3 h-3 text-blue-600" />
                        <span className="text-xs font-medium text-blue-800">Auto</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="sigmaAtMode" value="Manual" checked={inputs.sigmaAtMode === 'Manual'} onChange={handleInputChange} className="w-3 h-3 text-blue-600" />
                        <span className="text-xs font-medium text-blue-800">Manual</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-blue-700 uppercase">Yield (σ_at) MPa</label>
                      <input type="number" name="sigma_at" value={inputs.sigma_at} onChange={handleInputChange} readOnly={inputs.sigmaAtMode === 'Auto'} className={`w-full px-3 py-2 border border-blue-300 rounded-lg outline-none ${inputs.sigmaAtMode === 'Auto' ? 'bg-blue-100 text-blue-800 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-blue-500'}`} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-blue-700 uppercase">Rupture (σ_at_rupture) MPa</label>
                      <input type="number" name="sigma_at_rupture" value={inputs.sigma_at_rupture} onChange={handleInputChange} readOnly={inputs.sigmaAtMode === 'Auto'} className={`w-full px-3 py-2 border border-blue-300 rounded-lg outline-none ${inputs.sigmaAtMode === 'Auto' ? 'bg-blue-100 text-blue-800 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-blue-500'}`} />
                    </div>
                  </div>

                  <p className="text-[10px] text-blue-600 mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Using IS 8147 tabulated permissible stresses.
                  </p>
                  
                  {inputs.sigma_at >= inputs.fu && (
                    <p className="text-[10px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3" /> Warning: σ_at should be less than fu.
                    </p>
                  )}
                  {inputs.sigma_at_rupture >= inputs.fu && (
                    <p className="text-[10px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3" /> Warning: σ_at_rupture should be less than fu.
                    </p>
                  )}
                </div>

                <div className="space-y-1 md:col-span-2 lg:col-span-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl mt-2">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-xs font-bold text-indigo-800 uppercase flex items-center gap-1">
                      Partial Safety Factors & Parameters - Eurocode
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-indigo-700 uppercase">γM0 (Yield)</label>
                      <input type="number" step="0.01" name="gammaM0" value={inputs.gammaM0} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-indigo-700 uppercase">γM1 (Shear)</label>
                      <input type="number" step="0.01" name="gammaM1" value={inputs.gammaM1} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-indigo-700 uppercase">γM2 (Rupture)</label>
                      <input type="number" step="0.01" name="gammaM2" value={inputs.gammaM2} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs font-semibold text-indigo-700 uppercase">0.2% Proof Stress (fo) MPa</label>
                      <div className="flex gap-3">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="radio" name="foMode" value="Auto" checked={inputs.foMode === 'Auto'} onChange={handleInputChange} className="w-3 h-3 text-indigo-600" />
                          <span className="text-xs font-medium text-indigo-800">Auto (=fy)</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="radio" name="foMode" value="Manual" checked={inputs.foMode === 'Manual'} onChange={handleInputChange} className="w-3 h-3 text-indigo-600" />
                          <span className="text-xs font-medium text-indigo-800">Manual</span>
                        </label>
                      </div>
                    </div>
                    <input type="number" name="fo" value={inputs.fo} onChange={handleInputChange} readOnly={inputs.foMode === 'Auto'} className={`w-full px-3 py-2 border border-indigo-300 rounded-lg outline-none ${inputs.foMode === 'Auto' ? 'bg-indigo-100 text-indigo-800 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-indigo-500'}`} />
                    {inputs.fo > inputs.fu && (
                      <p className="text-[10px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3 h-3" /> Warning: fo should be less than or equal to fu.
                      </p>
                    )}
                  </div>
                  <p className="text-[10px] text-indigo-600 mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Block shear is computed as per Eurocode EN 1999 block tearing formulation.
                  </p>
                </div>

                <div className="space-y-1 md:col-span-2 lg:col-span-3 p-4 bg-orange-50 border border-orange-200 rounded-xl mt-2">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-xs font-bold text-orange-800 uppercase flex items-center gap-1">
                      Heat Affected Zone (HAZ) - Eurocode
                    </label>
                  </div>
                  
                  {inputs.connection === 'Bolted' ? (
                    <p className="text-sm text-orange-700 font-medium">HAZ applicable only for welded connections.</p>
                  ) : (
                    <div className="space-y-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="considerHAZ" checked={inputs.considerHAZ} onChange={handleInputChange} className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500" />
                        <span className="text-sm font-medium text-orange-900">Consider HAZ effects</span>
                      </label>
                      
                      {inputs.considerHAZ && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-orange-700 uppercase">Yield Red. ρ_o</label>
                              <input type="number" step="0.01" min="0.1" max="1.0" name="rho_o" value={inputs.rho_o} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-orange-700 uppercase">Ult. Red. ρ_u</label>
                              <input type="number" step="0.01" min="0.1" max="1.0" name="rho_u" value={inputs.rho_u} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                            </div>
                          </div>
                          
                          <div className="bg-orange-100 p-3 rounded-lg border border-orange-200">
                            <p className="text-xs font-semibold text-orange-800 mb-2">Reduced strength due to HAZ applied:</p>
                            <div className="grid grid-cols-2 gap-2 text-sm text-orange-900">
                              <div>fy: {inputs.fy} → <span className="font-bold">{(inputs.fy * inputs.rho_o).toFixed(1)}</span> MPa</div>
                              <div>fu: {inputs.fu} → <span className="font-bold">{(inputs.fu * inputs.rho_u).toFixed(1)}</span> MPa</div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-orange-600 mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> HAZ reduces strength in welded aluminium connections.
                  </p>
                </div>

                <div className="space-y-1 md:col-span-2 lg:col-span-3 p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl mt-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
                        Gross Area (Ag) mm²
                      </label>
                      <input type="number" value={derived.ag.toFixed(2)} readOnly className="w-full px-3 py-2 bg-emerald-100 border-2 border-emerald-300 rounded-lg text-emerald-900 outline-none font-mono text-lg cursor-not-allowed" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
                        Net Area (An) mm²
                      </label>
                      <input type="number" value={derived.an.toFixed(2)} readOnly className="w-full px-3 py-2 bg-emerald-100 border-2 border-emerald-300 rounded-lg text-emerald-900 outline-none font-mono text-lg cursor-not-allowed" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
                        Effective Area (Aeff) mm²
                      </label>
                      <input type="number" value={derived.aeff.toFixed(2)} readOnly className="w-full px-3 py-2 bg-emerald-100 border-2 border-emerald-300 rounded-lg text-emerald-900 outline-none font-mono text-lg cursor-not-allowed" />
                    </div>
                  </div>
                  
                  {inputs.holePattern === 'Staggered' && inputs.connection === 'Bolted' && (
                    <div className="mt-4 p-3 bg-emerald-100/50 rounded-lg border border-emerald-200">
                      <h4 className="text-xs font-bold text-emerald-800 uppercase mb-2">Governing Paths</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm text-emerald-900 mb-4">
                        <div><span className="font-semibold">Rupture:</span> {derived.criticalAnPath}</div>
                        <div><span className="font-semibold">Block Shear (EC):</span> {results.eurocode.bsPath || 'N/A'}</div>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <h5 className="text-[11px] font-bold text-emerald-700 uppercase mb-1">Candidate Rupture Paths</h5>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-emerald-900">
                              <thead className="bg-emerald-200/50 text-emerald-800">
                                <tr>
                                  <th className="px-2 py-1 rounded-tl-md">Path</th>
                                  <th className="px-2 py-1">Description</th>
                                  <th className="px-2 py-1 rounded-tr-md text-right">An (mm²)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-emerald-200/50">
                                {derived.rupturePaths.map((p, i) => (
                                  <tr key={i} className={p.id === derived.criticalAnPath ? 'bg-emerald-200/50 font-semibold' : ''}>
                                    <td className="px-2 py-1">{p.id}</td>
                                    <td className="px-2 py-1">{p.description}</td>
                                    <td className="px-2 py-1 text-right">{p.an.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {results.bsPathsList.length > 0 && (
                          <div>
                            <h5 className="text-[11px] font-bold text-emerald-700 uppercase mb-1">Candidate Block Shear Paths</h5>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs text-emerald-900">
                                <thead className="bg-emerald-200/50 text-emerald-800">
                                  <tr>
                                    <th className="px-2 py-1 rounded-tl-md">Path</th>
                                    <th className="px-2 py-1">Description</th>
                                    <th className="px-2 py-1 text-right">IS 8147 (kN)</th>
                                    <th className="px-2 py-1 rounded-tr-md text-right">Eurocode (kN)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-emerald-200/50">
                                  {results.bsPathsList.map((p, i) => (
                                    <tr key={i} className={p.id === results.eurocode.bsPath ? 'bg-emerald-200/50 font-semibold' : ''}>
                                      <td className="px-2 py-1">{p.id}</td>
                                      <td className="px-2 py-1">{p.description}</td>
                                      <td className="px-2 py-1 text-right">{p.is_bs.toFixed(2)}</td>
                                      <td className="px-2 py-1 text-right">{p.ec_bs.toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <p className="text-[10px] text-emerald-700 mt-3">
                        * Critical zig-zag path governs net section rupture and block shear if selected.
                      </p>
                    </div>
                  )}
                </div>

              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200">
                <h2 className="text-lg font-semibold">Shear Lag Factor (β)</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="betaMode" value="Auto" checked={inputs.betaMode === 'Auto'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-medium">Auto Calculate</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="betaMode" value="Manual" checked={inputs.betaMode === 'Manual'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-medium">Manual Override</span>
                  </label>
                </div>

                {inputs.betaMode === 'Auto' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Eccentricity x (mm)</label>
                      <input type="number" name="x" value={inputs.x} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Connection Length L (mm)</label>
                      <input type="number" name="L" value={inputs.L} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-500 uppercase">Manual β (0.7 - 1.0)</label>
                    <input type="number" step="0.01" min="0.7" max="1.0" name="manualBeta" value={inputs.manualBeta} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                  </div>
                )}

                <div className="space-y-1 pt-4 border-t border-neutral-100">
                  <label className="text-xs font-bold text-indigo-800 uppercase flex justify-between">
                    <span>Final Beta (β)</span>
                    {derived.beta === 1.0 && <span className="text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Shear lag ignored</span>}
                  </label>
                  <input type="number" value={derived.beta.toFixed(3)} readOnly className="w-full px-3 py-2 bg-indigo-50 border-2 border-indigo-200 rounded-lg font-mono text-lg text-indigo-900 outline-none cursor-not-allowed" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-indigo-800 uppercase">Effective Area (Aeff) mm²</label>
                  <input type="number" value={derived.aeff.toFixed(2)} readOnly className="w-full px-3 py-2 bg-indigo-50 border-2 border-indigo-200 rounded-lg font-mono text-lg text-indigo-900 outline-none cursor-not-allowed" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              <button 
                onClick={() => setShowFormulas(!showFormulas)}
                className="w-full bg-neutral-50 px-6 py-4 border-b border-neutral-200 flex justify-between items-center hover:bg-neutral-100 transition-colors"
              >
                <h2 className="text-lg font-semibold">Formulas Used</h2>
                {showFormulas ? <ChevronUp className="w-5 h-5 text-neutral-500" /> : <ChevronDown className="w-5 h-5 text-neutral-500" />}
              </button>
              
              {showFormulas && (
                <div className="p-6 space-y-6 text-sm text-neutral-700 bg-neutral-50">
                  <div>
                    <h3 className="font-bold text-neutral-900 mb-2">IS 8147:1976 (Working Stress)</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Yield:</strong> P_y = σ_at × Ag</li>
                      <li><strong>Rupture:</strong> P_u = σ_at_rupture × An</li>
                      <li className="text-blue-700">Note: σ_at and σ_at_rupture are tabulated permissible stresses.</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-900 mb-2">Eurocode EN 1999 (Limit State)</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Yield:</strong> N_pl,Rd = (Ag × fy) / γM0</li>
                      <li><strong>Rupture:</strong> N_u,Rd = (0.9 × fu × Aeff) / γM2</li>
                      <li><strong>Effective Area:</strong> Aeff = β × An</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-900 mb-2">Block Shear</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>IS 8147 (Adopted from IS 800:2007):</strong> min[ (Avg × fy)/(√3 × {inputs.gammaM1}) + (0.9 × Ant × fu)/{inputs.gammaM2}, (0.9 × Anv × fu)/(√3 × {inputs.gammaM2}) + (Atg × fy)/{inputs.gammaM1} ]</li>
                      <li><strong>Eurocode (Limit State):</strong> Veff,Rd = (fu × Ant) / γM2 + (fy × Anv) / (√3 × γM1)</li>
                      <li className="text-amber-700">Note: IS 8147 does not explicitly define block shear. The IS 800:2007 limit state approach is adopted as requested.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

          </div>

          <div className="lg:col-span-5 space-y-6">
            
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden p-6">
              <h2 className="text-lg font-semibold mb-4">Strength Comparison</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                    <XAxis dataKey="name" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: '#f5f5f5'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                    <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
                    <Bar dataKey="IS 8147" fill="#334155" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="Eurocode" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`bg-white rounded-2xl shadow-sm border ${results.is8147.final <= results.eurocode.final ? 'border-rose-300 ring-1 ring-rose-300' : 'border-neutral-200'} overflow-hidden`}>
              <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white">IS 8147 : 1976</h2>
                <span className="text-xs font-medium bg-slate-700 text-slate-300 px-2 py-1 rounded-full">Working Stress</span>
              </div>
              <div className="p-6 space-y-4">
                <ResultRow label="Yield Strength" value={results.is8147.yield} unit="kN" isMin={results.is8147.yield === results.is8147.final} />
                <ResultRow label="Rupture Strength" value={results.is8147.rupture} unit="kN" isMin={results.is8147.rupture === results.is8147.final} />
                <div className="flex justify-between items-center group relative">
                  <span className="text-sm font-medium text-neutral-600 flex items-center gap-1">
                    Block Shear <Info className="w-3 h-3 text-neutral-400" />
                  </span>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-neutral-800 text-white text-xs rounded shadow-lg z-10">
                    IS 8147 does not explicitly define block shear. Assumed from IS 800.
                  </div>
                  {results.is8147.blockShear === 0 ? (
                    <span className="text-sm font-mono text-neutral-400">N/A</span>
                  ) : (
                    <span className={`text-base font-mono font-medium ${results.is8147.blockShear === results.is8147.final ? 'text-rose-600 font-bold' : 'text-neutral-900'}`}>
                      {results.is8147.blockShear.toFixed(2)} <span className="text-xs text-neutral-500">kN</span>
                    </span>
                  )}
                </div>
                
                <div className="pt-4 mt-4 border-t border-neutral-200">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase">Final Strength</p>
                      <p className="text-3xl font-light tracking-tight text-neutral-900">
                        {results.is8147.final.toFixed(2)} <span className="text-lg text-neutral-500">kN</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-neutral-500 uppercase">Governing Mode</p>
                      <p className="text-sm font-medium text-rose-600 flex items-center gap-1 justify-end">
                        <AlertCircle className="w-4 h-4" />
                        {results.is8147.mode}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={`bg-white rounded-2xl shadow-sm border ${results.eurocode.final < results.is8147.final ? 'border-rose-300 ring-1 ring-rose-300' : 'border-neutral-200'} overflow-hidden`}>
              <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white">Eurocode EN 1999</h2>
                <span className="text-xs font-medium bg-indigo-500 text-indigo-100 px-2 py-1 rounded-full">Limit State</span>
              </div>
              <div className="p-6 space-y-4">
                <ResultRow label="Yield Strength (Npl,Rd)" value={results.eurocode.yield} unit="kN" isMin={results.eurocode.yield === results.eurocode.final} />
                <ResultRow label="Rupture Strength (Nu,Rd)" value={results.eurocode.rupture} unit="kN" isMin={results.eurocode.rupture === results.eurocode.final} />
                <ResultRow label="Block Shear" value={results.eurocode.blockShear} unit="kN" isMin={results.eurocode.blockShear > 0 && results.eurocode.blockShear === results.eurocode.final} fallback="N/A" muted={results.eurocode.blockShear === 0} />
                
                <div className="pt-4 mt-4 border-t border-neutral-200">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase">Final Strength</p>
                      <p className="text-3xl font-light tracking-tight text-indigo-900">
                        {results.eurocode.final.toFixed(2)} <span className="text-lg text-indigo-500">kN</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-neutral-500 uppercase">Governing Mode</p>
                      <p className="text-sm font-medium text-rose-600 flex items-center gap-1 justify-end">
                        <AlertCircle className="w-4 h-4" />
                        {results.eurocode.mode}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Calculation Report & References */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden mt-8">
          <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              Calculation Report & References
            </h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-indigo-700 border-b pb-2">Eurocode EN 1999-1-1:2007</h3>
              <ul className="space-y-3 text-sm text-neutral-700">
                <li className="flex flex-col">
                  <span className="font-medium text-neutral-900">Yielding (N_pl,Rd)</span>
                  <span className="text-neutral-500 text-xs mt-1">Clause 6.2.3 (2) a</span>
                  <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">N_pl,Rd = (Ag * fy) / γM0</span>
                </li>
                <li className="flex flex-col">
                  <span className="font-medium text-neutral-900">Rupture (N_u,Rd)</span>
                  <span className="text-neutral-500 text-xs mt-1">Clause 6.2.3 (2) b</span>
                  <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">N_u,Rd = (0.9 × Aeff × fu) / γM2</span>
                  <span className="text-xs text-neutral-500 mt-1">Where Aeff = An * β (Shear lag factor β = {derived.beta})</span>
                </li>
                {inputs.connection === 'Bolted' && (
                  <li className="flex flex-col">
                    <span className="font-medium text-neutral-900">Block Tearing (V_eff,Rd)</span>
                    <span className="text-neutral-500 text-xs mt-1">Clause 8.5.6 (2)</span>
                    <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">V_eff,Rd = (fu * Ant) / γM2 + (fy * Anv) / (√3 * γM1)</span>
                  </li>
                )}
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-emerald-700 border-b pb-2">IS 8147:1976</h3>
              <ul className="space-y-3 text-sm text-neutral-700">
                <li className="flex flex-col">
                  <span className="font-medium text-neutral-900">Axial Tension (Yielding)</span>
                  <span className="text-neutral-500 text-xs mt-1">Clause 5.1.1</span>
                  <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">P = Ag * σ_at</span>
                </li>
                <li className="flex flex-col">
                  <span className="font-medium text-neutral-900">Axial Tension (Rupture)</span>
                  <span className="text-neutral-500 text-xs mt-1">Clause 5.1.2</span>
                  <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">P = Aeff * σ_at_rupture</span>
                  {inputs.connection === 'Bolted' && inputs.sectionType !== 'Plate' && (
                    <span className="text-xs text-neutral-500 mt-1">
                      Where Aeff = a1 + a2 * k (k = {derived.isK.toFixed(3)})
                    </span>
                  )}
                </li>
                {inputs.connection === 'Bolted' && (
                  <li className="flex flex-col">
                    <span className="font-medium text-neutral-900">Block Shear</span>
                    <span className="text-neutral-500 text-xs mt-1">IS 800:2007 Clause 6.4.1 (Adopted)</span>
                    <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">T_db1 = (Avg * fy) / (√3 * {inputs.gammaM1}) + (0.9 * Ant * fu) / {inputs.gammaM2}</span>
                    <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">T_db2 = (0.9 * Anv * fu) / (√3 * {inputs.gammaM2}) + (Atg * fy) / {inputs.gammaM1}</span>
                    <span className="text-xs text-neutral-500 mt-1">T_db = min(T_db1, T_db2)</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>


        </div>
        )}

        {activeTab === 'parametric' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-indigo-600" />
                    Parametric Study
                  </h2>
                  <p className="text-sm text-neutral-500 mt-1">Analyze how connection capacity changes with varying parameters.</p>
                </div>
                <div className="flex items-center gap-3 bg-neutral-50 p-2 rounded-lg border border-neutral-200">
                  <label className="text-sm font-medium text-neutral-700">Vary Parameter:</label>
                  <select 
                    value={paramVar} 
                    onChange={(e) => setParamVar(e.target.value)}
                    className="bg-white border border-neutral-300 text-neutral-900 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none"
                  >
                    <option value="thickness">Thickness (t)</option>
                    <option value="width">Width (w)</option>
                    <option value="dia">Bolt Diameter (d)</option>
                    <option value="noOfHoles">Number of Bolts (n)</option>
                  </select>
                </div>
              </div>

              <div className="h-[500px] w-full mt-8">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={parametricData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                    <XAxis 
                      dataKey="paramValue" 
                      label={{ value: paramVar === 'thickness' ? 'Thickness (mm)' : paramVar === 'width' ? 'Width (mm)' : paramVar === 'dia' ? 'Bolt Diameter (mm)' : 'Number of Bolts', position: 'insideBottom', offset: -10 }} 
                      tick={{ fill: '#6b7280' }}
                      tickMargin={10}
                    />
                    <YAxis 
                      label={{ value: 'Capacity (kN)', angle: -90, position: 'insideLeft', offset: -10 }} 
                      tick={{ fill: '#6b7280' }}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                      formatter={(value) => [`${value} kN`]}
                      labelFormatter={(label) => `${paramVar === 'thickness' ? 'Thickness' : paramVar === 'width' ? 'Width' : paramVar === 'dia' ? 'Diameter' : 'Bolts'}: ${label}`}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line type="monotone" dataKey="Eurocode" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} name="Eurocode EN 1999" />
                    <Line type="monotone" dataKey="IS8147" stroke="#e11d48" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} name="IS 8147:1976" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-6 bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <h3 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Analysis Insights
                </h3>
                <p className="text-sm text-indigo-800">
                  This graph displays the governing design capacity (minimum of Yield, Rupture, and Block Shear) for both standards as the selected parameter varies from -50% to +50% of its current value ({inputs[paramVar]}). 
                  {paramVar === 'thickness' && " Note that changing thickness may also alter the material properties (fy, fu, permissible stresses) based on the selected alloys' specifications."}
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function ResultRow({ label, value, unit, muted = false, fallback = '', isMin = false }: { label: string, value: number, unit: string, muted?: boolean, fallback?: string, isMin?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm font-medium text-neutral-600">{label}</span>
      {muted && value === 0 ? (
        <span className="text-sm font-mono text-neutral-400">{fallback}</span>
      ) : (
        <span className={`text-base font-mono font-medium ${isMin ? 'text-rose-600 font-bold' : 'text-neutral-900'}`}>
          {value.toFixed(2)} <span className="text-xs text-neutral-500">{unit}</span>
        </span>
      )}
    </div>
  );
}
