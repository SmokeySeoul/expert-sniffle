import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Substream</h1>
      <ul className="space-y-2">
        <li>
          <Link className="text-blue-600 underline" href="/insights">
            Insights
          </Link>
        </li>
      </ul>
    </div>
  );
}
