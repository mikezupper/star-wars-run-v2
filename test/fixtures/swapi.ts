// A tiny, consistent swapi.info world in the source's raw format: one film, two people, a
// real planet plus the "unknown" placeholder, a species, a vehicle and a starship.
// Tests copy it and break one thing at a time.
import type { RawCollections } from '../../src/ingest/swapi.js';

const api = (path: string) => `https://swapi.info/api/${path}`;

export function world() {
  return {
    films: [
      {
        title: 'A New Hope',
        episode_id: 4,
        opening_crawl: 'It is a period of civil war.\r\nRebel spaceships...',
        director: 'George Lucas',
        producer: 'Gary Kurtz, Rick McCallum',
        release_date: '1977-05-25',
        characters: [api('people/1'), api('people/2')],
        planets: [api('planets/1')],
        species: [api('species/1')],
        vehicles: [api('vehicles/4')],
        starships: [api('starships/2')],
        url: api('films/1'),
      },
    ],
    people: [
      // Listed out of id order on purpose: output must be ordered by id.
      {
        name: 'Arvel Crynyd',
        height: 'unknown',
        mass: 'unknown',
        hair_color: 'brown',
        skin_color: 'fair',
        eye_color: 'brown',
        birth_year: 'unknown',
        gender: 'male',
        homeworld: api('planets/28'),
        films: [api('films/1')],
        species: [],
        vehicles: [],
        starships: [],
        url: api('people/2'),
      },
      {
        name: 'Luke Skywalker',
        height: '172',
        mass: '1,358',
        hair_color: 'blond, n/a',
        skin_color: 'fair',
        eye_color: 'blue',
        birth_year: '19BBY',
        gender: 'male',
        homeworld: api('planets/1'),
        films: [api('films/1')],
        species: [api('species/1')],
        vehicles: [api('vehicles/4')],
        starships: [api('starships/2')],
        url: api('people/1'),
      },
    ],
    planets: [
      {
        name: 'Tatooine',
        rotation_period: '23',
        orbital_period: '304',
        diameter: '10465',
        climate: 'arid',
        gravity: '1 standard',
        terrain: 'desert',
        surface_water: '1',
        population: '200000',
        residents: [api('people/1')],
        films: [api('films/1')],
        url: api('planets/1'),
      },
      {
        name: 'unknown',
        rotation_period: '0',
        orbital_period: '0',
        diameter: '0',
        climate: 'unknown',
        gravity: 'unknown',
        terrain: 'unknown',
        surface_water: 'unknown',
        population: 'unknown',
        residents: [api('people/2')],
        films: [],
        url: api('planets/28'),
      },
    ],
    species: [
      {
        name: 'Human',
        classification: 'mammal',
        designation: 'sentient',
        average_height: '180',
        average_lifespan: 'indefinite',
        skin_colors: 'caucasian, black',
        hair_colors: 'none',
        eye_colors: 'brown, blue',
        language: 'Galactic Basic',
        homeworld: null as string | null,
        people: [api('people/1')],
        films: [api('films/1')],
        url: api('species/1'),
      },
    ],
    vehicles: [
      {
        name: 'Snowspeeder',
        model: 't-47 airspeeder',
        manufacturer: 'Incom corporation',
        cost_in_credits: 'unknown',
        length: '4.5 ',
        max_atmosphering_speed: '650',
        crew: '2',
        passengers: '0',
        cargo_capacity: '10',
        consumables: 'none',
        vehicle_class: 'airspeeder',
        pilots: [api('people/1')],
        films: [api('films/1')],
        url: api('vehicles/4'),
      },
    ],
    starships: [
      {
        name: 'CR90 corvette',
        model: 'CR90 corvette',
        manufacturer: 'Corellian Engineering Corporation',
        cost_in_credits: '3500000',
        length: '1,600',
        max_atmosphering_speed: '1000km',
        crew: '30-165',
        passengers: '600',
        cargo_capacity: '3000000',
        consumables: '1 year',
        starship_class: 'corvette',
        hyperdrive_rating: '2.0',
        MGLT: '60',
        pilots: [api('people/1')],
        films: [api('films/1')],
        url: api('starships/2'),
      },
    ],
  } satisfies RawCollections;
}

export { api };

/** `xs[i]`, failing the test if it doesn't exist (the tsconfig sets noUncheckedIndexedAccess). */
export function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new Error(`fixture has no item ${String(i)}`);
  return x;
}
