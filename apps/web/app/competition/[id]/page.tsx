import { ParticipantDashboard } from '@/components/competition/participant-dashboard';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompetitionParticipantPage({ params }: PageProps) {
  const { id } = await params;
  return <ParticipantDashboard competitionId={id} />;
}
