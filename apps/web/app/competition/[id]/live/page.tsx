import type { Metadata } from 'next';
import { ObserverDashboard } from '@/components/competition/observer-dashboard';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: 'Live Competition | Hirance',
  description: 'Live Hirance job creation competition leaderboard',
};

export default async function CompetitionLivePage({ params }: PageProps) {
  const { id } = await params;
  return <ObserverDashboard competitionId={id} />;
}
