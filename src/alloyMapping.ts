import { EUROCODE_ALLOYS, IS8147_ALLOYS, type IS8147AlloyEntry } from './data/alloys';

/** Reference thickness (mm) for fy/fu comparison — matches typical plate inputs in the calculator. */
export const ALLOY_MAPPING_REFERENCE_THICKNESS_MM = 10;

/** Reference section type — same convention as alloy getProps / getMaterialProps in the app. */
export const ALLOY_MAPPING_REFERENCE_SECTION_TYPE = 'Plate' as const;

/**
 * Manual IS 8147 alloy id → Eurocode alloy id when names do not match.
 * Edit here to adjust closest-temper pairs; data values always come from the datasets.
 */
export const IS8147_TO_EUROCODE_ALLOY_ID: Record<string, string> = {
  'IS-64430-WP': 'HE30-WP (6061-T6)',
  'IS-65032-WP': 'HE20-WP (6082-T6)',
  /** H9 P: mapped to EC grade with similar fy at common thickness (review if comparing thin strip). */
  'IS-63400-P': '6005A-T4',
  /** H9 M: strength level aligned to 5083-O for typical structural thickness (plate vs extrusion in IS table). */
  'IS-63400-M': '5083-O',
  /** N8 O: mapped to 5083-O as a marine/soft-temper analogue for fu level (edit if you prefer 5754-O). */
  'IS-54300-O': '5083-O',
  'Generic/Unspecified': 'Generic/Unspecified',
};

function resolveEurocodeAlloyId(is: IS8147AlloyEntry): string {
  const byName = EUROCODE_ALLOYS.find((ec) => ec.name === is.name);
  if (byName) return byName.id;
  const byId = EUROCODE_ALLOYS.find((ec) => ec.id === is.id);
  if (byId) return byId.id;
  return IS8147_TO_EUROCODE_ALLOY_ID[is.id] ?? 'Generic/Unspecified';
}

export type AlloyComparisonRow = {
  key: string;
  chartLabel: string;
  isName: string;
  isFy: number;
  isFu: number;
  ecName: string;
  ecFy: number;
  ecFu: number;
};

export function buildAlloyComparisonRows(): AlloyComparisonRow[] {
  const t = ALLOY_MAPPING_REFERENCE_THICKNESS_MM;
  const sectionType = ALLOY_MAPPING_REFERENCE_SECTION_TYPE;

  return IS8147_ALLOYS.map((is) => {
    const ecId = resolveEurocodeAlloyId(is);
    const ec = EUROCODE_ALLOYS.find((a) => a.id === ecId) ?? EUROCODE_ALLOYS.find((a) => a.id === 'Generic/Unspecified')!;

    const isMat = is.getMaterialProps(t, sectionType);
    const ecProps = ec.getProps(t, sectionType);

    const shortIs = is.name.replace(/^IS\s+/, '');
    const chartLabel = `${shortIs.slice(0, 12)}↔${ec.name.slice(0, 14)}`;

    return {
      key: is.id,
      chartLabel,
      isName: is.name,
      isFy: isMat.fy,
      isFu: isMat.fu,
      ecName: ec.name,
      ecFy: ecProps.fo,
      ecFu: ecProps.fu,
    };
  });
}
