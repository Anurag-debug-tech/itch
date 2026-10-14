/** Shared deterministic project input. Money values are integer paise. */
export function projectInput(freelancerId: string, startDate: string) {
  const start = new Date(startDate);
  const later = (days: number) => new Date(start.getTime() + days * 86_400_000).toISOString();
  return {
    type: 'createProject',
    title: 'College festival website verification',
    description: 'Build the agreed college festival pages and provide source evidence.',
    category: 'Website Development',
    freelancerId,
    budget: 1_200_000,
    currency: 'INR',
    startDate: start.toISOString(),
    deadline: later(14),
    scope: 'Five responsive pages and a validated registration form.',
    exclusions: 'Domain purchase, hosting charges, and third-party subscriptions.',
    revisionPolicy: 'Two revisions against the existing acceptance checklist.',
    acceptancePolicy: 'Client reviews evidence within 72 hours. Timeout escalates to review.',
    disputePolicy: 'An administrator reviews evidence and records a reasoned decision.',
    milestones: [
      {
        title: 'Design evidence',
        description: 'Supply the responsive design specification.',
        requirements: 'A text specification with the agreed page names and mobile behavior.',
        budget: 300_000,
        dueDate: later(4),
        criteria: ['Five agreed page names are documented', 'Mobile behavior is documented'],
        allowedTypes: ['txt', 'pdf', 'png', 'zip'],
        maxFileSize: 5 * 1024 * 1024,
        revisionLimit: 2,
        reviewHours: 72,
      },
      {
        title: 'Implementation evidence',
        description: 'Supply the final implementation and test report.',
        requirements: 'A source archive and a readable report.',
        budget: 900_000,
        dueDate: later(12),
        criteria: ['Registration fields are validated'],
        allowedTypes: ['txt', 'zip'],
        maxFileSize: 5 * 1024 * 1024,
        revisionLimit: 1,
        reviewHours: 72,
      },
    ],
  };
}

export const evidence = Buffer.from(
  'Pages: Home, About, Events, Registration, Contact. Mobile behavior: single-column navigation and responsive forms.',
);
