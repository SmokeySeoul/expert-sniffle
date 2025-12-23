import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { InsightsScreen } from './InsightsScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 }
  }
});

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync('accessToken')
      .then((value) => setToken(value))
      .finally(() => setLoading(false));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {loading ? (
        <View style={{ padding: 16 }}>
          <Text>Loading...</Text>
        </View>
      ) : token ? (
        <InsightsScreen token={token} />
      ) : (
        <View style={{ padding: 16 }}>
          <Text>Please log in</Text>
        </View>
      )}
    </QueryClientProvider>
  );
}
