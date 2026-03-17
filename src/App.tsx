import React, { useState, useEffect } from 'react';
import { Calculator, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const is8147Yield = (ag: number, sigma_at: number) => {
  return (sigma_at * ag) / 1000;
};

const is8147Rupture = (an: number, sigma_at_rupture: number) => {
  return (sigma_at_rupture * an) / 1000;
};

const is8147BlockShear = (sigma_at: number, agv: number, anv: number, agt: number, ant: number) => {
  if (agv <= 0 || anv <= 0 || agt <= 0 || ant <= 0) return 0;
  const tau_a = 0.6 * sigma_at; // Permissible shear stress
  const bs1 = (tau_a * agv) + (sigma_at * ant);
  const bs2 = (tau_a * anv) + (sigma_at * agt);
  return Math.min(bs1, bs2) / 1000;
};

const euroYield = (ag: number, fy: number, gammaM0: number) => {
  return (ag * fy) / gammaM0 / 1000;
};

const euroRupture = (aeff: number, fu: number, gammaM2: number) => {
  return (0.9 * fu * aeff) / gammaM2 / 1000;
};

const eurocodeBlockShear = (fu: number, fo: number, Ant: number, Agv: number, Anv: number, gammaM1: number, gammaM2: number) => {
  if (Agv <= 0 || Anv <= 0 || Ant <= 0) return 0;
  const shearTerm = Math.min(
    (fo * Agv) / (Math.sqrt(3) * gammaM1),
    (fu * Anv) / (Math.sqrt(3) * gammaM2)
  );
  const tensionTerm = (fu * Ant) / gammaM2;
  return (tensionTerm + shearTerm) / 1000;
};

interface NetAreaPath { id: string; an: number; description: string; }
interface BlockShearPath { id: string; agv: number; anv: number; agt: number; ant: number; description: string; }

const getGrossArea = (inputs: any) => {
  let ag = 0;
  if (inputs.sectionType === 'Plate') {
    ag = Math.max(0, inputs.width * inputs.thickness);
  } else if (inputs.sectionType === 'Single Angle') {
    ag = Math.max(0, (inputs.leg1 + inputs.leg2 - inputs.thickness) * inputs.thickness);
  } else if (inputs.sectionType === 'Double Angle') {
    ag = Math.max(0, 2 * (inputs.leg1 + inputs.leg2 - inputs.thickness) * inputs.thickness);
  }
  return ag;
};

const getStraightNetArea = (inputs: any, holeDia: number, ag: number) => {
  let multiplier = inputs.sectionType === 'Double Angle' ? 2 : 1;
  let holesArea = inputs.connection === 'Welded' ? 0 : (inputs.noOfHoles * holeDia * inputs.thickness * multiplier);
  return Math.max(0, ag - holesArea);
};

const getStaggeredRupturePaths = (inputs: any, holeDia: number, ag: number): NetAreaPath[] => {
  const paths: NetAreaPath[] = [];
  paths.push({
    id: 'Path R1',
    description: 'Straight cross-section',
    an: getStraightNetArea(inputs, holeDia, ag)
  });

  if (inputs.connection === 'Bolted' && inputs.holePattern === 'Staggered') {
    let multiplier = inputs.sectionType === 'Double Angle' ? 2 : 1;
    const p = inputs.stagger_p;
    const g = Math.max(0.001, inputs.stagger_g);
    const t = inputs.thickness;

    const n_holes = inputs.noOfHoles + 1;
    const n_staggers = inputs.noOfHoles;
    
    const staggerAddition = n_staggers * (Math.pow(p, 2) / (4 * g)) * t * multiplier;
    const holesDeduction = n_holes * holeDia * t * multiplier;
    
    paths.push({
      id: 'Path R2',
      description: `Zig-zag (${n_holes} holes, ${n_staggers} staggers)`,
      an: Math.max(0, ag - holesDeduction + staggerAddition)
    });
  }
  return paths;
};

const getCriticalNetArea = (paths: NetAreaPath[]) => {
  let minAn = Infinity;
  let criticalPath = paths[0];
  paths.forEach(p => {
    if (p.an < minAn) {
      minAn = p.an;
      criticalPath = p;
    }
  });
  return criticalPath;
};

const getBlockPaths = (inputs: any, holeDia: number): BlockShearPath[] => {
  const paths: BlockShearPath[] = [];
  if (inputs.connection !== 'Bolted' || inputs.s <= 0 || inputs.rows <= 0) return paths;

  let multiplier = inputs.sectionType === 'Double Angle' ? 2 : 1;
  const t = inputs.thickness;

  // Path B1: Straight
  const anv1 = Math.max(0, ((inputs.rows - 1) * inputs.s + inputs.e - (inputs.rows - 0.5) * holeDia) * t) * multiplier;
  const ant1 = Math.max(0, (inputs.g - 0.5 * holeDia) * t) * multiplier;
  const agv1 = Math.max(0, ((inputs.rows - 1) * inputs.s + inputs.e) * t) * multiplier;
  const agt1 = Math.max(0, inputs.g * t) * multiplier;

  paths.push({
    id: 'Path B1',
    description: 'Straight block shear',
    agv: agv1, anv: anv1, agt: agt1, ant: ant1
  });

  // Path B2: Staggered
  if (inputs.holePattern === 'Staggered') {
    const p = inputs.stagger_p;
    const g = Math.max(0.001, inputs.stagger_g);
    
    const agv2 = agv1;
    const anv2 = anv1;
    const agt2 = Math.max(0, inputs.g * t) * multiplier;
    
    const staggerAddition = 1 * (Math.pow(p, 2) / (4 * g)) * t * multiplier;
    const ant2 = Math.max(0, agt2 - (1.5 * holeDia * t * multiplier) + staggerAddition);

    paths.push({
      id: 'Path B2',
      description: 'Staggered block shear (zig-zag tension)',
      agv: agv2, anv: anv2, agt: agt2, ant: ant2
    });
  }

  return paths;
};

const getCriticalISBlockShear = (paths: BlockShearPath[], sigma_at: number) => {
  let minBs = Infinity;
  let criticalPath: any = null;
  paths.forEach(p => {
    const bs = is8147BlockShear(sigma_at, p.agv, p.anv, p.agt, p.ant);
    if (bs > 0 && bs < minBs) {
      minBs = bs;
      criticalPath = { ...p, bs };
    }
  });
  return criticalPath;
};

const getCriticalEuroBlockTearing = (paths: BlockShearPath[], fu: number, fo: number, gammaM1: number, gammaM2: number) => {
  let minBs = Infinity;
  let criticalPath: any = null;
  paths.forEach(p => {
    const bs = eurocodeBlockShear(fu, fo, p.ant, p.agv, p.anv, gammaM1, gammaM2);
    if (bs > 0 && bs < minBs) {
      minBs = bs;
      criticalPath = { ...p, bs };
    }
  });
  return criticalPath;
};

export default function App() {
  const [inputs, setInputs] = useState({
    id: 'M-01',
    sectionType: 'Plate',
    connection: 'Bolted',
    alloy: 'Generic/Unspecified',
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
    fu: 410,
    sigma_at: 105,
    sigma_at_rupture: 205,
    sigmaAtMode: 'Auto',
    gammaM0: 1.1,
    gammaM1: 1.1,
    gammaM2: 1.25,
    fo: 250,
    foMode: 'Auto',
    considerHAZ: false,
    rho: 1.0,
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
    criticalAnPath: 'Straight',
    rupturePaths: [] as NetAreaPath[],
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
        parsedValue = ['id', 'sectionType', 'connection', 'holePattern', 'alloy', 'betaMode', 'sigmaAtMode', 'foMode'].includes(name) ? value : Number(value);
      }
      const newInputs = { ...prev, [name]: parsedValue };

      if (name === 'fy' && newInputs.foMode === 'Auto') {
        newInputs.fo = Number(parsedValue);
      }
      if (name === 'foMode' && parsedValue === 'Auto') {
        newInputs.fo = newInputs.fy;
      }

      if (name === 'alloy') {
        if (parsedValue === '6061-T6') {
          newInputs.fy = 250;
          newInputs.fu = 310;
          if (newInputs.foMode === 'Auto') newInputs.fo = 250;
          if (newInputs.sigmaAtMode === 'Auto') {
            newInputs.sigma_at = 150;
            newInputs.sigma_at_rupture = 155;
          }
        } else if (parsedValue === '6063-T6') {
          newInputs.fy = 160;
          newInputs.fu = 190;
          if (newInputs.foMode === 'Auto') newInputs.fo = 160;
          if (newInputs.sigmaAtMode === 'Auto') {
            newInputs.sigma_at = 95;
            newInputs.sigma_at_rupture = 95;
          }
        } else if (parsedValue === 'HE30-WP') {
          newInputs.fy = 250;
          newInputs.fu = 410;
          if (newInputs.foMode === 'Auto') newInputs.fo = 250;
          if (newInputs.sigmaAtMode === 'Auto') {
            newInputs.sigma_at = 105;
            newInputs.sigma_at_rupture = 205;
          }
        }
      }

      if (name === 'sigmaAtMode' && parsedValue === 'Auto') {
        if (newInputs.alloy === '6061-T6') {
          newInputs.sigma_at = 150;
          newInputs.sigma_at_rupture = 155;
        } else if (newInputs.alloy === '6063-T6') {
          newInputs.sigma_at = 95;
          newInputs.sigma_at_rupture = 95;
        } else if (newInputs.alloy === 'HE30-WP') {
          newInputs.sigma_at = 105;
          newInputs.sigma_at_rupture = 205;
        }
      }

      return newInputs;
    });
  };

  useEffect(() => {
    // Derived Geometry
    const holeDia = inputs.dia + 2;
    const ag = getGrossArea(inputs);
    
    // Net Area Calculation
    const anPaths = getStaggeredRupturePaths(inputs, holeDia, ag);
    const criticalAn = getCriticalNetArea(anPaths);
    const an = criticalAn ? criticalAn.an : 0;
    const criticalAnPath = criticalAn ? criticalAn.id : '';

    // Shear Lag Factor (Beta)
    let beta = 1.0;
    if (inputs.betaMode === 'Auto') {
      if (inputs.L > 0) {
        beta = Math.max(0.7, Math.min(1.0, 1 - (inputs.x / inputs.L)));
      }
    } else {
      beta = Math.max(0.7, Math.min(1.0, inputs.manualBeta));
    }

    // Effective Area
    const aeff = Math.max(0, beta * an);

    setDerived({ holeDia, ag, an, beta, aeff, criticalAnPath, rupturePaths: anPaths });
  }, [inputs]);

  useEffect(() => {
    calculateResults();
  }, [derived, inputs]);

  const calculateResults = () => {
    const { ag, an, aeff, beta, holeDia } = derived;
    const { fy, fu, fo, alloy, connection, s, g, e, thickness, rows, sigma_at, sigma_at_rupture, gammaM0, gammaM1, gammaM2, sectionType, considerHAZ, rho } = inputs;

    // Apply HAZ for Eurocode if applicable
    let fy_eff = fy;
    let fu_eff = fu;
    let fo_eff = fo;

    if (connection === 'Welded' && considerHAZ) {
      fy_eff = fy * rho;
      fu_eff = fu * rho;
      fo_eff = fo * rho;
    }

    // IS 8147 Calculations
    const is_yield = is8147Yield(ag, sigma_at);
    const is_rupture = is8147Rupture(an, sigma_at_rupture);
    
    // Eurocode Calculations
    const ec_yield = euroYield(ag, fy_eff, gammaM0);
    const ec_rupture = euroRupture(aeff, fu_eff, gammaM2);

    // Block Shear Calculation
    let is_bs = 0;
    let ec_bs = 0;
    let is_bs_path = '';
    let ec_bs_path = '';
    let bsPathsList: any[] = [];

    if (connection === 'Bolted' && s > 0 && rows > 0) {
      const bsPaths = getBlockPaths(inputs, holeDia);
      
      const critIS = getCriticalISBlockShear(bsPaths, sigma_at);
      if (critIS) {
        is_bs = critIS.bs;
        is_bs_path = critIS.id;
      }

      const critEC = getCriticalEuroBlockTearing(bsPaths, fu_eff, fo_eff, gammaM1, gammaM2);
      if (critEC) {
        ec_bs = critEC.bs;
        ec_bs_path = critEC.id;
      }

      bsPathsList = bsPaths.map(p => ({
        id: p.id,
        description: p.description,
        is_bs: is8147BlockShear(sigma_at, p.agv, p.anv, p.agt, p.ant),
        ec_bs: eurocodeBlockShear(fu_eff, fo_eff, p.ant, p.agv, p.anv, gammaM1, gammaM2)
      }));
    }

    // Final Capacities
    const is_final = is_bs > 0 ? Math.min(is_yield, is_rupture, is_bs) : Math.min(is_yield, is_rupture);
    let is_mode = is_yield < is_rupture ? 'Yielding' : 'Rupture';
    if (is_bs > 0 && is_bs < Math.min(is_yield, is_rupture)) is_mode = 'Block Shear';

    const ec_final = ec_bs > 0 ? Math.min(ec_yield, ec_rupture, ec_bs) : Math.min(ec_yield, ec_rupture);
    let ec_mode = ec_yield < ec_rupture ? 'Yielding' : 'Rupture';
    if (ec_bs > 0 && ec_bs < Math.min(ec_yield, ec_rupture)) ec_mode = 'Block Shear';

    setResults({
      is8147: { yield: is_yield, rupture: is_rupture, blockShear: is_bs, final: is_final, mode: is_mode, bsPath: is_bs_path },
      eurocode: { yield: ec_yield, rupture: ec_rupture, blockShear: ec_bs, final: ec_final, mode: ec_mode, bsPath: ec_bs_path },
      bsPathsList
    });
  };

  const chartData = [
    { name: 'Yield', 'IS 8147': results.is8147.yield, 'Eurocode': results.eurocode.yield },
    { name: 'Rupture', 'IS 8147': results.is8147.rupture, 'Eurocode': results.eurocode.rupture },
    { name: 'Block Shear', 'IS 8147': results.is8147.blockShear, 'Eurocode': results.eurocode.blockShear },
    { name: 'Final', 'IS 8147': results.is8147.final, 'Eurocode': results.eurocode.final },
  ];

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
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Alloy</label>
                  <select name="alloy" value={inputs.alloy} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none">
                    <option>Generic/Unspecified</option>
                    <option>6061-T6</option>
                    <option>6063-T6</option>
                    <option>HE30-WP</option>
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
                  <label className="text-xs font-semibold text-neutral-500 uppercase">fu (MPa)</label>
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
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-orange-700 uppercase">Reduction Factor ρ (0.6 - 1.0)</label>
                            <input type="number" step="0.01" min="0.6" max="1.0" name="rho" value={inputs.rho} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                            {(inputs.rho < 0.6 || inputs.rho > 1.0) && (
                              <p className="text-[10px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                                <AlertCircle className="w-3 h-3" /> Warning: ρ should be between 0.6 and 1.0.
                              </p>
                            )}
                          </div>
                          
                          <div className="bg-orange-100 p-3 rounded-lg border border-orange-200">
                            <p className="text-xs font-semibold text-orange-800 mb-2">Reduced strength due to HAZ applied:</p>
                            <div className="grid grid-cols-2 gap-2 text-sm text-orange-900">
                              <div>fy: {inputs.fy} → <span className="font-bold">{(inputs.fy * inputs.rho).toFixed(1)}</span> MPa</div>
                              <div>fu: {inputs.fu} → <span className="font-bold">{(inputs.fu * inputs.rho).toFixed(1)}</span> MPa</div>
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
                      <li><strong>IS 8147 (Permissible Stress):</strong> min[ (0.6σ_at × Agv + σ_at × Ant), (0.6σ_at × Anv + σ_at × Agt) ]</li>
                      <li><strong>Eurocode (Limit State):</strong> Veff,Rd = (fu × Ant) / γM2 + min[ (fo × Agv) / (√3 × γM1), (fu × Anv) / (√3 × γM2) ]</li>
                      <li className="text-amber-700">Note: IS 8147 does not explicitly define block shear. The permissible stress approach is assumed for comparison.</li>
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
