import React from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  ALLOY_MAPPING_REFERENCE_SECTION_TYPE,
  ALLOY_MAPPING_REFERENCE_THICKNESS_MM,
  buildAlloyComparisonRows,
  IS8147_TO_EUROCODE_ALLOY_ID,
} from '../alloyMapping';

export default function AlloyMappingPage() {
  const rows = buildAlloyComparisonRows();

  const fyChartData = rows.map((r) => ({
    pair: r.chartLabel,
    is8147: r.isFy,
    eurocode: r.ecFy,
  }));

  const fuChartData = rows.map((r) => ({
    pair: r.chartLabel,
    is8147: r.isFu,
    eurocode: r.ecFu,
  }));

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col gap-4 border-b border-neutral-300 pb-6">
          <a
            href="#/"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to tension member calculator
          </a>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
              Alloy Mapping Between IS 8147 and Eurocode
            </h1>
            <p className="text-neutral-500 mt-2 max-w-3xl">
              Characteristic yield (<span className="font-medium text-neutral-700">f<sub>y</sub></span>) and ultimate (
              <span className="font-medium text-neutral-700">f<sub>u</sub></span>) strengths (MPa) from the same material
              datasets as the calculator. Values use {ALLOY_MAPPING_REFERENCE_THICKNESS_MM} mm thick{' '}
              {ALLOY_MAPPING_REFERENCE_SECTION_TYPE.toLowerCase()} for both codes (thickness-dependent rules apply in the
              datasets).
            </p>
          </div>
        </header>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <Info className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-950 leading-relaxed">
            This page compares <strong>equivalent alloy material strengths</strong> (f<sub>y</sub>, f<sub>u</sub>) only.
            Design differences in the app come from code provisions—such as permissible stress treatment for IS 8147, HAZ
            reductions, shear lag, and block shear logic—not from this strength table alone.
          </p>
        </div>

        <section className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200">
            <h2 className="text-lg font-semibold">Mapped comparison</h2>
            <p className="text-sm text-neutral-500 mt-1">
              Where names match between datasets, pairs are aligned automatically; otherwise the manual map in{' '}
              <code className="text-xs bg-neutral-200/80 px-1.5 py-0.5 rounded">alloyMapping.ts</code> is used (
              {Object.keys(IS8147_TO_EUROCODE_ALLOY_ID).length} entries).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/80 text-left text-xs font-semibold uppercase text-neutral-500">
                  <th className="px-4 py-3">IS 8147 alloy</th>
                  <th className="px-4 py-3">IS f<sub>y</sub> (MPa)</th>
                  <th className="px-4 py-3">IS f<sub>u</sub> (MPa)</th>
                  <th className="px-4 py-3">Eurocode alloy</th>
                  <th className="px-4 py-3">EC f<sub>y</sub> (MPa)</th>
                  <th className="px-4 py-3">EC f<sub>u</sub> (MPa)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-neutral-100 hover:bg-neutral-50/80">
                    <td className="px-4 py-3 font-medium text-neutral-800">{r.isName}</td>
                    <td className="px-4 py-3 font-mono">{r.isFy}</td>
                    <td className="px-4 py-3 font-mono">{r.isFu}</td>
                    <td className="px-4 py-3 font-medium text-neutral-800">{r.ecName}</td>
                    <td className="px-4 py-3 font-mono">{r.ecFy}</td>
                    <td className="px-4 py-3 font-mono">{r.ecFu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-8">
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
            <h2 className="text-lg font-semibold mb-1">f<sub>y</sub> comparison</h2>
            <p className="text-sm text-neutral-500 mb-4">MPa — grouped bars per mapped pair (IS 8147 vs Eurocode).</p>
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fyChartData} margin={{ top: 8, right: 8, left: 8, bottom: 64 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="pair"
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    interval={0}
                    angle={-28}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis
                    label={{ value: 'f_y (MPa)', angle: -90, position: 'insideLeft', offset: 0, fill: '#6b7280' }}
                    tick={{ fill: '#6b7280' }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend />
                  <Bar dataKey="is8147" fill="#e11d48" name="IS 8147" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="eurocode" fill="#4f46e5" name="Eurocode" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
            <h2 className="text-lg font-semibold mb-1">f<sub>u</sub> comparison</h2>
            <p className="text-sm text-neutral-500 mb-4">MPa — grouped bars per mapped pair (IS 8147 vs Eurocode).</p>
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fuChartData} margin={{ top: 8, right: 8, left: 8, bottom: 64 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="pair"
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    interval={0}
                    angle={-28}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis
                    label={{ value: 'f_u (MPa)', angle: -90, position: 'insideLeft', offset: 0, fill: '#6b7280' }}
                    tick={{ fill: '#6b7280' }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend />
                  <Bar dataKey="is8147" fill="#e11d48" name="IS 8147" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="eurocode" fill="#4f46e5" name="Eurocode" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
