import { graveyard } from './graveyard.js';
import { village } from './village.js';
import { city } from './city.js';
import { castle } from './castle.js';

export const LEVELS = [graveyard, village, city, castle];
export const levelById = (id) => LEVELS.find((l) => l.id === id) || graveyard;
