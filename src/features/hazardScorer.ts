/**
 * HazardScorer — Risk-score any US address for lead paint, asbestos,
 * radon, and mold using property data, census, and EPA records.
 */

import { z } from 'zod';

export const PropertyProfileSchema = z.object({
  address: z.string(), city: z.string(), state: z.string(), zipCode: z.string(),
  yearBuilt: z.number().int().min(1800).max(2030),
  propertyType: z.enum(['single_family', 'multi_family', 'apartment', 'condo', 'mobile_home', 'public_housing']),
  squareFeet: z.number().positive().optional(),
  basement: z.boolean(), crawlSpace: z.boolean(),
  hvacType: z.enum(['central', 'window_units', 'radiator', 'none']).optional(),
  waterSource: z.enum(['municipal', 'well', 'unknown']).optional(),
  knownRenovations: z.array(z.object({ year: z.number().int(), type: z.string(), rrpCertified: z.boolean().optional() })).optional(),
  codeViolations: z.array(z.object({ date: z.string(), type: z.string(), resolved: z.boolean() })).optional(),
  occupants: z.object({ totalPersons: z.number().int(), childrenUnder6: z.number().int(), pregnant: z.boolean(), elderly: z.boolean() }),
  rentalProperty: z.boolean(),
});

export const HazardReportSchema = z.object({
  address: z.string(), generatedAt: z.string().datetime(),
  overallRiskScore: z.number().min(0).max(100),
  overallRisk: z.enum(['low', 'moderate', 'high', 'critical']),
  hazards: z.object({
    lead: z.object({ score: z.number(), probability: z.number(), factors: z.array(z.string()), recommendation: z.string() }),
    asbestos: z.object({ score: z.number(), probability: z.number(), factors: z.array(z.string()), recommendation: z.string() }),
    radon: z.object({ score: z.number(), probability: z.number(), epaZone: z.enum(['zone1_high', 'zone2_moderate', 'zone3_low']).optional(), recommendation: z.string() }),
    mold: z.object({ score: z.number(), probability: z.number(), factors: z.array(z.string()), recommendation: z.string() }),
  }),
  childVulnerability: z.object({ atRisk: z.boolean(), urgency: z.string(), actions: z.array(z.string()) }),
  tenantRights: z.array(z.object({ right: z.string(), statute: z.string(), action: z.string() })),
  freeTestingPrograms: z.array(z.object({ program: z.string(), hazard: z.string(), eligibility: z.string(), contact: z.string() })),
});

export type PropertyProfile = z.infer<typeof PropertyProfileSchema>;
export type HazardReport = z.infer<typeof HazardReportSchema>;

export function scoreLeadRisk(property: PropertyProfile): { score: number; probability: number; factors: string[] } {
  let score = 0; const factors: string[] = [];
  if (property.yearBuilt < 1978) { score += 30; factors.push('Built before 1978 lead paint ban'); }
  if (property.yearBuilt < 1950) { score += 25; factors.push('Pre-1950 — highest lead paint concentration'); }
  if (property.occupants.childrenUnder6 > 0) { score += 20; factors.push(`${property.occupants.childrenUnder6} children under 6 — most vulnerable to lead`); }
  if (property.occupants.pregnant) { score += 10; factors.push('Pregnant occupant — lead crosses placental barrier'); }
  if (property.knownRenovations?.some(r => !r.rrpCertified && r.year > property.yearBuilt)) { score += 15; factors.push('Non-RRP-certified renovation may have disturbed lead paint'); }
  if (property.waterSource === 'municipal') { score += 5; factors.push('Municipal water — check for lead service lines'); }
  if (property.codeViolations?.some(v => v.type.toLowerCase().includes('paint') || v.type.toLowerCase().includes('lead'))) { score += 15; factors.push('History of paint/lead code violations'); }
  const probability = property.yearBuilt < 1940 ? 0.87 : property.yearBuilt < 1960 ? 0.69 : property.yearBuilt < 1978 ? 0.24 : 0.01;
  return { score: Math.min(100, score), probability, factors };
}

export function scoreAsbestosRisk(property: PropertyProfile): { score: number; probability: number; factors: string[] } {
  let score = 0; const factors: string[] = [];
  if (property.yearBuilt >= 1920 && property.yearBuilt <= 1990) { score += 25; factors.push('Built during peak asbestos use (1920-1990)'); }
  if (property.yearBuilt >= 1940 && property.yearBuilt <= 1970) { score += 20; factors.push('1940-1970 — highest probability of asbestos materials'); }
  if (property.hvacType === 'radiator') { score += 10; factors.push('Radiator system may have asbestos pipe insulation'); }
  if (property.knownRenovations?.some(r => !r.rrpCertified)) { score += 10; factors.push('Renovation may have disturbed asbestos materials'); }
  const probability = property.yearBuilt < 1980 ? 0.70 : 0.05;
  return { score: Math.min(100, score), probability, factors };
}

export function scoreRadonRisk(property: PropertyProfile, epaZone?: 'zone1_high' | 'zone2_moderate' | 'zone3_low'): { score: number; probability: number } {
  let score = epaZone === 'zone1_high' ? 50 : epaZone === 'zone2_moderate' ? 25 : 10;
  if (property.basement) score += 20;
  if (property.crawlSpace) score += 10;
  const probability = epaZone === 'zone1_high' ? 0.50 : epaZone === 'zone2_moderate' ? 0.25 : 0.10;
  return { score: Math.min(100, score), probability };
}

export function generateHazardReport(property: PropertyProfile, epaZone?: 'zone1_high' | 'zone2_moderate' | 'zone3_low'): HazardReport {
  const lead = scoreLeadRisk(property);
  const asbestos = scoreAsbestosRisk(property);
  const radon = scoreRadonRisk(property, epaZone);
  const moldScore = (property.basement ? 25 : 0) + (property.crawlSpace ? 15 : 0) + (property.codeViolations?.some(v => v.type.toLowerCase().includes('moisture') || v.type.toLowerCase().includes('mold')) ? 30 : 0);

  const overallScore = Math.round(Math.max(lead.score, asbestos.score, radon.score, moldScore));
  const overallRisk = overallScore >= 70 ? 'critical' as const : overallScore >= 50 ? 'high' as const : overallScore >= 25 ? 'moderate' as const : 'low' as const;

  const childVulnerability = {
    atRisk: property.occupants.childrenUnder6 > 0 && lead.score > 30,
    urgency: lead.score > 50 && property.occupants.childrenUnder6 > 0 ? 'URGENT: Get blood lead test for all children under 6 immediately' : 'Schedule routine screening',
    actions: property.occupants.childrenUnder6 > 0 ? ['Request blood lead level test from pediatrician', 'Wet-mop floors and windowsills weekly', 'Wash children\'s hands before meals', 'Keep children away from peeling paint'] : [],
  };

  const tenantRights = property.rentalProperty ? [
    { right: 'Lead disclosure required before signing lease', statute: 'Federal: Residential Lead-Based Paint Hazard Reduction Act', action: 'Request EPA lead disclosure form from landlord' },
    { right: 'Landlord must maintain habitable conditions', statute: 'Implied warranty of habitability (state-specific)', action: 'Document hazards in writing to landlord' },
    { right: 'Rent withholding for unaddressed hazards', statute: 'Varies by state', action: 'Consult local legal aid before withholding rent' },
  ] : [];

  return {
    address: property.address, generatedAt: new Date().toISOString(), overallRiskScore: overallScore, overallRisk,
    hazards: {
      lead: { ...lead, recommendation: lead.score > 50 ? 'Professional XRF lead inspection recommended immediately' : lead.score > 25 ? 'EPA lead test kit recommended ($10-30)' : 'Low risk — routine monitoring' },
      asbestos: { ...asbestos, recommendation: asbestos.score > 40 ? 'Professional asbestos inspection before any renovation' : 'Monitor — do not disturb suspected materials' },
      radon: { ...radon, epaZone, factors: [], recommendation: radon.score > 30 ? 'Radon test kit recommended ($15-25) — test lowest lived-in level' : 'Test recommended if basement is living space' },
      mold: { score: moldScore, probability: moldScore > 40 ? 0.6 : 0.2, factors: [], recommendation: moldScore > 40 ? 'Professional mold inspection recommended' : 'Monitor humidity levels (keep below 60%)' },
    },
    childVulnerability, tenantRights,
    freeTestingPrograms: [
      { program: 'HUD Lead Hazard Control Grant Program', hazard: 'Lead', eligibility: 'Low-income households with children under 6', contact: 'Contact local health department' },
      { program: 'EPA Free Radon Test Kit Program', hazard: 'Radon', eligibility: 'Available through many state health departments', contact: 'Check state radon program' },
    ],
  };
}
