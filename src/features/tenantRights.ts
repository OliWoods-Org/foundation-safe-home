/**
 * TenantRights — Legal rights database and demand letter generator
 * for tenants facing environmental hazards from landlord negligence.
 */

import { z } from 'zod';

export const TenantCaseSchema = z.object({
  id: z.string().uuid(), createdAt: z.string().datetime(),
  tenantName: z.string(), address: z.string(), state: z.string(),
  landlordName: z.string(), landlordAddress: z.string().optional(),
  hazards: z.array(z.enum(['lead_paint', 'asbestos', 'radon', 'mold', 'water_contamination', 'pest_infestation', 'structural'])),
  notificationHistory: z.array(z.object({ date: z.string(), method: z.enum(['verbal', 'written', 'email', 'certified_mail']), description: z.string(), responseReceived: z.boolean() })),
  childrenPresent: z.boolean(),
  healthImpacts: z.array(z.string()),
  desiredOutcome: z.enum(['remediation', 'rent_reduction', 'lease_termination', 'relocation', 'damages']),
});

export const DemandLetterSchema = z.object({
  caseId: z.string().uuid(), generatedAt: z.string().datetime(),
  letterText: z.string(), applicableStatutes: z.array(z.object({ statute: z.string(), description: z.string() })),
  sendVia: z.enum(['certified_mail', 'email_and_certified', 'attorney']),
  deadlineDays: z.number().int().positive(),
  escalationPath: z.array(z.object({ step: z.number().int(), action: z.string(), trigger: z.string() })),
});

export type TenantCase = z.infer<typeof TenantCaseSchema>;
export type DemandLetter = z.infer<typeof DemandLetterSchema>;

export function generateDemandLetter(tenantCase: TenantCase): DemandLetter {
  const hazardNames = tenantCase.hazards.map(h => h.replace('_', ' ')).join(', ');
  const hasWrittenNotice = tenantCase.notificationHistory.some(n => n.method !== 'verbal');
  const deadlineDays = tenantCase.childrenPresent && tenantCase.hazards.includes('lead_paint') ? 14 : 30;

  const statutes: DemandLetter['applicableStatutes'] = [];
  if (tenantCase.hazards.includes('lead_paint')) {
    statutes.push({ statute: '42 U.S.C. 4852d — Residential Lead-Based Paint Hazard Reduction Act', description: 'Requires disclosure and remediation of known lead hazards' });
  }
  statutes.push({ statute: 'Implied Warranty of Habitability', description: 'Landlord must maintain premises in habitable condition free from environmental hazards' });
  statutes.push({ statute: 'State landlord-tenant code', description: `${tenantCase.state} specific requirements for hazard remediation` });

  const letterText = `
${new Date().toLocaleDateString()}

VIA CERTIFIED MAIL, RETURN RECEIPT REQUESTED

${tenantCase.landlordName}
${tenantCase.landlordAddress ?? '[LANDLORD ADDRESS]'}

RE: DEMAND FOR REMEDIATION OF ENVIRONMENTAL HAZARDS
Property: ${tenantCase.address}

Dear ${tenantCase.landlordName}:

I am writing to formally demand immediate remediation of the following environmental hazards at the above-referenced property: ${hazardNames}.

${hasWrittenNotice ? 'As previously communicated in writing, these' : 'These'} hazardous conditions violate the implied warranty of habitability and applicable federal and state law, including ${statutes.map(s => s.statute).join('; ')}.

${tenantCase.childrenPresent ? 'CHILDREN RESIDE AT THIS PROPERTY. The presence of children, particularly those under age 6, significantly increases the urgency and legal obligations for remediation. Lead exposure causes irreversible brain damage in children.' : ''}

${tenantCase.healthImpacts.length > 0 ? `Occupants have experienced the following health impacts attributable to these conditions: ${tenantCase.healthImpacts.join(', ')}.` : ''}

I hereby demand:

1. Professional inspection and testing for all identified hazards within ${deadlineDays} days of receipt of this letter.
2. Complete remediation by licensed, certified professionals within a reasonable time following inspection.
3. ${tenantCase.childrenPresent ? 'Interim relocation at landlord expense if hazards cannot be immediately contained.' : 'Written plan and timeline for remediation.'}
4. Written confirmation of completed remediation with test results.

Failure to respond within ${deadlineDays} days will result in pursuit of all available legal remedies, which may include ${tenantCase.state} code enforcement complaints, rent withholding, repair-and-deduct remedies, and civil action for damages.

This letter serves as formal notice of these conditions. Please preserve all records related to the property's maintenance, inspection, and renovation history.

Sincerely,
${tenantCase.tenantName}
${tenantCase.address}
`.trim();

  return {
    caseId: tenantCase.id, generatedAt: new Date().toISOString(), letterText, applicableStatutes: statutes,
    sendVia: tenantCase.childrenPresent ? 'email_and_certified' : 'certified_mail', deadlineDays,
    escalationPath: [
      { step: 1, action: 'Send demand letter via certified mail', trigger: 'Initial notice' },
      { step: 2, action: 'File complaint with local code enforcement', trigger: `No response in ${deadlineDays} days` },
      { step: 3, action: 'Contact local legal aid for representation', trigger: 'Landlord refuses remediation' },
      { step: 4, action: 'File complaint with state AG or HUD', trigger: 'Continued non-compliance' },
    ],
  };
}
