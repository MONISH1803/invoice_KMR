// Single source of truth for Eurocode EN 1999 and IS 8147 alloy datasets (used by calculator + alloy mapping page).

export const EUROCODE_ALLOYS = [
  // Eurocode EN 1999-1-1 Table 3.2a thickness limits + characteristic strengths (sheet/strip/plate)
  // NOTE: For alloy dropdown groups that contain multiple tempers (e.g. H14/H24/H34), we use the conservative (lower) fo
  // and the conservative (lower) HAZ reduction factor rho_o from the table cell, and we apply the EC9 max thickness limit.
  { id: '3004-H14', name: '3004-H14/H24/H34', maxThickness: 6.13, getProps: () => { return { fo: 180, fu: 170, rho_o: 0.42, rho_u: 0.70 }; } },
  { id: '3004-H16', name: '3004-H16/H26/H36', maxThickness: 4.13, getProps: () => { return { fo: 200, fu: 190, rho_o: 0.38, rho_u: 0.65 }; } },
  { id: '3005-H14', name: '3005-H14/H24', maxThickness: 6.13, getProps: () => { return { fo: 150, fu: 130, rho_o: 0.37, rho_u: 0.68 }; } },
  { id: '3005-H16', name: '3005-H16/H26', maxThickness: 4.13, getProps: () => { return { fo: 175, fu: 160, rho_o: 0.32, rho_u: 0.59 }; } },
  { id: '3103-H14', name: '3103-H14/H24', maxThickness: 25, getProps: () => { return { fo: 120, fu: 110, rho_o: 0.37, rho_u: 0.64 }; } },
  { id: '3103-H16', name: '3103-H16/H26', maxThickness: 4, getProps: () => { return { fo: 145, fu: 135, rho_o: 0.30, rho_u: 0.56 }; } },
  { id: '5005-O', name: '5005/5005A-O/H111', maxThickness: 50, getProps: (t: number, sectionType: string) => { return { fo: 35, fu: 100, rho_o: 1.0, rho_u: 1.0 }; } },
  { id: '5005-H12', name: '5005/5005A-H12/H22/H32', maxThickness: 12.5, getProps: () => { return { fo: 95, fu: 80, rho_o: 0.46, rho_u: 0.80 }; } },
  { id: '5005-H14', name: '5005/5005A-H14/H24/H34', maxThickness: 12.5, getProps: () => { return { fo: 120, fu: 110, rho_o: 0.37, rho_u: 0.69 }; } },
  { id: '5049-O', name: '5049-O/H111', maxThickness: 100, getProps: (t: number, sectionType: string) => { return { fo: 80, fu: 190, rho_o: 1.0, rho_u: 1.0 }; } },
  { id: '5049-H14', name: '5049-H14/H24/H34', maxThickness: 25, getProps: () => { return { fo: 190, fu: 160, rho_o: 0.53, rho_u: 0.79 }; } },
  { id: '5052-H12', name: '5052-H12/H22/H32', maxThickness: 40, getProps: () => { return { fo: 160, fu: 130, rho_o: 0.50, rho_u: 0.81 }; } },
  { id: '5052-H14', name: '5052-H14/H24/H34', maxThickness: 25, getProps: () => { return { fo: 180, fu: 150, rho_o: 0.44, rho_u: 0.74 }; } },
  { id: '5083-O', name: '5083-O/H111', maxThickness: 80, getProps: (t: number, sectionType: string) => { if (t <= 50) return { fo: 125, fu: 275, rho_o: 1.0, rho_u: 1.0 }; return { fo: 115, fu: 270, rho_o: 1.0, rho_u: 1.0 }; } },
  { id: '5083-H12', name: '5083-H12/H22/H32', maxThickness: 40, getProps: () => { return { fo: 250, fu: 215, rho_o: 0.62, rho_u: 0.90 }; } },
  { id: '5083-H14', name: '5083-H14/H24/H34', maxThickness: 25, getProps: () => { return { fo: 280, fu: 250, rho_o: 0.55, rho_u: 0.81 }; } },
  { id: '5454-O', name: '5454-O/H111', maxThickness: 80, getProps: (t: number, sectionType: string) => { return { fo: 85, fu: 215, rho_o: 1.0, rho_u: 1.0 }; } },
  { id: '5454-H14', name: '5454-H14/H24/H34', maxThickness: 25, getProps: () => { return { fo: 220, fu: 200, rho_o: 0.48, rho_u: 0.80 }; } },
  { id: '5754-O', name: '5754-O/H111', maxThickness: 100, getProps: (t: number, sectionType: string) => { return { fo: 80, fu: 190, rho_o: 1.0, rho_u: 1.0 }; } },
  { id: '5754-H14', name: '5754-H14/H24/H34', maxThickness: 25, getProps: () => { return { fo: 190, fu: 160, rho_o: 0.53, rho_u: 0.79 }; } },
  { id: '6005A-T4', name: '6005A-T4', getProps: (t: number, sectionType: string) => { return { fo: 110, fu: 180, rho_o: 0.82, rho_u: 0.72 }; } },
  { id: '6005A-T6', name: '6005A-T6', getProps: (t: number, sectionType: string) => { if (t <= 5) return { fo: 215, fu: 255, rho_o: 0.53, rho_u: 0.65 }; return { fo: 200, fu: 250, rho_o: 0.58, rho_u: 0.66 }; } },
  { id: '6060-T4', name: '6060-T4', getProps: (t: number, sectionType: string) => { return { fo: 60, fu: 120, rho_o: 1.0, rho_u: 0.83 }; } },
  { id: '6060-T5', name: '6060-T5', getProps: (t: number, sectionType: string) => { return { fo: 120, fu: 160, rho_o: 0.50, rho_u: 0.63 }; } },
  { id: '6060-T6', name: '6060-T6', getProps: (t: number, sectionType: string) => { return { fo: 150, fu: 190, rho_o: 0.43, rho_u: 0.53 }; } },
  { id: '6060-T66', name: '6060-T66', getProps: (t: number, sectionType: string) => { return { fo: 160, fu: 215, rho_o: 0.41, rho_u: 0.47 }; } },
  { id: '6061-T4', name: '6061-T4/T451', maxThickness: 12.5, getProps: (t: number, sectionType: string) => { return { fo: 110, fu: 205, rho_o: 0.86, rho_u: 0.73 }; } },
  { id: 'HE30-WP (6061-T6)', name: '6061-T6/T651 (HE30-WP)', maxThickness: 80, getProps: () => { return { fo: 240, fu: 290, rho_o: 0.48, rho_u: 0.60 }; } },
  { id: '6063-T4', name: '6063-T4', getProps: (t: number, sectionType: string) => { return { fo: 65, fu: 130, rho_o: 1.0, rho_u: 0.77 }; } },
  { id: '6063-T5', name: '6063-T5', getProps: (t: number, sectionType: string) => { return { fo: 130, fu: 175, rho_o: 0.50, rho_u: 0.57 }; } },
  { id: 'HE9-WP (6063-T6)', name: '6063-T6 (HE9-WP)', getProps: (t: number, sectionType: string) => { return { fo: 170, fu: 215, rho_o: 0.38, rho_u: 0.47 }; } },
  { id: '6063-T66', name: '6063-T66', getProps: (t: number, sectionType: string) => { return { fo: 200, fu: 245, rho_o: 0.33, rho_u: 0.41 }; } },
  { id: '6082-T4', name: '6082-T4/T451', getProps: (t: number, sectionType: string) => { return { fo: 110, fu: 205, rho_o: 0.91, rho_u: 0.78 }; } },
  { id: 'HE20-WP (6082-T6)', name: '6082-T6/T651 (HE20-WP)', getProps: (t: number, sectionType: string) => { if (sectionType === 'Plate') { if (t <= 6) return { fo: 260, fu: 310, rho_o: 0.48, rho_u: 0.60 }; if (t <= 12.5) return { fo: 255, fu: 300, rho_o: 0.49, rho_u: 0.62 }; return { fo: 240, fu: 295, rho_o: 0.52, rho_u: 0.63 }; } else { if (t <= 5) return { fo: 250, fu: 290, rho_o: 0.50, rho_u: 0.64 }; return { fo: 260, fu: 310, rho_o: 0.48, rho_u: 0.60 }; } } },
  { id: '7020-T6', name: '7020-T6/T651', getProps: (t: number, sectionType: string) => { return { fo: 280, fu: 350, rho_o: 0.73, rho_u: 0.80 }; } },
  { id: 'Generic/Unspecified', name: 'Generic/Unspecified', getProps: (t: number, sectionType: string) => { return { fo: 250, fu: 290, rho_o: 1.0, rho_u: 1.0 }; } }
];

// IS 8147:1976 — Table 1 material props + Table 4 permissible (calculator only uses σ_at from Table 4 for capacities).
export type IS8147AlloyEntry = {
  id: string;
  name: string;
  getMaterialProps: (t: number, sectionType: string) => { fy: number; fu: number };
  getPermissibleTable4: (t: number, sectionType: string) => number | null;
};

function table4_64430_WP(t: number, sectionType: string): number {
  if (sectionType === 'Plate') {
    if (t <= 6.3) return 137;
    if (t <= 25) return 132;
    return 132;
  }
  if (t <= 6.3) return 139;
  if (t <= 150) return 147;
  return 147;
}

function table4_65032_WP(t: number, sectionType: string): number {
  if (sectionType === 'Plate') {
    if (t <= 25) return 129;
    return 129;
  }
  if (t <= 150) return 129;
  return 129;
}

function table4_63400_P(t: number): number {
  if (t <= 3.15) return 77;
  if (t <= 12.5) return 62;
  return 62;
}

function table4_63400_M(t: number, sectionType: string): number {
  if (sectionType === 'Plate') {
    if (t <= 12.5) return 85;
    return 85;
  }
  return 85;
}

function table4_54300_O(t: number, sectionType: string): number {
  if (sectionType === 'Plate') {
    if (t <= 6.3) return 81;
    if (t <= 25) return 75;
    return 75;
  }
  if (t <= 150) return 82;
  return 82;
}

export const IS8147_ALLOYS: IS8147AlloyEntry[] = [
  {
    id: 'IS-64430-WP',
    name: 'IS 64430 (H30) WP',
    getMaterialProps: (t, sectionType) => {
      if (sectionType === 'Plate') {
        if (t <= 6.3) return { fy: 250, fu: 295 };
        return { fy: 240, fu: 285 };
      }
      if (t <= 6.3) return { fy: 255, fu: 295 };
      return { fy: 270, fu: 310 };
    },
    getPermissibleTable4: (t, sectionType) => table4_64430_WP(t, sectionType),
  },
  {
    id: 'IS-65032-WP',
    name: 'IS 65032 (H20) WP',
    getMaterialProps: () => ({ fy: 235, fu: 280 }),
    getPermissibleTable4: (t, sectionType) => table4_65032_WP(t, sectionType),
  },
  {
    id: 'IS-63400-P',
    name: 'IS 63400 (H9) P',
    getMaterialProps: (t) => (t <= 3.15 ? { fy: 140, fu: 175 } : { fy: 110, fu: 155 }),
    getPermissibleTable4: (t, _st) => table4_63400_P(t),
  },
  {
    id: 'IS-63400-M',
    name: 'IS 63400 (H9) M',
    getMaterialProps: (_, sectionType) =>
      sectionType === 'Plate' ? { fy: 125, fu: 280 } : { fy: 130, fu: 275 },
    getPermissibleTable4: (t, sectionType) => table4_63400_M(t, sectionType),
  },
  {
    id: 'IS-54300-O',
    name: 'IS 54300 (N8) O',
    getMaterialProps: (t, sectionType) => {
      if (sectionType === 'Plate') {
        if (t <= 6.3) return { fy: 130, fu: 265 };
        return { fy: 115, fu: 270 };
      }
      return { fy: 130, fu: 280 };
    },
    getPermissibleTable4: (t, sectionType) => table4_54300_O(t, sectionType),
  },
  {
    id: 'Generic/Unspecified',
    name: 'Generic/Unspecified',
    getMaterialProps: () => ({ fy: 105, fu: 105 }),
    getPermissibleTable4: (_t, _st) => 105,
  },
];
