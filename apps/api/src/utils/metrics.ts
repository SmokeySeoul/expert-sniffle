type CounterKeys = 'auth_failures' | 'ai_calls' | 'ai_applies' | 'ai_rollbacks' | 'exports' | 'deletes';

const counters: Record<CounterKeys, number> = {
  auth_failures: 0,
  ai_calls: 0,
  ai_applies: 0,
  ai_rollbacks: 0,
  exports: 0,
  deletes: 0
};

export function incCounter(key: CounterKeys, by = 1) {
  counters[key] = (counters[key] || 0) + by;
}

export function getMetricsText() {
  return Object.entries(counters)
    .map(([k, v]) => `# HELP substream_${k} Counter for ${k}\n# TYPE substream_${k} counter\nsubstream_${k} ${v}`)
    .join('\n');
}

export function getMetricsJson() {
  return { counters };
}
