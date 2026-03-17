import React, { useState, useEffect } from 'react';
import { Calculator, AlertCircle, Info, Flame } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function App() {
  const [inputs, setInputs] = useState({
    id: 'M-01',
    sectionType: 'Plates',
    connection: 'Bolted',
    width: 100,
    thickness: 10,
    dia: 16,
    ag: 1000,
    holeDia: 18,
    noOfHoles: 2,
    s: 50,
    g: 50,
    an: 820,
    beta: 1.0,
    rho: 1.0,
    aeff: 820,
    fy: 250,
    fu: 410,
    includeHaz: false,
    hazFactor: 0.8, // Default HAZ reduction factor
  });

  const [results, setResults] = useState({
    is8147: { yield: 0, rupture: 0, blockShear: 0, final: 0, mode: '' },
    eurocode: { yield: 0, rupture: 0, blockShear: 0, final: 0, mode: '' },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setInputs((prev) => ({ ...prev, [name]: checked }));
    } else {
      setInputs((prev) => {
        const parsedValue = ['id', 'sectionType', 'connection'].includes(name) ? value : Number(value);
        const newInputs = { ...prev, [name]: parsedValue };

        if (name === 'sectionType') {
          if (parsedValue === 'Built-up Sections') {
            newInputs.connection = 'Welded';
            newInputs.includeHaz = true;
            newInputs.hazFactor = 0.75;
          } else if (parsedValue === 'Hollow Sections') {
            newInputs.includeHaz = false;
          }
        }

        if (name === 'connection' && parsedValue !== 'Welded') {
          newInputs.includeHaz = false;
        }

        return newInputs;
      });
    }
  };

  useEffect(() => {
    // Auto-calculate Beta and Rho based on Eurocode principles (simplified)
    let calculatedBeta = 1.0;
    let calculatedRho = 1.0;

    if (inputs.sectionType === 'Single Angles' || inputs.sectionType === 'Double Angles') {
      // Simplified adaptive beta for outstanding legs
      calculatedBeta = Math.max(0.6, Math.min(1.0, 1.2 - 0.005 * inputs.width)); 
    }

    if (inputs.connection === 'Welded' && inputs.includeHaz) {
      // Continuous gradient profile for HAZ (simplified)
      calculatedRho = inputs.hazFactor;
    }

    setInputs((prev) => ({
      ...prev,
      beta: parseFloat(calculatedBeta.toFixed(2)),
      rho: parseFloat(calculatedRho.toFixed(2)),
    }));
  }, [inputs.sectionType, inputs.connection, inputs.width, inputs.includeHaz, inputs.hazFactor]);

  useEffect(() => {
    calculateResults();
  }, [inputs]);

  const calculateResults = () => {
    const { ag, an, fy, fu, connection, s, g, thickness, noOfHoles, holeDia, beta, rho, includeHaz } = inputs;

    // Calculate effective area based on Beta and Rho
    let calculatedAeff = an;
    if (connection === 'Welded') {
      calculatedAeff = ag * rho; // HAZ affects gross area in welded connections
    } else if (['Single Angles', 'Double Angles'].includes(inputs.sectionType)) {
      calculatedAeff = an * beta; // Shear lag affects net area in bolted angles
    }
    
    // Update Aeff in state if it changed
    if (calculatedAeff !== inputs.aeff) {
      setInputs(prev => ({ ...prev, aeff: parseFloat(calculatedAeff.toFixed(2)) }));
    }

    // IS 8147:1976 Calculations
    const pt = 0.6 * fy;
    
    // Yielding of Gross Section
    const is_yield = (ag * pt) / 1000; 
    
    // Rupture of Net Section
    let is_rupture = (an * pt) / 1000;
    
    // IS 8147 HAZ consideration (crude 25mm step-function approximation)
    if (connection === 'Welded' && includeHaz) {
       // Simplified representation of IS 8147 HAZ reduction
       is_rupture = is_rupture * 0.85; 
    }
    
    // Block Shear (Not specified in IS 8147)
    const is_blockShear = 0; 
    
    const is_final = Math.min(is_yield, is_rupture);
    const is_mode = is_yield < is_rupture ? 'Yielding' : 'Rupture';

    // Eurocode EN 1999 Calculations
    const gammaM0 = 1.1;
    const gammaM2 = 1.25;

    // Yielding
    let ec_yield = (ag * fy) / gammaM0 / 1000;
    
    // Eurocode HAZ consideration for Yielding
    if (connection === 'Welded' && includeHaz) {
      // Reduced effective thickness approach
      ec_yield = (ag * rho * fy) / gammaM0 / 1000;
    }

    // Rupture
    let ec_rupture = 0;
    if (connection === 'Welded') {
      ec_rupture = (0.9 * calculatedAeff * fu) / gammaM2 / 1000;
    } else {
      ec_rupture = (0.9 * calculatedAeff * fu) / gammaM2 / 1000;
    }

    // Block Shear
    let ec_blockShear = 0;
    if (connection === 'Bolted' && s > 0 && noOfHoles > 1) {
      const avg = Math.max(0, (noOfHoles - 1) * s * thickness);
      const atn = Math.max(0, g * thickness - 0.5 * holeDia * thickness);
      ec_blockShear = ((fu / Math.sqrt(3)) * avg / gammaM2 + (fy * atn) / gammaM0) / 1000;
    }

    let ec_final = Math.min(ec_yield, ec_rupture);
    let ec_mode = ec_yield < ec_rupture ? 'Yielding' : 'Rupture';

    if (ec_blockShear > 0 && ec_blockShear < ec_final) {
      ec_final = ec_blockShear;
      ec_mode = 'Block Shear';
    }

    setResults({
      is8147: {
        yield: is_yield,
        rupture: is_rupture,
        blockShear: is_blockShear,
        final: is_final,
        mode: is_mode,
      },
      eurocode: {
        yield: ec_yield,
        rupture: ec_rupture,
        blockShear: ec_blockShear,
        final: ec_final,
        mode: ec_mode,
      },
    });
  };

  const chartData = [
    {
      name: 'Yield Strength',
      'IS 8147': results.is8147.yield,
      'Eurocode': results.eurocode.yield,
    },
    {
      name: 'Rupture Strength',
      'IS 8147': results.is8147.rupture,
      'Eurocode': results.eurocode.rupture,
    },
    {
      name: 'Block Shear',
      'IS 8147': results.is8147.blockShear,
      'Eurocode': results.eurocode.blockShear,
    },
    {
      name: 'Final Capacity',
      'IS 8147': results.is8147.final,
      'Eurocode': results.eurocode.final,
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-neutral-300 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 flex items-center gap-3">
              <Calculator className="w-8 h-8 text-indigo-600" />
              Tension Member Design Dashboard
            </h1>
            <p className="text-neutral-500 mt-2">
              Comparative analysis between IS 8147:1976 and Eurocode EN 1999
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Input Form */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold">Section Parameters</h2>
                <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                  Input Data
                </span>
              </div>
              
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* Categorical Inputs */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">ID</label>
                  <input type="text" name="id" value={inputs.id} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Section Type</label>
                  <select name="sectionType" value={inputs.sectionType} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all">
                    <option>Plates</option>
                    <option>Single Angles</option>
                    <option>Double Angles</option>
                    <option>Threaded rods</option>
                    <option>Built-up Sections</option>
                    <option>Hollow Sections</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Connection</label>
                  <select name="connection" value={inputs.connection} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all">
                    <option>Bolted</option>
                    <option>Welded</option>
                  </select>
                </div>

                {/* Dimensional Inputs */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Width (mm)</label>
                  <input type="number" name="width" value={inputs.width} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Thickness (mm)</label>
                  <input type="number" name="thickness" value={inputs.thickness} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                
                {inputs.connection === 'Bolted' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Bolt Dia (mm)</label>
                      <input type="number" name="dia" value={inputs.dia} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Hole Dia (mm)</label>
                      <input type="number" name="holeDia" value={inputs.holeDia} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">No. of Holes</label>
                      <input type="number" name="noOfHoles" value={inputs.noOfHoles} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Pitch s (mm)</label>
                      <input type="number" name="s" value={inputs.s} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-neutral-500 uppercase">Gauge g (mm)</label>
                      <input type="number" name="g" value={inputs.g} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                  </>
                )}

                {/* Material Properties */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">fy (MPa)</label>
                  <input type="number" name="fy" value={inputs.fy} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">fu (MPa)</label>
                  <input type="number" name="fu" value={inputs.fu} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>

                {/* Highlighted Area Inputs */}
                <div className="space-y-1 md:col-span-2 lg:col-span-3 p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl relative mt-2">
                  <div className="absolute -top-3 left-4 bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-md border border-emerald-300">
                    CRITICAL AREAS
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
                        Gross Area (Ag) mm² <Info className="w-3 h-3" />
                      </label>
                      <input type="number" name="ag" value={inputs.ag} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border-2 border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono text-lg text-emerald-900" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
                        Net Area (An) mm² <Info className="w-3 h-3" />
                      </label>
                      <input type="number" name="an" value={inputs.an} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border-2 border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono text-lg text-emerald-900" />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Advanced Factors & HAZ Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200">
                  <h2 className="text-lg font-semibold">Eurocode Factors</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-500 uppercase flex items-center justify-between">
                      <span>Beta (β) - Shear Lag</span>
                      <span className="text-[10px] bg-neutral-200 px-1.5 py-0.5 rounded text-neutral-600">Auto-calculated</span>
                    </label>
                    <input type="number" step="0.01" name="beta" value={inputs.beta} readOnly className="w-full px-3 py-2 bg-neutral-100 border border-neutral-300 rounded-lg text-neutral-600 font-mono outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-500 uppercase flex items-center justify-between">
                      <span>Rho (ρ) - HAZ Reduction</span>
                      <span className="text-[10px] bg-neutral-200 px-1.5 py-0.5 rounded text-neutral-600">Auto-calculated</span>
                    </label>
                    <input type="number" step="0.01" name="rho" value={inputs.rho} readOnly className="w-full px-3 py-2 bg-neutral-100 border border-neutral-300 rounded-lg text-neutral-600 font-mono outline-none" />
                  </div>
                  <div className="space-y-1 pt-2">
                    <label className="text-xs font-bold text-indigo-800 uppercase">Effective Area (Aeff) mm²</label>
                    <input type="number" name="aeff" value={inputs.aeff} readOnly className="w-full px-3 py-2 bg-indigo-50 border-2 border-indigo-200 rounded-lg font-mono text-lg text-indigo-900 outline-none" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
                <div className="bg-orange-50 px-6 py-4 border-b border-orange-200 flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <h2 className="text-lg font-semibold text-orange-900">Heat Affected Zone (HAZ)</h2>
                </div>
                <div className="p-6 space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center w-5 h-5 mt-0.5">
                      <input 
                        type="checkbox" 
                        name="includeHaz" 
                        checked={inputs.includeHaz} 
                        onChange={handleInputChange} 
                        disabled={inputs.connection !== 'Welded' || inputs.sectionType === 'Hollow Sections'}
                        className="peer appearance-none w-5 h-5 border-2 border-neutral-300 rounded-md checked:bg-orange-500 checked:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      />
                      <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <div>
                      <span className={`text-sm font-medium ${(inputs.connection !== 'Welded' || inputs.sectionType === 'Hollow Sections') ? 'text-neutral-400' : 'text-neutral-900'}`}>
                        Consider HAZ Effects
                      </span>
                      <p className="text-xs text-neutral-500 mt-1">
                        Applies strength reduction near welds. {inputs.sectionType === 'Hollow Sections' ? 'Not applicable for Hollow Sections.' : 'Only applicable for Welded connections.'}
                      </p>
                    </div>
                  </label>

                  {inputs.includeHaz && inputs.connection === 'Welded' && inputs.sectionType !== 'Hollow Sections' && (
                    <div className="space-y-1 pt-2 animate-in fade-in slide-in-from-top-2">
                      <label className="text-xs font-semibold text-orange-800 uppercase">HAZ Reduction Factor</label>
                      <input 
                        type="number" 
                        step="0.05" 
                        min="0.1" 
                        max="1.0"
                        name="hazFactor" 
                        value={inputs.hazFactor} 
                        onChange={handleInputChange} 
                        className="w-full px-3 py-2 bg-white border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all" 
                      />
                      <p className="text-[10px] text-orange-600 mt-1">
                        Typically 0.8 for 6000 series aluminium alloys.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Graphical Visualization */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden p-6">
              <h2 className="text-lg font-semibold mb-4">Strength Comparison</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                    <XAxis dataKey="name" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                    <Tooltip 
                      cursor={{fill: '#f5f5f5'}}
                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    />
                    <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
                    <Bar dataKey="IS 8147" fill="#334155" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="Eurocode" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* IS 8147 Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white">IS 8147 : 1976</h2>
                <span className="text-xs font-medium bg-slate-700 text-slate-300 px-2 py-1 rounded-full">
                  Working Stress
                </span>
              </div>
              <div className="p-6 space-y-4">
                <ResultRow label="Yield Strength" value={results.is8147.yield} unit="kN" />
                <ResultRow label="Rupture Strength" value={results.is8147.rupture} unit="kN" />
                <ResultRow 
                  label="Block Shear" 
                  value={results.is8147.blockShear} 
                  unit="kN" 
                  muted={results.is8147.blockShear === 0} 
                  fallback="Not Specified" 
                />
                
                <div className="pt-4 mt-4 border-t border-neutral-200">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase">Final Strength</p>
                      <p className="text-3xl font-light tracking-tight text-neutral-900">
                        {results.is8147.final.toFixed(2)} <span className="text-lg text-neutral-500">kN</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-neutral-500 uppercase">Failure Mode</p>
                      <p className="text-sm font-medium text-rose-600 flex items-center gap-1 justify-end">
                        <AlertCircle className="w-4 h-4" />
                        {results.is8147.mode}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Eurocode Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white">Eurocode EN 1999</h2>
                <span className="text-xs font-medium bg-indigo-500 text-indigo-100 px-2 py-1 rounded-full">
                  Limit State
                </span>
              </div>
              <div className="p-6 space-y-4">
                <ResultRow label="Yield Strength (Npl,Rd)" value={results.eurocode.yield} unit="kN" />
                <ResultRow label="Rupture Strength (Nu,Rd)" value={results.eurocode.rupture} unit="kN" />
                <ResultRow 
                  label="Block Shear" 
                  value={results.eurocode.blockShear} 
                  unit="kN" 
                  muted={results.eurocode.blockShear === 0} 
                  fallback="N/A" 
                />
                
                <div className="pt-4 mt-4 border-t border-neutral-200">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs font-semibold text-neutral-500 uppercase">Final Strength</p>
                      <p className="text-3xl font-light tracking-tight text-indigo-900">
                        {results.eurocode.final.toFixed(2)} <span className="text-lg text-indigo-500">kN</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-neutral-500 uppercase">Failure Mode</p>
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

function ResultRow({ label, value, unit, muted = false, fallback = '' }: { label: string, value: number, unit: string, muted?: boolean, fallback?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm font-medium text-neutral-600">{label}</span>
      {muted && value === 0 ? (
        <span className="text-sm font-mono text-neutral-400">{fallback}</span>
      ) : (
        <span className="text-base font-mono font-medium text-neutral-900">
          {value.toFixed(2)} <span className="text-xs text-neutral-500">{unit}</span>
        </span>
      )}
    </div>
  );
}
