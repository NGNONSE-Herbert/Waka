import { useEffect, useState } from 'react';
import { FALLBACK_CITIES, cityName as lookup } from '../../web/lib/cities';
import { api, type City } from './api';

/** Villes de l'API, avec repli local pour rester utilisable sur réseau faible. */
export function useCities() {
  const [cities, setCities] = useState<City[]>(FALLBACK_CITIES);
  useEffect(() => {
    let live = true;
    api
      .cities()
      .then((list) => {
        if (live && list.length) setCities(list);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return cities;
}

export const cityName = (cities: City[], code: string) => lookup(cities, code);
export const routeLabel = (cities: City[], from: string, to: string) => `${cityName(cities, from)} → ${cityName(cities, to)}`;
