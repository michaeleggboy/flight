import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Fetch all supported airports.
 */
export function useAirports() {
  return useQuery({
    queryKey: ['airports'],
    queryFn: async () => {
      const { data } = await api.get('/api/flights/airports');
      return data;
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}

/**
 * Search flights between two airports.
 */
export function useFlightSearch() {
  return useMutation({
    mutationFn: async ({ origin, destination, date, passengers = 1 }) => {
      const { data } = await api.post('/api/flights/search', {
        origin,
        destination,
        date,
        passengers,
      });
      return data;
    },
  });
}

/**
 * Run the multi-city route optimizer.
 */
export function useOptimize() {
  return useMutation({
    mutationFn: async ({ cities, dates, alpha, tripType, passengers = 1, maxResults = 5 }) => {
      const { data } = await api.post('/api/optimize/', {
        cities,
        dates,
        alpha,
        trip_type: tripType,
        passengers,
        max_results: maxResults,
      });
      return data;
    },
  });
}
