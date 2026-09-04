import { graveyard } from './graveyard.js';
import { village } from './village.js';
import { city } from './city.js';

export const LEVELS = [graveyard, village, city];
export const levelById = (id) => LEVELS.find((l) => l.id === id) || graveyard;
