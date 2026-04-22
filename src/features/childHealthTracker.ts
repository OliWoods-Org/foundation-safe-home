/**
 * ChildHealthTracker — Blood lead level tracking, pediatric referrals,
 * and environmental health milestone monitoring for children in at-risk housing.
 */

import { z } from 'zod';

export const ChildHealthRecordSchema = z.object({
  childId: z.string().uuid(), name: z.string(), dob: z.string(),
  address: z.string(), leadRiskScore: z.number().min(0).max(100),
  bloodLeadTests: z.array(z.object({
    date: z.string(), levelUgDl: z.number().nonnegative(), testType: z.enum(['capillary', 'venous']),
    labName: z.string().optional(), orderedBy: z.string().optional(),
  })),
  cdcActionLevel: z.enum(['normal', 'elevated', 'high', 'urgent', 'emergency']),
  symptoms: z.array(z.enum(['none', 'irritability', 'fatigue', 'appetite_loss', 'abdominal_pain', 'constipation', 'developmental_delay', 'learning_difficulty', 'seizures', 'encephalopathy'])),
  referrals: z.array(z.object({ type: z.string(), provider: z.string(), date: z.string(), status: z.enum(['pending', 'scheduled', 'completed']) })),
  screeningSchedule: z.array(z.object({ age: z.string(), dueDate: z.string(), completed: z.boolean() })),
});

export const LeadLevelAlertSchema = z.object({
  childId: z.string().uuid(), generatedAt: z.string().datetime(),
  latestLevel: z.number(), trend: z.enum(['declining', 'stable', 'rising']),
  actionRequired: z.string(),
  referrals: z.array(z.string()),
  environmentalActions: z.array(z.string()),
});

export type ChildHealthRecord = z.infer<typeof ChildHealthRecordSchema>;
export type LeadLevelAlert = z.infer<typeof LeadLevelAlertSchema>;

// CDC reference levels (2021 update: 3.5 ug/dL reference value)
export function classifyLeadLevel(levelUgDl: number): ChildHealthRecord['cdcActionLevel'] {
  if (levelUgDl < 3.5) return 'normal';
  if (levelUgDl < 10) return 'elevated';
  if (levelUgDl < 20) return 'high';
  if (levelUgDl < 45) return 'urgent';
  return 'emergency';
}

export function generateLeadAlert(record: ChildHealthRecord): LeadLevelAlert {
  const tests = record.bloodLeadTests.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latest = tests[0]?.levelUgDl ?? 0;
  const previous = tests[1]?.levelUgDl;

  const trend = previous === undefined ? 'stable' as const
    : latest < previous ? 'declining' as const
    : latest > previous ? 'rising' as const : 'stable' as const;

  const level = classifyLeadLevel(latest);
  const referrals: string[] = [];
  const envActions: string[] = [];
  let action: string;

  switch (level) {
    case 'emergency':
      action = 'EMERGENCY: Immediate hospitalization for chelation therapy';
      referrals.push('Emergency department immediately', 'Pediatric toxicologist');
      envActions.push('Environmental investigation required within 24 hours', 'Remove child from exposure source immediately');
      break;
    case 'urgent':
      action = 'URGENT: Chelation therapy evaluation within 48 hours';
      referrals.push('Pediatric toxicologist', 'Local lead poisoning prevention program');
      envActions.push('Environmental investigation within 1 week', 'Professional lead abatement required');
      break;
    case 'high':
      action = 'Retest within 1-3 months. Environmental investigation recommended.';
      referrals.push('Lead poisoning prevention program', 'Developmental screening');
      envActions.push('Identify and address lead sources', 'Wet-clean all surfaces weekly', 'Test all drinking water');
      break;
    case 'elevated':
      action = 'Retest within 3 months. Provide lead exposure prevention education.';
      referrals.push('Nutritional counseling (calcium, iron, vitamin C reduce lead absorption)');
      envActions.push('Test home for lead paint if pre-1978', 'Wash hands frequently', 'Run cold water 30 seconds before drinking');
      break;
    default:
      action = 'Level below CDC reference value. Continue routine screening per AAP guidelines.';
  }

  return { childId: record.childId, generatedAt: new Date().toISOString(), latestLevel: latest, trend, actionRequired: action, referrals, environmentalActions: envActions };
}

export function generateScreeningSchedule(dob: string, highRisk: boolean): ChildHealthRecord['screeningSchedule'] {
  const birthDate = new Date(dob).getTime();
  const schedule = [
    { age: '12 months', months: 12 },
    { age: '24 months', months: 24 },
  ];
  if (highRisk) {
    schedule.push({ age: '6 months', months: 6 }, { age: '18 months', months: 18 }, { age: '36 months', months: 36 }, { age: '48 months', months: 48 }, { age: '60 months', months: 60 }, { age: '72 months', months: 72 });
  }
  return schedule.sort((a, b) => a.months - b.months).map(s => ({
    age: s.age, dueDate: new Date(birthDate + s.months * 30.44 * 86400000).toISOString().split('T')[0], completed: false,
  }));
}
