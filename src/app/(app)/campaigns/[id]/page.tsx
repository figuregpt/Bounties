type Params = Promise<{ id: string }>;

export default async function CampaignPage({ params }: { params: Params }) {
  const { id } = await params;
  return (
    <div>
      <h1 className="text-h1">Campaign</h1>
      <p className="mt-2 text-body text-text-secondary">
        Campaign id: <span className="font-mono">{id}</span>
      </p>
    </div>
  );
}
