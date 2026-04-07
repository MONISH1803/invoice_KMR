import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, AlertCircle, Info, ChevronDown, ChevronUp, BookOpen, LineChart as LineChartIcon, Sliders, Presentation, GitCompare, Sparkles } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine, Area, ReferenceDot } from 'recharts';
import { EUROCODE_ALLOYS, IS8147_ALLOYS } from './data/alloys';
import AlloyMappingPage from './pages/AlloyMappingPage';
import { evaluateBoltedRupturePaths, type RuptureInputs } from './ruptureNetSection';
import { nearEqual, pickGoverningLimitState } from './governingCapacity';

/** Local-only debug helper (no-op in production builds). */
function agentDebugLog(payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  const body = JSON.stringify({ sessionId: 'c49122', ...payload, timestamp: Date.now() });
  fetch('http://127.0.0.1:7629/ingest/a5d7636b-0cf7-4136-9036-63f40129bb20', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'c49122' },
    body,
  }).catch(() => {});
  if (typeof console !== 'undefined') console.log('[DEBUG_C49122]', body);
}

function clampPositive(v: number): number {
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function getConnectedLegWidth(inputs: any): number {
  const connectedLeg = inputs.connectedLeg === 'Leg 2' ? 'Leg 2' : 'Leg 1';
  return connectedLeg === 'Leg 2' ? Number(inputs.leg2) : Number(inputs.leg1);
}

/**
 * Single source of truth for Eurocode shear-lag β used in Aeff = β × An.
 * - Plate (bolted): concentric/symmetric load path → x = 0 → β = 1 (no reduction). Eccentricity x > 0 → β = max(0, min(1 − x/L, 1)). Not tied to angle “connected leg” logic.
 * - Double angle (bolted): symmetric → β = 1.
 * - Single angle (bolted): β = max(0, min(1 − x/L, 1)); x = 0 → β = 1. Default UI eccentricity for angles is non-zero so shear lag varies like before; plate defaults x = 0.
 */
/** IS 8147 Aeff caption next to numeric value (section-aware, no plate/double-angle mix-up). */
function is8147AeffCaption(
  sectionType: string,
  connection: string,
  usesIsEffectiveArea: boolean
): string {
  if (usesIsEffectiveArea) return '(a1 + k × a2)';
  if (sectionType === 'Double Angle' && connection === 'Bolted') return '(Aeff_IS = An, symmetric double angle)';
  if (sectionType === 'Plate') return '(Aeff_IS = An)';
  return '(Aeff_IS = An)';
}

export function getBeta(
  sectionType: string,
  x: number,
  L: number,
  connectionType: string
): number {
  if (connectionType !== 'Bolted') {
    return 1.0;
  }
  if (sectionType === 'Double Angle') {
    return 1.0;
  }
  const xv = Number(x);
  const Lv = Number(L);
  if (!Number.isFinite(xv) || !Number.isFinite(Lv)) {
    return 1.0;
  }
  // Plate: shear lag only when there is eccentricity along the member (x ≠ 0); concentric → β = 1, Aeff = An.
  if (sectionType === 'Plate') {
    if (Math.abs(xv) < 1e-9) {
      return 1.0;
    }
    if (Lv <= 0) {
      return 1.0;
    }
    return Math.min(1, Math.max(0, 1 - xv / Lv));
  }
  if (Math.abs(xv) < 1e-9) {
    return 1.0;
  }
  if (Lv <= 0) {
    return 1.0;
  }
  return Math.min(1, Math.max(0, 1 - xv / Lv));
}

/** Eurocode Aeff uses β; optional UI toggle forces β = 1 without changing underlying x/L model. */
function effectiveEurocodeBeta(inputs: { showShearLagEffect?: boolean }, betaModel: number): number {
  if (inputs.showShearLagEffect === false) return 1.0;
  return betaModel;
}

/** Tolerance (mm) so values equal to code minima pass; invalid only when strictly below minimum. */
const GEOM_MIN_EPS = 1e-6;

function meetsGeometryMinimum(value: number, minimum: number): boolean {
  return Number.isFinite(value) && Number.isFinite(minimum) && value + GEOM_MIN_EPS >= minimum;
}

/** Straight transverse row: enforce b ≥ 2e + (n−1)g with effective e, g (IS-style detailing minima). */
export function validateStraightBoltLayout({
  b,
  eUser,
  gUser,
  d,
  dh,
  nCross,
}: {
  b: number;
  eUser: number;
  gUser: number;
  d: number;
  dh: number;
  nCross: number;
}) {
  const eMin = 1.5 * dh;
  const gMin = 2.5 * d;
  const eEff = Math.max(eUser, eMin);
  const gEff = Math.max(gUser, gMin);

  const clearWidth = b - 2 * eEff;
  // Floor can undershoot when clearWidth/gEff is almost an integer; tiny epsilon keeps boundary n valid.
  const nMax =
    clearWidth >= -GEOM_MIN_EPS
      ? Math.floor(Math.max(0, clearWidth) / gEff + 1e-9) + 1
      : 0;
  const requiredWidth = 2 * eEff + Math.max(0, nCross - 1) * gEff;
  const noBoltCanFit = !meetsGeometryMinimum(b, 2 * eEff);

  const isValid = !noBoltCanFit && nCross <= nMax && Number.isFinite(nCross) && nCross >= 0;

  const title = 'Straight cross-section width check';

  if (noBoltCanFit && nCross > 0) {
    return {
      type: 'Straight' as const,
      title,
      eMin,
      gMin,
      eEff,
      gEff,
      nMax: 0,
      requiredWidth,
      noBoltCanFit: true,
      isValid: false,
      message:
        'Straight cross-section: no bolt can fit for the given connected width and minimum edge distances.',
    };
  }

  if (nCross > nMax) {
    return {
      type: 'Straight' as const,
      title,
      eMin,
      gMin,
      eEff,
      gEff,
      nMax,
      requiredWidth,
      noBoltCanFit: false,
      isValid: false,
      message: `Straight cross-section: too many bolts in one row. Maximum allowed n_max = ${nMax} (required width for n = ${nCross} would be ${requiredWidth.toFixed(2)} mm vs b = ${b.toFixed(2)} mm).`,
    };
  }

  return {
    type: 'Straight' as const,
    title,
    eMin,
    gMin,
    eEff,
    gEff,
    nMax,
    requiredWidth,
    noBoltCanFit: false,
    isValid,
    message:
      'Straight layout fits within connected width (straight transverse cross-section row).',
  };
}

/**
 * Staggered: do NOT apply the straight-row width bolt cap globally. Only check local spacing minima;
 * governing tension rupture comes from candidate net-section paths (straight vs zig-zag), not this panel.
 */
export function validateStaggeredBoltLayout({
  eUser,
  gUser,
  staggerP,
  linePitch,
  rows,
  d,
  dh,
}: {
  eUser: number;
  gUser: number;
  staggerP: number;
  linePitch: number;
  rows: number;
  d: number;
  dh: number;
}) {
  const eMin = 1.5 * dh;
  const gMin = 2.5 * d;
  const pMin = 2.5 * d;

  const eEff = Math.max(eUser, eMin);
  const gEff = Math.max(gUser, gMin);
  const pStaggerEff = Math.max(staggerP, pMin);
  const linePitchEff = Math.max(linePitch, pMin);

  const staggerPitchOk = meetsGeometryMinimum(staggerP, pMin);
  const linePitchOk = rows <= 1 || meetsGeometryMinimum(linePitch, pMin);

  // Invalid only when strictly below minimum (within GEOM_MIN_EPS); g_eff = g_min is valid.
  const isValid =
    meetsGeometryMinimum(eUser, eMin) &&
    meetsGeometryMinimum(gUser, gMin) &&
    staggerPitchOk &&
    linePitchOk;

  const note =
    'For staggered patterns, the straight cross-section bolt-limit rule is not applied globally; rupture is controlled by candidate zig-zag net-section paths.';

  if (isValid) {
    return {
      type: 'Staggered' as const,
      title: 'Staggered spacing check (not straight-row width limit)',
      eMin,
      gMin,
      pMin,
      eEff,
      gEff,
      pStaggerEff,
      linePitchEff,
      staggerP,
      linePitch,
      rows,
      isValid: true,
      message:
        'Staggered layout satisfies minimum edge, gauge, and pitch rules. Governing rupture is checked through zig-zag path analysis.',
      note,
    };
  }

  const parts: string[] = [];
  if (!meetsGeometryMinimum(eUser, eMin)) parts.push(`edge e < e_min (${eMin.toFixed(2)} mm)`);
  if (!meetsGeometryMinimum(gUser, gMin)) parts.push(`gauge g < g_min (${gMin.toFixed(2)} mm)`);
  if (!staggerPitchOk) parts.push(`stagger pitch p < p_min (${pMin.toFixed(2)} mm)`);
  if (!linePitchOk) parts.push(`line pitch s < p_min (${pMin.toFixed(2)} mm)`);

  return {
    type: 'Staggered' as const,
    title: 'Staggered spacing check (not straight-row width limit)',
    eMin,
    gMin,
    pMin,
    eEff,
    gEff,
    pStaggerEff,
    linePitchEff,
    staggerP,
    linePitch,
    rows,
    isValid: false,
    message: `Staggered layout violates minimum spacing: ${parts.join('; ')}.`,
    note,
  };
}

/**
 * Staggered rupture/block shear need diagonal stagger pitch and gauge. If the dedicated
 * stagger fields are empty or ≤ 0, fall back to line pitch s and transverse gauge g (same
 * as the main bolt spacing inputs). Pattern switch to Staggered copies s→stagger_p and g→stagger_g.
 */
export function resolveStaggerGeometryForRupture(inputs: {
  holePattern: string;
  s: number;
  g: number;
  stagger_p: number;
  stagger_g: number;
}): { stagger_p: number; stagger_g: number } {
  const s = Number(inputs.s);
  const g = Number(inputs.g);
  let sp = Number(inputs.stagger_p);
  let sg = Number(inputs.stagger_g);
  if (inputs.holePattern !== 'Staggered') {
    return { stagger_p: sp, stagger_g: sg };
  }
  if (!Number.isFinite(sp) || sp <= 0) sp = Number.isFinite(s) && s > 0 ? s : sp;
  if (!Number.isFinite(sg) || sg <= 0) sg = Number.isFinite(g) && g > 0 ? g : sg;
  return { stagger_p: sp, stagger_g: sg };
}

/** Bolt layout validation: straight uses transverse width rule; staggered uses spacing minima only. */
function evaluateBoltLayoutGeometry(inputs: any) {
  const d = Number(inputs.dia);
  const dh = d + 2;
  let b = Number(inputs.width);
  if (inputs.sectionType === 'Single Angle' || inputs.sectionType === 'Double Angle') {
    b = getConnectedLegWidth(inputs);
  }

  if (inputs.connection !== 'Bolted') {
    return {
      pattern: 'Welded' as const,
      invalid: false,
      d,
      dh,
      b,
    };
  }

  const eUser = Number(inputs.e);
  const gUser = Number(inputs.g);
  const nCross = Number(inputs.noOfHoles);

  if (inputs.holePattern === 'Straight') {
    const straight = validateStraightBoltLayout({ b, eUser, gUser, d, dh, nCross });
    return {
      pattern: 'Straight' as const,
      invalid: !straight.isValid,
      d,
      dh,
      b,
      straight,
      eMin: straight.eMin,
      gMin: straight.gMin,
      effectiveEdge: straight.eEff,
      effectiveGauge: straight.gEff,
      nMax: straight.nMax,
      noBoltCanFit: straight.noBoltCanFit,
      helper: straight.message,
    };
  }

  const rows = Number(inputs.rows);
  const staggerResolved = resolveStaggerGeometryForRupture(inputs);
  const staggerP = staggerResolved.stagger_p;
  const linePitch = Number(inputs.s);
  const stagger = validateStaggeredBoltLayout({
    eUser,
    gUser,
    staggerP,
    linePitch,
    rows,
    d,
    dh,
  });

  return {
    pattern: 'Staggered' as const,
    invalid: !stagger.isValid,
    d,
    dh,
    b,
    stagger,
    eMin: stagger.eMin,
    gMin: stagger.gMin,
    effectiveEdge: stagger.eEff,
    effectiveGauge: stagger.gEff,
    noBoltCanFit: false,
    helper: stagger.message,
  };
}

// Calculation Logic strictly adhering to EN 1999-1-1 and IS 8147:1976
export function calculateConnectionCapacities(inputs: any) {
  const {
    width, thickness, dia, noOfHoles: n, rows: n_line,
    g, s: p, e, fy, fu, gammaM0, gammaM2,
    sigmaAtIS, connection, considerHAZ, rho_o, rho_u
  } = inputs;
  const sigma_at = sigmaAtIS == null ? 0 : Number(sigmaAtIS);
  const sigma_at_rupture = sigma_at;
  // #region agent log
  agentDebugLog({
    runId: 'pre-fix',
    hypothesisId: 'H1',
    location: 'App.tsx:calculateConnectionCapacities:entry',
    message: 'calc entry inputs snapshot',
    data: {
      sectionType: inputs.sectionType,
      connection: inputs.connection,
      holePattern: inputs.holePattern,
      x: inputs.x,
      L: inputs.L,
      noOfHoles: inputs.noOfHoles,
      rows: inputs.rows,
      thickness: inputs.thickness,
      leg1: inputs.leg1,
      leg2: inputs.leg2,
      connectedLeg: inputs.connectedLeg,
    },
  });
  // #endregion

  let fy_eff = fy;
  let fu_eff = fu;
  if (connection === 'Welded' && considerHAZ) {
    fy_eff = fy * (rho_o !== undefined ? rho_o : inputs.rho);
    fu_eff = fu * (rho_u !== undefined ? rho_u : inputs.rho);
  }

  const dh = dia + 2;
  const connectedLegWidth = getConnectedLegWidth(inputs);

  let Ag = 0;
  let bPath = width;
  if (inputs.sectionType === 'Plate') {
    Ag = width * thickness;
    bPath = width;
  } else if (inputs.sectionType === 'Single Angle') {
    Ag = (inputs.leg1 + inputs.leg2 - thickness) * thickness;
    bPath = connectedLegWidth; // Single-angle rupture path MUST use connected leg only.
  } else if (inputs.sectionType === 'Double Angle') {
    Ag = 2 * (inputs.leg1 + inputs.leg2 - thickness) * thickness;
    bPath = 2 * connectedLegWidth;
  }

  const effStagger = resolveStaggerGeometryForRupture(inputs);

  const ruptureEval = connection === 'Bolted'
    ? evaluateBoltedRupturePaths(
        {
          connection: inputs.connection,
          holePattern: inputs.holePattern,
          noOfHoles: Number(inputs.noOfHoles),
          rows: Number(inputs.rows),
          stagger_p: effStagger.stagger_p,
          stagger_g: effStagger.stagger_g,
        } satisfies RuptureInputs,
        bPath,
        dh,
        thickness
      )
    : {
        paths: [
          {
            id: 'R0',
            type: 'Welded/No hole deduction',
            formula: 'bn = b',
            holesCut: 0,
            staggerTerms: [],
            holeDeductionTerm: 0,
            staggerAdditionTerm: 0,
            bn: bPath,
            an: bPath * thickness,
            governing: true,
          },
        ],
        governing: {
          id: 'R0',
          type: 'Welded',
          formula: 'bn = b',
          holesCut: 0,
          staggerTerms: [],
          holeDeductionTerm: 0,
          staggerAdditionTerm: 0,
          bn: bPath,
          an: bPath * thickness,
          governing: true,
        },
      };
  const An = clampPositive(ruptureEval.governing.an);
  // #region agent log
  agentDebugLog({
    runId: 'pre-fix',
    hypothesisId: 'H2',
    location: 'App.tsx:calculateConnectionCapacities:rupturePaths',
    message: 'rupture candidate evaluation',
    data: {
      bPath,
      dh,
      paths: ruptureEval.paths?.map((p: any) => ({ id: p.id, type: p.type, bn: p.bn, an: p.an, gov: p.governing })),
      governingPath: ruptureEval.governing?.id,
      governingAn: An,
    },
  });
  // #endregion

  // Block shear base areas.
  let Ant = connection === 'Welded' ? 0 : (g - dh) * thickness;
  let Atg = connection === 'Welded' ? 0 : g * thickness;
  let Anv = connection === 'Welded' ? 0 : 2 * (e + p * (n_line - 1) - (n_line - 0.5) * dh) * thickness;
  let Avg = connection === 'Welded' ? 0 : 2 * (e + p * (n_line - 1)) * thickness;
  if (inputs.sectionType === 'Double Angle') {
    Ant *= 2;
    Atg *= 2;
    Anv *= 2;
    Avg *= 2;
  }

  // Eurocode shear lag factor β — model from getBeta(); UI can force β = 1 (shear lag off).
  const betaModel = getBeta(inputs.sectionType, Number(inputs.x), Number(inputs.L), connection);
  const beta = effectiveEurocodeBeta(inputs, betaModel);
  // #region agent log
  agentDebugLog({
    runId: 'pre-fix',
    hypothesisId: 'H3',
    location: 'App.tsx:calculateConnectionCapacities:beta',
    message: 'eurocode beta evaluation',
    data: { sectionType: inputs.sectionType, x: inputs.x, L: inputs.L, betaModel, beta },
  });
  // #endregion

  const ecYield = (Ag * fy_eff) / gammaM0 / 1000;
  const Aeff = An * beta;
  const ecRupture = (Aeff * fu_eff) / gammaM2 / 1000;

  let isAeff = An;
  let isK = 1.0;
  if (connection === 'Bolted') {
    if (inputs.sectionType === 'Single Angle') {
      const otherLeg = inputs.connectedLeg === 'Leg 2' ? Number(inputs.leg1) : Number(inputs.leg2);
      const a1 = An;
      const a2 = clampPositive((otherLeg - thickness / 2) * thickness);
      // IS 8147 single-angle effective area: Aeff_IS = a1 + k*a2
      // k is user-tunable; 0.5 is fallback default.
      isK = Number.isFinite(Number(inputs.isKFactor)) ? Number(inputs.isKFactor) : 0.5;
      isK = Math.max(0, Math.min(1, isK));
      isAeff = a1 + a2 * isK;
    } else if (inputs.sectionType === 'Double Angle') {
      // IS 8147 double-angle symmetric case: both legs connected, no k-factor.
      isK = 1.0;
      isAeff = An;
    }
  }
  const isYield = (Ag * sigma_at) / 1000;
  const isRupture = (isAeff * sigma_at_rupture) / 1000;
  // #region agent log
  agentDebugLog({
    runId: 'pre-fix',
    hypothesisId: 'H4',
    location: 'App.tsx:calculateConnectionCapacities:isAeff',
    message: 'is8147 effective area evaluation',
    data: { sectionType: inputs.sectionType, connectedLeg: inputs.connectedLeg, isK, An, isAeff },
  });
  // #endregion

  const bsPathsList: any[] = [];
  if (connection === 'Bolted' && n_line > 0 && p > 0) {
    const staggerEnabled =
      inputs.holePattern === 'Staggered' && effStagger.stagger_p > 0 && effStagger.stagger_g > 0;
    const staggerAddTerm = staggerEnabled ? (effStagger.stagger_p ** 2) / (4 * effStagger.stagger_g) : 0;
    const staggerAddArea = staggerAddTerm * thickness * (inputs.sectionType === 'Double Angle' ? 2 : 1);

    const candidates = [
      {
        id: 'B1',
        type: 'Standard',
        description: 'Standard block path (no stagger correction on tension plane)',
        Avg,
        Avn: Anv,
        Atg,
        Atn: Ant,
      },
    ];
    if (staggerEnabled) {
      candidates.push({
        id: 'B2',
        type: 'Stagger-sensitive',
        description: 'Alternative block path with stagger correction on tension plane',
        Avg,
        Avn: Anv,
        Atg,
        Atn: clampPositive(Ant + staggerAddArea),
      });
    }

    for (const c of candidates) {
      const ec_bs = ((fu_eff * c.Atn) / gammaM2 + (fy_eff * c.Avn) / (Math.sqrt(3) * gammaM0)) / 1000;
      const is_tdb1 = ((c.Avg * sigma_at) / Math.sqrt(3) + (0.9 * c.Atn * sigma_at_rupture)) / 1000;
      const is_tdb2 = ((0.9 * c.Avn * sigma_at_rupture) / Math.sqrt(3) + (c.Atg * sigma_at)) / 1000;
      const is_bs = Math.min(is_tdb1, is_tdb2);
      bsPathsList.push({ ...c, ec_bs, is_bs, is_tdb1, is_tdb2, isGovEc: false, isGovIs: false });
    }
  }

  let ecBlockShear = 0;
  let isBlockShear = 0;
  let ecBsPath = 'N/A';
  let isBsPath = 'N/A';
  if (bsPathsList.length > 0) {
    const ecGov = bsPathsList.reduce((min, pth) => (pth.ec_bs < min.ec_bs ? pth : min), bsPathsList[0]);
    const isGov = bsPathsList.reduce((min, pth) => (pth.is_bs < min.is_bs ? pth : min), bsPathsList[0]);
    ecBlockShear = ecGov.ec_bs;
    isBlockShear = isGov.is_bs;
    ecBsPath = ecGov.id;
    isBsPath = isGov.id;
    bsPathsList.forEach((pRow) => {
      pRow.isGovEc = pRow.id === ecGov.id;
      pRow.isGovIs = pRow.id === isGov.id;
    });
  }

  const ecGov = pickGoverningLimitState(ecYield, ecRupture, ecBlockShear);
  const ecFinal = ecGov.final;
  const ecMode = ecGov.mode;
  const isGov = pickGoverningLimitState(isYield, isRupture, isBlockShear);
  const isFinal = isGov.final;
  const isMode = isGov.mode;
  // #region agent log
  agentDebugLog({
    runId: 'pre-fix',
    hypothesisId: 'H5',
    location: 'App.tsx:calculateConnectionCapacities:final',
    message: 'final capacity summary',
    data: {
      ec: { yield: ecYield, rupture: ecRupture, blockShear: ecBlockShear, final: ecFinal, mode: ecMode, bsPath: ecBsPath },
      is: { yield: isYield, rupture: isRupture, blockShear: isBlockShear, final: isFinal, mode: isMode, bsPath: isBsPath },
    },
  });
  // #endregion

  return {
    eurocode: { yield: ecYield, rupture: ecRupture, blockShear: ecBlockShear, final: ecFinal, mode: ecMode, bsPath: ecBsPath },
    is8147: { yield: isYield, rupture: isRupture, blockShear: isBlockShear, final: isFinal, mode: isMode, bsPath: isBsPath },
    derived: {
      holeDia: dh,
      ag: Ag,
      an: An,
      beta,
      betaModel,
      aeff: Aeff,
      isK,
      isAeff,
      criticalAnPath: ruptureEval.governing.id,
      rupturePaths: ruptureEval.paths,
      connectedLegWidth: bPath,
      effectiveStagger_p: effStagger.stagger_p,
      effectiveStagger_g: effStagger.stagger_g,
    },
    bsPathsList,
  };
}

export function TensionMemberCalculator() {
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
    connectedLeg: 'Leg 1',
    isKFactor: 0.5,
    thickness: 10,
    dia: 16,
    noOfHoles: 2,
    rows: 2,
    s: 50,
    g: 50,
    e: 30,
    x: 0,
    L: 100,
    fy: 250,
    fu: 290,
    fyIS8147: 105,
    fuIS8147: 105,
    sigmaAtIS: null as number | null,
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
    stagger_p: 50,
    stagger_g: 50,
    showShearLagEffect: true,
  });

  const [derived, setDerived] = useState({
    holeDia: 18,
    ag: 1000,
    an: 820,
    beta: 1.0,
    betaModel: 1.0,
    aeff: 820,
    isK: 1.0,
    isAeff: 820,
    connectedLegWidth: 100,
    criticalAnPath: 'Straight',
    rupturePaths: [] as any[],
    effectiveStagger_p: 50,
    effectiveStagger_g: 50,
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
      } else if (name === 'sigmaAtIS') {
        const raw = (e.target as HTMLInputElement).value;
        parsedValue = raw === '' || raw === '-' ? null : Number(raw);
      } else {
        parsedValue = ['id', 'sectionType', 'connection', 'holePattern', 'eurocodeAlloy', 'is8147Alloy', 'sigmaAtMode', 'foMode', 'connectedLeg'].includes(name) ? value : Number(value);
      }
      const newInputs = { ...prev, [name]: parsedValue };

      if (name === 'sectionType') {
        if (parsedValue === 'Plate') {
          newInputs.x = 0;
        } else if (parsedValue === 'Single Angle') {
          newInputs.x = 20;
        }
      }

      if (name === 'holePattern' && parsedValue === 'Staggered') {
        newInputs.stagger_p = Number(prev.s);
        newInputs.stagger_g = Number(prev.g);
      }

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
        if (isAlloyData) {
          const mat = isAlloyData.getMaterialProps(tVal, sectionTypeVal);
          newInputs.fyIS8147 = mat.fy;
          newInputs.fuIS8147 = mat.fu;
          if (newInputs.sigmaAtMode === 'Auto') {
            newInputs.sigmaAtIS = isAlloyData.getPermissibleTable4(tVal, sectionTypeVal);
          }
        }
      }

      if (name === 'sigmaAtMode' && parsedValue === 'Auto') {
        const isAlloyData = IS8147_ALLOYS.find(a => a.name === newInputs.is8147Alloy) || IS8147_ALLOYS.find(a => a.id === 'Generic/Unspecified');
        if (isAlloyData) {
          newInputs.sigmaAtIS = isAlloyData.getPermissibleTable4(newInputs.thickness, newInputs.sectionType);
        }
      }

      return newInputs;
    });
  };

  /** Prof. demo: stagger case — b=100, t=10, dh=18, n=2, g=50, p≥2.5d (defaults use p=50). Textbook p=25 zig-zag comparison can be typed manually; detailing check may flag p<2.5d. */
  const applySampleStaggerPreset = () => {
    setInputs((prev) => {
      const next: typeof prev = {
        ...prev,
        id: 'demo-stagger',
        sectionType: 'Single Angle',
        connection: 'Bolted',
        holePattern: 'Staggered',
        leg1: 100,
        leg2: 100,
        connectedLeg: 'Leg 1',
        thickness: 10,
        dia: 16,
        noOfHoles: 2,
        rows: 2,
        s: 50,
        g: 50,
        e: 30,
        x: 20,
        L: 100,
        stagger_p: 50,
        stagger_g: 50,
      };
      const ecAlloyData =
        EUROCODE_ALLOYS.find((a) => a.name === next.eurocodeAlloy) ||
        EUROCODE_ALLOYS.find((a) => a.id === 'Generic/Unspecified');
      if (ecAlloyData) {
        const ecProps = ecAlloyData.getProps(next.thickness, next.sectionType);
        next.fy = ecProps.fo;
        next.fu = ecProps.fu;
        next.rho_o = ecProps.rho_o;
        next.rho_u = ecProps.rho_u;
        if (next.foMode === 'Auto') next.fo = next.fy;
      }
      const isAlloyData =
        IS8147_ALLOYS.find((a) => a.name === next.is8147Alloy) ||
        IS8147_ALLOYS.find((a) => a.id === 'Generic/Unspecified');
      if (isAlloyData) {
        const mat = isAlloyData.getMaterialProps(next.thickness, next.sectionType);
        next.fyIS8147 = mat.fy;
        next.fuIS8147 = mat.fu;
        if (next.sigmaAtMode === 'Auto') {
          next.sigmaAtIS = isAlloyData.getPermissibleTable4(next.thickness, next.sectionType);
        }
      }
      return next;
    });
  };

  const boltGeometry = useMemo(() => evaluateBoltLayoutGeometry(inputs), [inputs]);

  useEffect(() => {
    if (inputs.connection === 'Bolted' && boltGeometry.invalid) {
      const betaModelInv = getBeta(inputs.sectionType, Number(inputs.x), Number(inputs.L), inputs.connection);
      const betaInvalid = effectiveEurocodeBeta(inputs, betaModelInv);
      const effStInv = resolveStaggerGeometryForRupture(inputs);
      setDerived((prev) => ({
        ...prev,
        holeDia: boltGeometry.dh,
        ag: 0,
        an: 0,
        aeff: 0,
        isAeff: 0,
        betaModel: betaModelInv,
        beta: betaInvalid,
        effectiveStagger_p: effStInv.stagger_p,
        effectiveStagger_g: effStInv.stagger_g,
        criticalAnPath: 'Geometry Invalid',
        rupturePaths: [],
      }));
      setResults({
        is8147: { yield: 0, rupture: 0, blockShear: 0, final: 0, mode: 'Invalid geometry', bsPath: '' },
        eurocode: { yield: 0, rupture: 0, blockShear: 0, final: 0, mode: 'Invalid geometry', bsPath: '' },
        bsPathsList: [],
      });
      return;
    }
    const results = calculateConnectionCapacities(inputs);
    setDerived(results.derived as any);
    setResults({
      is8147: results.is8147,
      eurocode: results.eurocode,
      bsPathsList: results.bsPathsList
    });
  }, [inputs, boltGeometry]);

  const chartData = [
    { name: 'Yield', 'IS 8147': results.is8147.yield, 'Eurocode': results.eurocode.yield },
    { name: 'Rupture', 'IS 8147': results.is8147.rupture, 'Eurocode': results.eurocode.rupture },
    { name: 'Block Shear', 'IS 8147': results.is8147.blockShear, 'Eurocode': results.eurocode.blockShear },
    { name: 'Final', 'IS 8147': results.is8147.final, 'Eurocode': results.eurocode.final },
  ];
  const usesIsEffectiveArea = inputs.connection === 'Bolted' && inputs.sectionType === 'Single Angle';
  const sigmaAtDisp = inputs.sigmaAtIS == null ? '—' : inputs.sigmaAtIS.toFixed(2);

  const selectedEcAlloy = EUROCODE_ALLOYS.find(a => a.name === inputs.eurocodeAlloy);

  const currentXOverL = useMemo(() => {
    const L = Number(inputs.L);
    if (L <= 0) return 0;
    return Number((Number(inputs.x) / L).toFixed(3));
  }, [inputs.x, inputs.L]);

  const shearLagCurveData = useMemo(() => {
    const data: Array<{ ratio: number; beta: number }> = [];
    const Lref = 100;
    for (let r = 0; r <= 1.0001; r += 0.05) {
      const rr = Number(r.toFixed(2));
      const beta = getBeta(inputs.sectionType, rr * Lref, Lref, inputs.connection);
      data.push({
        ratio: rr,
        beta: Number(beta.toFixed(3)),
      });
    }
    return data;
  }, [inputs.sectionType, inputs.connection]);

  const isDoubleAngleBolted = inputs.sectionType === 'Double Angle' && inputs.connection === 'Bolted';
  const isPlateBolted = inputs.sectionType === 'Plate' && inputs.connection === 'Bolted';

  /** Same inputs except hole pattern — compares net area / rupture (β unchanged). */
  const straightVsStaggerRuptureCompare = useMemo(() => {
    if (inputs.connection !== 'Bolted') return null;
    const rStr = calculateConnectionCapacities({ ...inputs, holePattern: 'Straight' });
    const rStg = calculateConnectionCapacities({ ...inputs, holePattern: 'Staggered' });
    return {
      straightAn: rStr.derived.an,
      staggerAn: rStg.derived.an,
      straightRuptureEc: rStr.eurocode.rupture,
      staggerRuptureEc: rStg.eurocode.rupture,
      straightPath: rStr.derived.criticalAnPath,
      staggerPath: rStg.derived.criticalAnPath,
    };
  }, [inputs]);

  const fuEffEurocode = useMemo(() => {
    let fu_eff = Number(inputs.fu);
    if (inputs.connection === 'Welded' && inputs.considerHAZ) {
      fu_eff *= Number(inputs.rho_u ?? inputs.rho ?? 1);
    }
    return fu_eff;
  }, [inputs.fu, inputs.connection, inputs.considerHAZ, inputs.rho_u, inputs.rho]);

  const shearLagRuptureGraphData = useMemo(() => {
    const L_GRAPH = 100;
    const An = Number(derived.an);
    const gammaM2 = Number(inputs.gammaM2);
    if (!Number.isFinite(An) || An <= 0 || !Number.isFinite(fuEffEurocode) || gammaM2 <= 0) {
      return [] as Array<{ ratio: number; ruptureNoSl: number; ruptureSl: number; xMm: number }>;
    }
    const rows: Array<{ ratio: number; ruptureNoSl: number; ruptureSl: number; xMm: number }> = [];
    const ruptureNoSl = (An * fuEffEurocode) / gammaM2 / 1000;
    for (let xMm = 0; xMm <= 50.0001; xMm += 2.5) {
      const x = Number(xMm.toFixed(2));
      const ratio = x / L_GRAPH;
      const b = getBeta(inputs.sectionType, x, L_GRAPH, inputs.connection);
      const ruptureSl = (An * b * fuEffEurocode) / gammaM2 / 1000;
      rows.push({
        ratio: Number(ratio.toFixed(4)),
        ruptureNoSl: Number(ruptureNoSl.toFixed(4)),
        ruptureSl: Number(ruptureSl.toFixed(4)),
        xMm: x,
      });
    }
    return rows;
  }, [derived.an, inputs.sectionType, inputs.connection, inputs.gammaM2, fuEffEurocode]);

  /** Current x mapped onto the fixed L-graph (100 mm) with x ∈ [0, 50] mm for the rupture chart. */
  const shearLagRuptureCurrentPoint = useMemo(() => {
    const Lg = 100;
    const xClamped = Math.max(0, Math.min(50, Number(inputs.x)));
    const ratio = xClamped / Lg;
    const b = getBeta(inputs.sectionType, xClamped, Lg, inputs.connection);
    const An = Number(derived.an);
    const gammaM2 = Number(inputs.gammaM2);
    if (!Number.isFinite(An) || An <= 0 || !Number.isFinite(fuEffEurocode) || gammaM2 <= 0) {
      return null;
    }
    const ruptureSl = (An * b * fuEffEurocode) / gammaM2 / 1000;
    return { ratio: Number(ratio.toFixed(4)), ruptureSl: Number(ruptureSl.toFixed(4)) };
  }, [inputs.x, inputs.sectionType, inputs.connection, derived.an, inputs.gammaM2, fuEffEurocode]);

  const liveShearLagFormula = useMemo(() => {
    if (inputs.connection !== 'Bolted') {
      return { title: 'Welded', line: 'β = 1.0 (no bolted shear lag model applied here)' };
    }
    if (inputs.sectionType === 'Double Angle') {
      return { title: 'Double angle', line: 'β = 1.0 (symmetric connection)' };
    }
    const xv = Number(inputs.x);
    const Lv = Number(inputs.L);
    if (inputs.sectionType === 'Single Angle') {
      return {
        title: 'Single angle',
        line:
          Lv > 0
            ? `β = 1 − x/L = 1 − ${xv.toFixed(2)}/${Lv.toFixed(2)} = ${derived.betaModel.toFixed(3)}`
            : `β = 1 − x/L  →  β = ${derived.betaModel.toFixed(3)}`,
      };
    }
    if (inputs.sectionType === 'Plate') {
      if (Math.abs(xv) < 1e-9 || Lv <= 0) {
        return { title: 'Plate', line: 'β = 1.0 when x = 0 (concentric); enter x > 0 for β = max(0, 1 − x/L)' };
      }
      return {
        title: 'Plate',
        line: `β = max(0, 1 − x/L) = max(0, 1 − ${xv.toFixed(2)}/${Lv.toFixed(2)}) = ${derived.betaModel.toFixed(3)}`,
      };
    }
    return { title: 'Section', line: `β = max(0, min(1 − x/L, 1)) = ${derived.betaModel.toFixed(3)}` };
  }, [inputs.connection, inputs.sectionType, inputs.x, inputs.L, derived.betaModel]);

  const generateParametricData = () => {
    const data = [];
    let minVal, maxVal, steps;
    const baseVal = inputs[paramVar];
    minVal = baseVal * 0.5; // -50%
    maxVal = baseVal * 1.5; // +50%
    steps = 20;

    const stepSize = (maxVal - minVal) / steps;

    for (let i = 0; i <= steps; i++) {
      const val = minVal + i * stepSize;

      const testInputs = { ...inputs } as typeof inputs;
      if (paramVar === 'width') {
        if (inputs.sectionType === 'Plate') {
          testInputs.width = val;
        } else {
          testInputs.leg1 = val;
          testInputs.leg2 = val;
        }
      } else {
        (testInputs as any)[paramVar] = val;
      }

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
        if (isAlloyData) {
          const mat = isAlloyData.getMaterialProps(val, testInputs.sectionType);
          testInputs.fyIS8147 = mat.fy;
          testInputs.fuIS8147 = mat.fu;
          if (testInputs.sigmaAtMode === 'Auto') {
            testInputs.sigmaAtIS = isAlloyData.getPermissibleTable4(val, testInputs.sectionType);
          }
        }
      }

      const results = calculateConnectionCapacities(testInputs);
      const ec = Number(results.eurocode.final.toFixed(2));
      const isv = Number(results.is8147.final.toFixed(2));
      const gap = Number((ec - isv).toFixed(2));
      data.push({
        paramValue: Number(val.toFixed(2)),
        Eurocode: ec,
        IS8147: isv,
        gap,
      });
    }
    return data;
  };

  const parametricData = useMemo(
    () => (activeTab === 'parametric' ? generateParametricData() : []),
    [activeTab, inputs, paramVar]
  );

  const parametricInsight = useMemo(() => {
    if (!parametricData.length) return null;
    const gaps = parametricData.map((d) => d.gap);
    const minG = Math.min(...gaps);
    const maxG = Math.max(...gaps);
    const avgG = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const ecVals = parametricData.map((d) => d.Eurocode);
    const isVals = parametricData.map((d) => d.IS8147);
    const ecHigherCount = gaps.filter((g) => g > 0.01).length;
    const isHigherCount = gaps.filter((g) => g < -0.01).length;
    let dominance: string;
    if (ecHigherCount === gaps.length) dominance = 'Eurocode EN 1999 predicts a higher governing capacity than IS 8147 across the entire swept range.';
    else if (isHigherCount === gaps.length) dominance = 'IS 8147 predicts a higher governing capacity than Eurocode EN 1999 across the entire swept range.';
    else dominance = 'The comparison changes along the sweep: neither code is uniformly more conservative for all parameter values shown.';
    return {
      minG,
      maxG,
      avgG,
      ecMin: Math.min(...ecVals),
      ecMax: Math.max(...ecVals),
      isMin: Math.min(...isVals),
      isMax: Math.max(...isVals),
      dominance,
      rangeLabel: `about ${((parametricData[parametricData.length - 1].paramValue as number) / (parametricData[0].paramValue as number || 1)).toFixed(2)}× the starting value (±50% of current)`,
    };
  }, [parametricData, paramVar]);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-300 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 flex items-center gap-3">
              <Calculator className="w-8 h-8 text-indigo-600" />
              Tension Member Design
            </h1>
            <p className="text-neutral-500 mt-2">
              Comparative analysis between IS 8147:1976 and Eurocode EN 1999
            </p>
          </div>
          <a
            href="#/alloy-mapping"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 shrink-0"
          >
            <GitCompare className="w-4 h-4" />
            Alloy mapping
          </a>
        </header>

        <div className="flex flex-wrap items-center gap-2">
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
          <a
            href="#/alloy-mapping"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-2 border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
          >
            <GitCompare className="w-4 h-4" />
            Open alloy mapping page
          </a>
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
                {inputs.connection === 'Bolted' && (
                  <div className="md:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={applySampleStaggerPreset}
                      className="inline-flex items-center gap-2 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-900 hover:bg-purple-100"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Load stagger demo (single angle, 100×10 mm, dh=18, n=2, p=50, g=50)
                    </button>
                    <span className="text-[10px] text-neutral-500">Sets inputs for the documented validation case; open Staggered Bolt Path Analysis below.</span>
                  </div>
                )}
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
                    {inputs.connection === 'Bolted' && (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-neutral-500 uppercase">Connected Leg for Rupture Path</label>
                        <select name="connectedLeg" value={inputs.connectedLeg} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none">
                          <option>Leg 1</option>
                          <option>Leg 2</option>
                        </select>
                      </div>
                    )}
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
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <label className="text-xs font-bold text-purple-800 uppercase flex items-center gap-1">
                        Staggered Geometry Parameters
                      </label>
                      <button
                        type="button"
                        onClick={applySampleStaggerPreset}
                        className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Sample stagger case (prof. demo)
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-purple-700 uppercase">Stagger Pitch p (mm)</label>
                        <input type="number" name="stagger_p" value={inputs.stagger_p} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-purple-300 rounded-lg outline-none" />
                        <p className="text-[10px] text-purple-600 mt-1">Longitudinal stagger step (rupture zig-zag). Defaults from line pitch s when you switch to Staggered.</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-purple-700 uppercase">Stagger Gauge g (mm)</label>
                        <input type="number" name="stagger_g" value={inputs.stagger_g} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-purple-300 rounded-lg outline-none" />
                        <p className="text-[10px] text-purple-600 mt-1">Transverse spacing for the diagonal (rupture). Defaults from gauge g; edit if it differs from bolt row spacing.</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-purple-800 bg-purple-100/80 border border-purple-200 rounded-lg px-2 py-1.5">
                      If these fields are blank or zero, rupture uses pitch <span className="font-mono">s</span> and gauge <span className="font-mono">g</span> from the main bolt inputs above.
                    </p>
                  </div>
                )}

                {inputs.connection === 'Bolted' && (
                  <div className="md:col-span-2 lg:col-span-3 p-3 bg-sky-50 border border-sky-200 rounded-xl space-y-2">
                    <p className="text-xs font-bold text-sky-800 uppercase">Bolt layout geometry validation</p>
                    {inputs.holePattern === 'Straight' && boltGeometry.pattern === 'Straight' && (
                      <>
                        <p className="text-[11px] font-semibold text-sky-800">{boltGeometry.straight.title}</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-sky-900">
                          <div>Connected width b: <span className="font-mono">{boltGeometry.b.toFixed(2)} mm</span></div>
                          <div>Min edge e_min = 1.5dh: <span className="font-mono">{boltGeometry.eMin.toFixed(2)} mm</span></div>
                          <div>Min gauge g_min = 2.5d: <span className="font-mono">{boltGeometry.gMin.toFixed(2)} mm</span></div>
                          <div>Effective edge e_eff = max(e, e_min): <span className="font-mono">{boltGeometry.effectiveEdge.toFixed(2)} mm</span></div>
                          <div>Effective gauge g_eff = max(g, g_min): <span className="font-mono">{boltGeometry.effectiveGauge.toFixed(2)} mm</span></div>
                          <div>Required width 2e_eff + (n-1)g_eff: <span className="font-mono">{boltGeometry.straight.requiredWidth.toFixed(2)} mm</span></div>
                          <div>Maximum bolts in one straight cross-section n_max: <span className="font-mono">{boltGeometry.nMax}</span></div>
                        </div>
                        <p
                          className={`text-[11px] rounded px-2 py-1.5 ${
                            boltGeometry.invalid
                              ? 'text-rose-800 bg-rose-50 border border-rose-200'
                              : 'text-sky-700'
                          }`}
                        >
                          {boltGeometry.helper}
                        </p>
                        {!boltGeometry.invalid && (
                          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">Straight cross-section check: OK</p>
                        )}
                      </>
                    )}
                    {inputs.holePattern === 'Staggered' && boltGeometry.pattern === 'Staggered' && (
                      <>
                        <p className="text-[11px] font-semibold text-sky-800">{boltGeometry.stagger.title}</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-sky-900">
                          <div>Connected width b: <span className="font-mono">{boltGeometry.b.toFixed(2)} mm</span></div>
                          <div>Min edge e_min = 1.5dh: <span className="font-mono">{boltGeometry.eMin.toFixed(2)} mm</span></div>
                          <div>Min gauge g_min = 2.5d: <span className="font-mono">{boltGeometry.gMin.toFixed(2)} mm</span></div>
                          <div>Min pitch p_min = 2.5d: <span className="font-mono">{boltGeometry.stagger.pMin.toFixed(2)} mm</span></div>
                          <div>Stagger pitch p (input): <span className="font-mono">{boltGeometry.stagger.staggerP.toFixed(2)} mm</span></div>
                          <div>Line pitch s (input): <span className="font-mono">{boltGeometry.stagger.linePitch.toFixed(2)} mm</span></div>
                          <div>Effective edge e_eff: <span className="font-mono">{boltGeometry.effectiveEdge.toFixed(2)} mm</span></div>
                          <div>Effective gauge g_eff: <span className="font-mono">{boltGeometry.effectiveGauge.toFixed(2)} mm</span></div>
                          <div>Effective stagger pitch max(p, p_min): <span className="font-mono">{boltGeometry.stagger.pStaggerEff.toFixed(2)} mm</span></div>
                          <div>Effective line pitch max(s, p_min): <span className="font-mono">{boltGeometry.stagger.linePitchEff.toFixed(2)} mm</span></div>
                        </div>
                        <p
                          className={`text-[11px] rounded px-2 py-1.5 ${
                            boltGeometry.invalid
                              ? 'text-rose-800 bg-rose-50 border border-rose-200'
                              : 'text-sky-700'
                          }`}
                        >
                          {boltGeometry.helper}
                        </p>
                        <p className="text-[11px] text-indigo-800 bg-indigo-50 border border-indigo-100 rounded px-2 py-1.5">{boltGeometry.stagger.note}</p>
                        {!boltGeometry.invalid && (
                          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">Staggered spacing check: OK (rupture governed by path analysis below)</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">FY (MPA) - EUROCODE</label>
                  <input type="number" name="fy" value={inputs.fy} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">FU (MPA) - EUROCODE</label>
                  <input type="number" name="fu" value={inputs.fu} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                </div>

                <div className="space-y-1 md:col-span-2 lg:col-span-3 p-4 bg-slate-50 border border-slate-200 rounded-xl mt-2">
                  <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1 mb-3">
                    IS 8147 material properties (Table 1 / alloy data)
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 uppercase">FY (MPA) - IS 8147</label>
                      <input type="number" name="fyIS8147" value={inputs.fyIS8147} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 uppercase">FU (MPA) - IS 8147</label>
                      <input type="number" name="fuIS8147" value={inputs.fuIS8147} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Auto-filled from the selected IS 8147 alloy (characteristic / Table 1 style data). Not used in working-stress capacity formulas — those use Table 4 permissible stresses below.
                  </p>
                  {inputs.connection === 'Bolted' && inputs.sectionType === 'Single Angle' && (
                    <div className="mt-3 space-y-1">
                      <label className="text-xs font-semibold text-slate-700 uppercase">k factor (IS 8147 outstanding leg effectiveness)</label>
                      <input type="number" step="0.05" min="0" max="1" name="isKFactor" value={inputs.isKFactor} onChange={handleInputChange} className="w-full md:w-56 px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none" />
                      <p className="text-[10px] text-slate-600">k factor represents partial effectiveness of outstanding leg as per IS 8147.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-1 md:col-span-2 lg:col-span-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mt-2">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-xs font-bold text-blue-800 uppercase flex items-center gap-1">
                      PERMISSIBLE STRESSES - IS 8147 (TABLE 4)
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
                  
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-blue-700 uppercase">PERMISSIBLE TENSILE STRESS (σ_at) MPA - IS 8147 (TABLE 4)</label>
                    <input
                      type="number"
                      name="sigmaAtIS"
                      value={inputs.sigmaAtIS === null ? '' : inputs.sigmaAtIS}
                      onChange={handleInputChange}
                      readOnly={inputs.sigmaAtMode === 'Auto'}
                      placeholder={inputs.sigmaAtMode === 'Auto' ? 'Awaiting Table 4 mapping' : ''}
                      className={`w-full px-3 py-2 border border-blue-300 rounded-lg outline-none ${inputs.sigmaAtMode === 'Auto' ? 'bg-blue-100 text-blue-800 cursor-not-allowed placeholder:text-blue-500/80' : 'bg-white focus:ring-2 focus:ring-blue-500'}`}
                    />
                  </div>

                  <p className="text-[10px] text-blue-700 mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Material fy/fu values are stored separately. Permissible stresses must come from IS 8147 Table 4.
                  </p>
                  
                  {inputs.sigmaAtIS != null && inputs.sigmaAtIS >= inputs.fuIS8147 && (
                    <p className="text-[10px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3" /> Warning: σ_at should typically be less than FU (IS 8147 material).
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                        Aeff (IS 8147) mm²
                      </label>
                      <input type="number" value={derived.isAeff.toFixed(2)} readOnly className="w-full px-3 py-2 bg-emerald-100 border-2 border-emerald-300 rounded-lg text-emerald-900 outline-none font-mono text-lg cursor-not-allowed" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
                        Aeff (Eurocode) mm²
                      </label>
                      <input type="number" value={derived.aeff.toFixed(2)} readOnly className="w-full px-3 py-2 bg-emerald-100 border-2 border-emerald-300 rounded-lg text-emerald-900 outline-none font-mono text-lg cursor-not-allowed" />
                    </div>
                  </div>
                  <p className="text-xs text-emerald-800 mt-2">
                    IS rupture uses <span className="font-mono">Aeff_IS</span> = <span className="font-mono">{derived.isAeff.toFixed(2)} mm²</span>{' '}
                    {is8147AeffCaption(inputs.sectionType, inputs.connection, usesIsEffectiveArea)}.
                  </p>
                  
                  {inputs.connection === 'Bolted' && (
                    <div className="mt-4 p-3 bg-emerald-100/50 rounded-lg border border-emerald-200 space-y-4">
                      <h4 className="text-xs font-bold text-emerald-800 uppercase">Net-section rupture path analysis</h4>
                      {inputs.holePattern === 'Straight' && (
                        <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
                          Straight pattern: stagger correction is not applicable. Net width uses only straight deduction bn = b − n·dh (stagger pitch/gauge inputs are not used for An).
                        </p>
                      )}
                      {inputs.holePattern === 'Staggered' && (
                        <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
                          Staggered pattern: governing path is the minimum net area among candidate paths (straight vs zig-zag when diagonal geometry is active).
                        </p>
                      )}
                      <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                        Zig-zag correction applies only when stagger_p &gt; 0 and stagger_g &gt; 0.
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-emerald-900">
                        <div><span className="font-semibold">Hole pattern:</span> {inputs.holePattern}</div>
                        <div><span className="font-semibold">b_path:</span> {derived.connectedLegWidth.toFixed(2)} mm</div>
                        <div><span className="font-semibold">t:</span> {inputs.thickness} mm</div>
                        <div><span className="font-semibold">dh:</span> {derived.holeDia.toFixed(2)} mm</div>
                        <div><span className="font-semibold">n (holes on path):</span> {inputs.noOfHoles}</div>
                        {inputs.holePattern === 'Staggered' && (
                          <>
                            <div><span className="font-semibold">Stagger p (UI):</span> {inputs.stagger_p} mm</div>
                            <div><span className="font-semibold">Stagger g (UI):</span> {inputs.stagger_g} mm</div>
                            <div className="md:col-span-2">
                              <span className="font-semibold">Effective p, g (rupture):</span>{' '}
                              {(derived as any).effectiveStagger_p != null ? Number((derived as any).effectiveStagger_p).toFixed(2) : '—'} mm,{' '}
                              {(derived as any).effectiveStagger_g != null ? Number((derived as any).effectiveStagger_g).toFixed(2) : '—'} mm
                            </div>
                          </>
                        )}
                        {(inputs.sectionType === 'Single Angle' || inputs.sectionType === 'Double Angle') && (
                          <div><span className="font-semibold">Connected leg:</span> {inputs.connectedLeg}</div>
                        )}
                        {inputs.sectionType === 'Plate' && (
                          <div><span className="font-semibold">Plate width b:</span> {inputs.width} mm (rupture path; not leg-based)</div>
                        )}
                        <div><span className="font-semibold">β (EC after An):</span> {derived.beta.toFixed(3)}</div>
                      </div>

                      <div className="text-[10px] font-mono text-emerald-900 bg-slate-100 border border-slate-200 rounded-lg p-2 space-y-0.5">
                        <div className="font-sans font-semibold text-emerald-800 mb-1">Rupture debug</div>
                        <div>holePattern: {inputs.holePattern}</div>
                        <div>stagger_p (UI): {inputs.stagger_p}</div>
                        <div>stagger_g (UI): {inputs.stagger_g}</div>
                        <div>
                          stagger_p (effective):{' '}
                          {(derived as any).effectiveStagger_p != null ? Number((derived as any).effectiveStagger_p).toFixed(2) : '—'} mm
                        </div>
                        <div>
                          stagger_g (effective):{' '}
                          {(derived as any).effectiveStagger_g != null ? Number((derived as any).effectiveStagger_g).toFixed(2) : '—'} mm
                        </div>
                        <div>governing rupture path: {derived.criticalAnPath}</div>
                        <div>An (governing): {derived.an.toFixed(3)} mm²</div>
                      </div>

                      <div>
                        <h5 className="text-[11px] font-bold text-emerald-700 uppercase mb-1">Candidate Rupture Paths</h5>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-emerald-900">
                            <thead className="bg-emerald-200/50 text-emerald-800">
                              <tr>
                                <th className="px-2 py-1">Path ID</th>
                                <th className="px-2 py-1">Path Type</th>
                                <th className="px-2 py-1">Formula</th>
                                <th className="px-2 py-1 text-right">Hole Deduction</th>
                                <th className="px-2 py-1 text-right">Stagger Addition</th>
                                <th className="px-2 py-1 text-right">bn (mm)</th>
                                <th className="px-2 py-1 text-right">An (mm²)</th>
                                <th className="px-2 py-1 text-center">Governing?</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-200/50">
                              {derived.rupturePaths.map((rp: any, i: number) => (
                                <tr key={i} className={rp.governing ? 'bg-emerald-200/50 font-semibold' : ''}>
                                  <td className="px-2 py-1">{rp.id}</td>
                                  <td className="px-2 py-1">{rp.type}</td>
                                  <td className="px-2 py-1 font-mono">{rp.formula}</td>
                                  <td className="px-2 py-1 text-right">{rp.holeDeductionTerm.toFixed(3)}</td>
                                  <td className="px-2 py-1 text-right">{rp.staggerAdditionTerm.toFixed(3)}</td>
                                  <td className="px-2 py-1 text-right">{rp.bn.toFixed(3)}</td>
                                  <td className="px-2 py-1 text-right">{rp.an.toFixed(3)}</td>
                                  <td className="px-2 py-1 text-center">{rp.governing ? 'Yes' : 'No'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md p-2">
                        <div><span className="font-semibold">Governing rupture path:</span> {derived.criticalAnPath}</div>
                        <div><span className="font-semibold">Governing net area An:</span> {derived.an.toFixed(3)} mm²</div>
                        <div>
                          <span className="font-semibold">IS 8147 effective area:</span> {derived.isAeff.toFixed(3)} mm²{' '}
                          {usesIsEffectiveArea
                            ? `(Aeff_IS = a1 + k×a2, k=${derived.isK.toFixed(3)})`
                            : is8147AeffCaption(inputs.sectionType, inputs.connection, false)}
                        </div>
                        <div><span className="font-semibold">Eurocode effective area:</span> {derived.aeff.toFixed(3)} mm² = β × An = {derived.beta.toFixed(3)} × {derived.an.toFixed(3)}</div>
                        <div className="mt-1 text-emerald-700">
                          {inputs.holePattern === 'Straight'
                            ? 'Straight pattern: single straight net-section path; no stagger terms in bn.'
                            : 'Staggered pattern: candidate paths include straight and zig-zag (when applicable); governing rupture uses minimum An among all.'}
                        </div>
                      </div>

                      {straightVsStaggerRuptureCompare && (
                        <div className="rounded-lg border border-emerald-300 bg-white p-3 space-y-3">
                          <h5 className="text-[11px] font-bold text-emerald-800 uppercase">Straight vs Staggered comparison</h5>
                          <p className="text-[10px] text-emerald-700">
                            Same bolt layout and material; only hole pattern is toggled for this table. Eurocode rupture uses current β (unchanged vs pattern). Shear-lag β charts above depend on x/L only, not hole pattern.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-emerald-900">
                            <div className="border border-emerald-200 rounded-lg p-2 bg-emerald-50/50">
                              <div className="font-semibold text-emerald-800 mb-1">Straight</div>
                              <div>An: {straightVsStaggerRuptureCompare.straightAn.toFixed(3)} mm²</div>
                              <div>Nu,Rd (EC): {straightVsStaggerRuptureCompare.straightRuptureEc.toFixed(3)} kN</div>
                              <div>Path: {straightVsStaggerRuptureCompare.straightPath}</div>
                            </div>
                            <div className="border border-emerald-200 rounded-lg p-2 bg-emerald-50/50">
                              <div className="font-semibold text-emerald-800 mb-1">Staggered</div>
                              <div>An: {straightVsStaggerRuptureCompare.staggerAn.toFixed(3)} mm²</div>
                              <div>Nu,Rd (EC): {straightVsStaggerRuptureCompare.staggerRuptureEc.toFixed(3)} kN</div>
                              <div>Path: {straightVsStaggerRuptureCompare.staggerPath}</div>
                            </div>
                          </div>
                          <div className="h-44 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={[
                                  { name: 'Straight An', value: straightVsStaggerRuptureCompare.straightAn },
                                  { name: 'Staggered An', value: straightVsStaggerRuptureCompare.staggerAn },
                                ]}
                                margin={{ top: 8, right: 12, left: 8, bottom: 28 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} height={40} />
                                <YAxis tick={{ fontSize: 10 }} label={{ value: 'An (mm²)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                <Tooltip formatter={(v: number) => [`${Number(v).toFixed(2)} mm²`, 'An']} />
                                <Bar dataKey="value" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={56} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {results.bsPathsList.length > 0 && (
                        <div>
                          <h5 className="text-[11px] font-bold text-emerald-700 uppercase mb-1">Candidate Block Shear Paths</h5>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-emerald-900">
                              <thead className="bg-emerald-200/50 text-emerald-800">
                                <tr>
                                  <th className="px-2 py-1">Path ID</th>
                                  <th className="px-2 py-1">Path Type</th>
                                  <th className="px-2 py-1 text-right">Avg</th>
                                  <th className="px-2 py-1 text-right">Avn</th>
                                  <th className="px-2 py-1 text-right">Atg</th>
                                  <th className="px-2 py-1 text-right">Atn</th>
                                  <th className="px-2 py-1 text-right">IS 8147 (kN)</th>
                                  <th className="px-2 py-1 text-right">Eurocode (kN)</th>
                                  <th className="px-2 py-1 text-center">Gov IS?</th>
                                  <th className="px-2 py-1 text-center">Gov EC?</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-emerald-200/50">
                                {results.bsPathsList.map((bp: any, i: number) => (
                                  <tr key={i} className={(bp.isGovEc || bp.isGovIs) ? 'bg-emerald-200/50' : ''}>
                                    <td className="px-2 py-1">{bp.id}</td>
                                    <td className="px-2 py-1">{bp.type}</td>
                                    <td className="px-2 py-1 text-right">{bp.Avg.toFixed(3)}</td>
                                    <td className="px-2 py-1 text-right">{bp.Avn.toFixed(3)}</td>
                                    <td className="px-2 py-1 text-right">{bp.Atg.toFixed(3)}</td>
                                    <td className="px-2 py-1 text-right">{bp.Atn.toFixed(3)}</td>
                                    <td className="px-2 py-1 text-right">{bp.is_bs.toFixed(3)}</td>
                                    <td className="px-2 py-1 text-right">{bp.ec_bs.toFixed(3)}</td>
                                    <td className="px-2 py-1 text-center">{bp.isGovIs ? 'Yes' : 'No'}</td>
                                    <td className="px-2 py-1 text-center">{bp.isGovEc ? 'Yes' : 'No'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <p className="text-[11px] text-emerald-700">
                        {inputs.holePattern === 'Straight'
                          ? 'Straight bolt pattern: rupture uses only the straight net-section deduction; stagger correction does not apply.'
                          : 'Staggered bolt pattern: straight and zig-zag rupture paths are compared when diagonal geometry is defined; the governing path is the minimum net area (zig-zag does not automatically govern).'}
                      </p>
                    </div>
                  )}
                </div>

              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200">
                <h2 className="text-lg font-semibold">Eurocode Shear Lag Factor (β)</h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Shear lag effect depends on eccentricity (x/L ratio). These β charts do not change with Straight vs Staggered hole pattern.
                </p>
              </div>
              <div className="p-6 space-y-4">
                {inputs.connection === 'Bolted' && (
                  <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
                    <input
                      type="checkbox"
                      name="showShearLagEffect"
                      checked={inputs.showShearLagEffect}
                      onChange={handleInputChange}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-indigo-900">Show shear lag effect</span>
                    <span className="text-xs text-indigo-600">(OFF → β = 1 applied; ON → use formula below)</span>
                  </label>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label
                      className="text-xs font-semibold text-neutral-500 uppercase flex items-center gap-1"
                      title="Distance between centroid and connection line"
                    >
                      Eccentricity x (mm)
                      <Info className="w-3.5 h-3.5 text-neutral-400" aria-hidden />
                    </label>
                    <input
                      type="number"
                      name="x"
                      value={inputs.x}
                      onChange={handleInputChange}
                      title="Distance between centroid and connection line"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-neutral-500 uppercase">Connection Length L (mm)</label>
                    <input type="number" name="L" value={inputs.L} onChange={handleInputChange} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg outline-none" />
                  </div>
                </div>

                {inputs.connection === 'Bolted' && (
                  <div className="rounded-lg border border-indigo-100 bg-white px-3 py-2 space-y-1">
                    <p className="text-[10px] font-semibold uppercase text-indigo-600">Live formula</p>
                    <p className="text-sm font-mono text-indigo-900 leading-snug">{liveShearLagFormula.line}</p>
                    {inputs.sectionType === 'Single Angle' && (
                      <p className="text-[11px] text-indigo-700">Single angle (bolted): β = 1 − x/L (values capped at β ≥ 0).</p>
                    )}
                  </div>
                )}

                <div className="space-y-1 pt-2 border-t border-neutral-100">
                  <label className="text-xs font-bold text-indigo-800 uppercase flex justify-between items-center gap-2 flex-wrap">
                    <span>β applied to Aeff (Eurocode)</span>
                    {!inputs.showShearLagEffect && inputs.connection === 'Bolted' ? (
                      <span className="text-amber-700 flex items-center gap-1 text-[10px] font-semibold normal-case">
                        <AlertCircle className="w-3 h-3" /> Shear lag effect OFF (β = 1)
                      </span>
                    ) : derived.beta >= 0.999 && inputs.connection === 'Bolted' ? (
                      <span className="text-amber-600 flex items-center gap-1 text-[10px] font-semibold normal-case">
                        <AlertCircle className="w-3 h-3" /> No reduction (β ≈ 1)
                      </span>
                    ) : null}
                  </label>
                  <input type="number" value={derived.beta.toFixed(3)} readOnly className="w-full px-3 py-2 bg-indigo-50 border-2 border-indigo-200 rounded-lg font-mono text-lg text-indigo-900 outline-none cursor-not-allowed" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-xs text-indigo-800">
                    <div>
                      <span className="font-semibold">Model β (from x/L):</span> {derived.betaModel.toFixed(3)}
                    </div>
                    <div>
                      <span className="font-semibold">x/L:</span> {inputs.L > 0 ? (Number(inputs.x) / Number(inputs.L)).toFixed(3) : '0.000'}
                    </div>
                  </div>
                  <p className="text-[10px] text-indigo-700 mt-2">
                    {isDoubleAngleBolted ? (
                      <>Symmetric double-angle bolted connection: β is fixed at 1.0 (no shear lag reduction using x/L).</>
                    ) : isPlateBolted ? (
                      <>
                        Plate: shear lag applies only with eccentricity x along the member. Concentric/symmetric (x = 0) → β = 1, Aeff = An. Not based on angle leg logic.
                      </>
                    ) : inputs.connection === 'Bolted' ? (
                      <>Eurocode shear lag: β = max(0, 1 − x/L), capped at β ≤ 1. At x = 0, β = 1.</>
                    ) : (
                      <>Welded connection: β = 1.0 (no bolted shear lag model applied here).</>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-indigo-800 uppercase">Aeff (Eurocode) mm²</label>
                  <input type="number" value={derived.aeff.toFixed(2)} readOnly className="w-full px-3 py-2 bg-indigo-50 border-2 border-indigo-200 rounded-lg font-mono text-lg text-indigo-900 outline-none cursor-not-allowed" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200">
                <h2 className="text-lg font-semibold">Shear Lag Visualization (Eurocode)</h2>
                <p className="text-xs text-neutral-500 mt-1">β vs eccentricity ratio x/L</p>
              </div>
              <div className="p-6 space-y-5">
                {isDoubleAngleBolted && (
                  <p className="text-xs text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-2">
                    Sliders for x and L are disabled for symmetric double-angle: β stays 1.0 and does not follow 1 − x/L. Adjust x/L in the main form above if needed for other uses.
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label
                      className="text-xs font-semibold text-neutral-600 uppercase flex items-center gap-1"
                      title="Distance between centroid and connection line"
                    >
                      Eccentricity x (mm): {Number(inputs.x).toFixed(1)}
                      <Info className="w-3.5 h-3.5 text-neutral-400" aria-hidden />
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={inputs.x}
                      disabled={isDoubleAngleBolted}
                      title="Distance between centroid and connection line"
                      onChange={(e) => setInputs((prev) => ({ ...prev, x: Number(e.target.value) }))}
                      className={`w-full ${isDoubleAngleBolted ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-neutral-600 uppercase">Connection length L (mm): {Number(inputs.L).toFixed(1)}</label>
                    <input
                      type="range"
                      min={10}
                      max={200}
                      step={1}
                      value={inputs.L}
                      disabled={isDoubleAngleBolted}
                      onChange={(e) => setInputs((prev) => ({ ...prev, L: Number(e.target.value) }))}
                      className={`w-full ${isDoubleAngleBolted ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <p className="text-xs uppercase font-semibold text-indigo-700">Current x / L</p>
                    <p className="text-xl font-mono text-indigo-900">{currentXOverL.toFixed(3)}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <p className="text-xs uppercase font-semibold text-emerald-700">Current β (same as calculation)</p>
                    <p className="text-xl font-mono text-emerald-900">{derived.beta.toFixed(3)}</p>
                  </div>
                </div>

                {isDoubleAngleBolted && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    Double-angle symmetric connection: β = 1.0 — x/L does not reduce β (see flat line on chart).
                  </p>
                )}
                {inputs.connection === 'Bolted' && !isDoubleAngleBolted && Number(inputs.x) === 0 && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    {isPlateBolted
                      ? 'Concentric plate (x = 0): β = 1, Aeff = An. Enter x > 0 for an eccentric load path and shear lag reduction.'
                      : 'Eccentricity x = 0: β = 1 (no shear lag).'}
                  </p>
                )}
                {inputs.connection === 'Bolted' && !isDoubleAngleBolted && currentXOverL > 0.5 && derived.beta < 0.95 && (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    High shear lag effect
                  </p>
                )}

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={shearLagCurveData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="ratio" label={{ value: 'Eccentricity ratio x/L', position: 'insideBottom', offset: -4 }} tick={{ fill: '#6b7280' }} />
                      <YAxis domain={[0, 1]} label={{ value: 'Beta (β)', angle: -90, position: 'insideLeft' }} tick={{ fill: '#6b7280' }} />
                      <Tooltip
                        formatter={(value: any, name: any) => [`${Number(value).toFixed(3)}`, name]}
                        labelFormatter={(label) => {
                          const rr = Number(label);
                          const Lref = 100;
                          const b = getBeta(inputs.sectionType, rr * Lref, Lref, inputs.connection);
                          return `x/L = ${rr.toFixed(3)} | β = ${b.toFixed(3)}`;
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="beta"
                        stroke="#4f46e5"
                        strokeWidth={3}
                        dot={false}
                        name={
                          isDoubleAngleBolted ? 'β = 1 (double angle)' : isPlateBolted ? 'β (plate, eccentric path)' : 'β = 1 − x/L'
                        }
                      />
                      <ReferenceDot
                        x={Math.max(0, Math.min(1, currentXOverL))}
                        y={derived.beta}
                        r={6}
                        fill="#dc2626"
                        stroke="#ffffff"
                        strokeWidth={2}
                        label={{ value: `Current β = ${derived.beta.toFixed(3)}`, position: 'top', fill: '#991b1b', fontSize: 11 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-xs text-neutral-600 font-mono bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                  {isDoubleAngleBolted
                    ? 'β = 1.0 (symmetric double angle)'
                    : isPlateBolted
                      ? 'Plate: β = max(0, min(1 − x/L, 1)) when x > 0; x = 0 → β = 1'
                      : 'β = max(0, min(1 − x/L, 1))'}
                </p>

                <p className="text-sm text-neutral-700">
                  {isDoubleAngleBolted
                    ? 'Symmetric double-angle connections use β = 1.0 (horizontal line on chart).'
                    : isPlateBolted
                      ? 'For plates, use x = 0 for a concentric connection (β = 1). Shear lag reduction applies only when you enter eccentricity x for an offset load path.'
                      : 'Beta decreases as eccentricity increases due to shear lag.'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200">
                <h2 className="text-lg font-semibold">Effect of Shear Lag on Tension Capacity</h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Eurocode rupture Nu,Rd = (fu × β × An) / γM2 — other inputs fixed; x varies 0–50 mm with L = 100 mm for this chart. An (and this curve) is independent of Straight vs Staggered; use the comparison card under rupture analysis for net-area pattern effects.
                </p>
              </div>
              <div className="p-6 space-y-4">
                {shearLagRuptureGraphData.length === 0 ? (
                  <p className="text-sm text-neutral-600">Enter valid geometry and net area An to plot rupture vs x/L.</p>
                ) : (
                  <>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={shearLagRuptureGraphData} margin={{ top: 12, right: 20, left: 8, bottom: 28 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis
                            dataKey="ratio"
                            type="number"
                            domain={[0, 0.5]}
                            tickFormatter={(v) => v.toFixed(2)}
                            label={{ value: 'Eccentricity ratio x/L (L = 100 mm, x = 0…50 mm)', position: 'insideBottom', offset: -4 }}
                            tick={{ fill: '#6b7280' }}
                          />
                          <YAxis
                            label={{ value: 'Rupture strength Nu,Rd (kN)', angle: -90, position: 'insideLeft' }}
                            tick={{ fill: '#6b7280' }}
                          />
                          <Tooltip
                            formatter={(value: number, name: string) => [`${Number(value).toFixed(3)} kN`, name]}
                            labelFormatter={(label) => `x/L = ${Number(label).toFixed(3)}`}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="ruptureNoSl"
                            stroke="#94a3b8"
                            strokeWidth={2}
                            dot={false}
                            name="Without shear lag (β = 1)"
                          />
                          <Line
                            type="monotone"
                            dataKey="ruptureSl"
                            stroke="#4f46e5"
                            strokeWidth={3}
                            dot={false}
                            name="With shear lag (β from model, e.g. β = 1 − x/L for single angle)"
                          />
                          {shearLagRuptureCurrentPoint && (
                            <ReferenceDot
                              x={shearLagRuptureCurrentPoint.ratio}
                              y={shearLagRuptureCurrentPoint.ruptureSl}
                              r={6}
                              fill="#dc2626"
                              stroke="#ffffff"
                              strokeWidth={2}
                              label={{
                                value: `Current (x=${Math.min(50, Math.max(0, Number(inputs.x))).toFixed(0)} mm)`,
                                position: 'top',
                                fill: '#991b1b',
                                fontSize: 11,
                              }}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-sm text-neutral-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <span className="font-semibold">Observation:</span> As eccentricity increases, effective strength reduces (with-shear-lag curve vs horizontal β = 1).
                    </p>
                  </>
                )}
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
                      <li><strong>Rupture:</strong> P_u = σ_at × Aeff_IS (same Table 4 σ_at as yield)</li>
                      <li className="font-mono text-emerald-700">Substituted: P_u = {derived.isAeff.toFixed(2)} × {sigmaAtDisp} / 1000 = {inputs.sigmaAtIS == null ? '—' : results.is8147.rupture.toFixed(2)} kN</li>
                      {usesIsEffectiveArea && (
                        <li className="text-xs text-neutral-600">Aeff_IS = a1 + k × a2, with k = {derived.isK.toFixed(3)}.</li>
                      )}
                      {!usesIsEffectiveArea && inputs.sectionType === 'Double Angle' && inputs.connection === 'Bolted' && (
                        <li className="text-xs text-neutral-600">Double-angle symmetric bolted: Aeff_IS = An (no k-factor).</li>
                      )}
                      {!usesIsEffectiveArea && inputs.sectionType === 'Plate' && (
                        <li className="text-xs text-neutral-600">Plate: Aeff_IS = An.</li>
                      )}
                      <li className="text-blue-700">Note: σ_at is the single Table 4 permissible tensile stress.</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-900 mb-2">Eurocode EN 1999 (Limit State)</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Yield:</strong> N_pl,Rd = (Ag × fy) / γM0</li>
                      <li><strong>Rupture:</strong> N_u,Rd = (fu × Aeff) / γM2</li>
                      <li><strong>Effective Area:</strong> Aeff = β × An</li>
                      <li className="font-mono text-indigo-700">Substituted: N_u,Rd = ({inputs.fu.toFixed(2)} × {derived.aeff.toFixed(2)}) / {inputs.gammaM2.toFixed(2)} / 1000 = {results.eurocode.rupture.toFixed(2)} kN</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-900 mb-2">Block Shear</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>IS 8147 (Adopted from IS 800:2007):</strong> min[ (Avg × σ_at)/√3 + (0.9 × Ant × σ_at), (0.9 × Anv × σ_at)/√3 + (Atg × σ_at) ] (same σ_at)</li>
                      <li><strong>Eurocode (Limit State):</strong> Veff,Rd = (fu × Ant) / γM2 + (fy × Anv) / (√3 × γM0)</li>
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
                {inputs.sigmaAtIS == null && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Table 4 permissible tensile stress σ_at is not set. Enter a value under Manual, or use Auto with a mapped alloy. IS capacities use 0 when σ_at is missing.
                  </p>
                )}
                <ResultRow label="Yield Strength" value={results.is8147.yield} unit="kN" isMin={nearEqual(results.is8147.yield, results.is8147.final)} />
                <ResultRow label="Rupture Strength" value={results.is8147.rupture} unit="kN" isMin={nearEqual(results.is8147.rupture, results.is8147.final)} />
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 font-mono space-y-1">
                  <div className="font-semibold text-slate-800">IS 8147 Rupture Calculation</div>
                  <div>P_u = Aeff_IS × σ_at</div>
                  <div>= {derived.isAeff.toFixed(2)} × {sigmaAtDisp}</div>
                  <div>= {inputs.sigmaAtIS == null ? '—' : results.is8147.rupture.toFixed(2)} kN</div>
                  <div className="font-sans text-[11px] text-slate-600">
                    {usesIsEffectiveArea
                      ? `Where Aeff_IS = a1 + a2 × k, with k = ${derived.isK.toFixed(3)}`
                      : inputs.sectionType === 'Double Angle'
                        ? 'Where Aeff_IS = An (symmetric double angle).'
                        : inputs.sectionType === 'Plate'
                          ? 'Where Aeff_IS = An (plate).'
                          : 'Where Aeff_IS = An.'}
                  </div>
                </div>
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
                    <span className={`text-base font-mono font-medium ${results.is8147.blockShear > 0 && nearEqual(results.is8147.blockShear, results.is8147.final) ? 'text-rose-600 font-bold' : 'text-neutral-900'}`}>
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
                {inputs.connection === 'Bolted' && (
                  <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Shear lag factor β</p>
                      <p className="text-3xl font-mono font-bold text-indigo-950 tabular-nums">{derived.beta.toFixed(3)}</p>
                      {!inputs.showShearLagEffect && (
                        <p className="text-[11px] text-amber-800 mt-1">
                          Effect OFF — β applied = 1.0 (model β = {derived.betaModel.toFixed(3)})
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-indigo-800 font-mono text-right">
                      <div>
                        Aeff = β × An = {derived.beta.toFixed(3)} × {derived.an.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-indigo-600 mt-1">Nu,Rd uses this Aeff for rupture</div>
                    </div>
                  </div>
                )}
                {inputs.connection === 'Bolted' && inputs.showShearLagEffect && derived.beta < 0.999 && (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    Shear lag reduces effective strength.
                  </p>
                )}
                <ResultRow label="Yield Strength (Npl,Rd)" value={results.eurocode.yield} unit="kN" isMin={nearEqual(results.eurocode.yield, results.eurocode.final)} />
                <ResultRow label="Rupture Strength (Nu,Rd)" value={results.eurocode.rupture} unit="kN" isMin={nearEqual(results.eurocode.rupture, results.eurocode.final)} />
                <ResultRow label="Block Shear" value={results.eurocode.blockShear} unit="kN" isMin={results.eurocode.blockShear > 0 && nearEqual(results.eurocode.blockShear, results.eurocode.final)} fallback="N/A" muted={results.eurocode.blockShear === 0} />
                
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
                  <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">N_u,Rd = (Aeff × fu) / γM2</span>
                  <span className="text-xs text-neutral-500 mt-1">
                    Where Aeff = An × β, with β = {derived.beta.toFixed(3)}
                    {isDoubleAngleBolted ? ' (symmetric double angle: β = 1).' : inputs.connection === 'Bolted' ? ' (shear lag: β = max(0, min(1 − x/L, 1)) unless noted above).' : ' (welded: β = 1 here).'}
                  </span>
                  <span className="font-mono text-xs text-indigo-700 mt-1">Substituted: ({inputs.fu.toFixed(2)} × {derived.aeff.toFixed(2)}) / {inputs.gammaM2.toFixed(2)} / 1000 = {results.eurocode.rupture.toFixed(2)} kN</span>
                </li>
                {inputs.connection === 'Bolted' && (
                  <li className="flex flex-col">
                    <span className="font-medium text-neutral-900">Block Tearing (V_eff,Rd)</span>
                    <span className="text-neutral-500 text-xs mt-1">Clause 8.5.6 (2)</span>
                    <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">V_eff,Rd = (fu * Ant) / γM2 + (fy * Anv) / (√3 * γM0)</span>
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
                  <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">P = Aeff_IS * σ_at</span>
                  {usesIsEffectiveArea && (
                    <span className="text-xs text-neutral-500 mt-1">
                      Where Aeff_IS = a1 + a2 * k (k = {derived.isK.toFixed(3)})
                    </span>
                  )}
                  {!usesIsEffectiveArea && (
                    <span className="text-xs text-neutral-500 mt-1">
                      {inputs.sectionType === 'Double Angle'
                        ? 'Where Aeff_IS = An (symmetric double angle).'
                        : inputs.sectionType === 'Plate'
                          ? 'Where Aeff_IS = An (plate).'
                          : 'Where Aeff_IS = An.'}
                    </span>
                  )}
                  <span className="font-mono text-xs text-emerald-700 mt-1">Substituted: {derived.isAeff.toFixed(2)} × {sigmaAtDisp} / 1000 = {inputs.sigmaAtIS == null ? '—' : results.is8147.rupture.toFixed(2)} kN</span>
                </li>
                {inputs.connection === 'Bolted' && (
                  <li className="flex flex-col">
                    <span className="font-medium text-neutral-900">Block Shear</span>
                    <span className="text-neutral-500 text-xs mt-1">IS 800:2007 Clause 6.4.1 (Adopted)</span>
                    <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">T_db1 = (Avg * σ_at) / √3 + 0.9 * Ant * σ_at</span>
                    <span className="font-mono bg-neutral-50 p-2 rounded mt-1 border border-neutral-100">T_db2 = 0.9 * Anv * σ_at / √3 + Atg * σ_at</span>
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
                  </select>
                </div>
              </div>

              <div className="h-[520px] w-full mt-8">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={parametricData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <defs>
                      <linearGradient id="ecFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="isFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e11d48" stopOpacity={0.16} />
                        <stop offset="95%" stopColor="#e11d48" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="paramValue" 
                      label={{
                        value:
                          paramVar === 'thickness'
                            ? 'Thickness (mm)'
                            : paramVar === 'width'
                              ? inputs.sectionType === 'Plate'
                                ? 'Width (mm)'
                                : 'Leg length (mm, both legs)'
                              : 'Bolt diameter (mm)',
                        position: 'insideBottom',
                        offset: -10,
                      }} 
                      tick={{ fill: '#6b7280' }}
                      tickMargin={10}
                    />
                    <YAxis 
                      label={{ value: 'Capacity (kN)', angle: -90, position: 'insideLeft', offset: -10 }} 
                      tick={{ fill: '#6b7280' }}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                      formatter={(value, name) => {
                        if (name === 'Gap (EC - IS)') return [`${Number(value).toFixed(2)} kN`, name];
                        return [`${Number(value).toFixed(2)} kN`, name];
                      }}
                      labelFormatter={(label) => {
                        const dim =
                          paramVar === 'thickness'
                            ? 'Thickness'
                            : paramVar === 'width'
                              ? inputs.sectionType === 'Plate'
                                ? 'Width'
                                : 'Leg'
                              : 'Diameter';
                        return `${dim}: ${label}`;
                      }}
                      itemSorter={(item) => {
                        const order: Record<string, number> = { 'Eurocode EN 1999': 0, 'IS 8147:1976': 1, 'Gap (EC - IS)': 2 };
                        return order[item.name as string] ?? 99;
                      }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <ReferenceLine
                      x={Number(inputs[paramVar].toFixed?.(2) ?? inputs[paramVar])}
                      stroke="#6b7280"
                      strokeDasharray="4 4"
                      label={{ value: 'Current input', position: 'insideTopRight', fill: '#4b5563', fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="Eurocode" stroke="none" fill="url(#ecFill)" fillOpacity={1} legendType="none" />
                    <Area type="monotone" dataKey="IS8147" stroke="none" fill="url(#isFill)" fillOpacity={1} legendType="none" />
                    <Line type="monotone" dataKey="Eurocode" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} name="Eurocode EN 1999" />
                    <Line type="monotone" dataKey="IS8147" stroke="#e11d48" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} name="IS 8147:1976" />
                    <Line type="monotone" dataKey="gap" stroke="#0f766e" strokeDasharray="6 4" strokeWidth={2} dot={false} name="Gap (EC - IS)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                  <h3 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    How to read this graph
                  </h3>
                  <p className="text-sm text-indigo-800">
                    The solid lines show the governing design capacity for each code while varying one parameter around the current input. 
                    The teal dashed line shows absolute gap (Eurocode - IS 8147). 
                    The vertical dashed marker indicates your current input value ({inputs[paramVar]}).
                    {paramVar === 'thickness' && " For thickness sweeps, alloy-dependent strengths can change with thickness limits, so local bends in the curve are expected."}
                  </p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                  <h3 className="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-2">
                    <Presentation className="w-4 h-4" />
                    Presentation-ready insights
                  </h3>
                  {parametricInsight && (
                    <ul className="text-sm text-emerald-800 space-y-1">
                      <li>• Sweep range: {parametricInsight.rangeLabel}</li>
                      <li>• Eurocode capacity band: {parametricInsight.ecMin.toFixed(2)} to {parametricInsight.ecMax.toFixed(2)} kN</li>
                      <li>• IS 8147 capacity band: {parametricInsight.isMin.toFixed(2)} to {parametricInsight.isMax.toFixed(2)} kN</li>
                      <li>• Gap (EC - IS): min {parametricInsight.minG.toFixed(2)} kN, max {parametricInsight.maxG.toFixed(2)} kN, mean {parametricInsight.avgG.toFixed(2)} kN</li>
                      <li>• {parametricInsight.dominance}</li>
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function pathFromHash(): string {
  if (typeof window === 'undefined') return '/';
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
  return raw || '/';
}

function useHashRoute() {
  const [route, setRoute] = useState(pathFromHash);
  useEffect(() => {
    const onHash = () => setRoute(pathFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  if (route === 'alloy-mapping') {
    return <AlloyMappingPage />;
  }
  return <TensionMemberCalculator />;
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
