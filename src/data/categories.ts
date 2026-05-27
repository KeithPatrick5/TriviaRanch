import { MainCategory } from '../types/game';

export const MAIN_CATEGORIES: MainCategory[] = [
  'General Knowledge',
  'Sports',
  'Science',
  'History',
  'Geography',
  'Movies',
  'Music',
  'TV',
  'Gaming',
  'Math',
  'Food & Drink',
  'Pop Culture',
];

export const SUBCATEGORIES: Record<MainCategory, string[]> = {
  'General Knowledge': ['Mixed', 'Common Facts', 'Objects', 'Language', 'World Basics'],
  Sports: ['NFL', 'NBA', 'MLB', 'NHL', 'Soccer', 'F1', 'UFC', 'Boxing', 'Olympics', 'College Sports'],
  Science: ['Biology', 'Chemistry', 'Physics', 'Space', 'Earth Science', 'Animals', 'Human Body', 'Inventions'],
  History: ['Ancient History', 'World Wars', 'American History', 'European History', 'Latin American History', 'Leaders', 'Historical Dates', 'Empires'],
  Geography: ['Countries', 'Capitals', 'Flags', 'Maps', 'Rivers & Mountains', 'US States', 'Mexico', 'World Landmarks'],
  Movies: ['Action', 'Comedy', 'Horror', 'Marvel/DC', 'Classic Movies', '90s Movies', '2000s Movies', 'Actors & Directors', 'Movie Quotes'],
  Music: ['Rock', 'Rap', 'Pop', 'Country', '90s Music', '2000s Music', 'Lyrics', 'Albums', 'Bands'],
  TV: ['Sitcoms', 'Drama', 'Reality TV', 'Cartoons', 'Streaming Shows', 'Classic TV', 'TV Quotes'],
  Gaming: ['Nintendo', 'PlayStation', 'Xbox', 'PC Gaming', 'Retro Games', 'Minecraft', 'GTA', 'Call of Duty', 'Fortnite', 'Gaming History'],
  Math: ['Mental Math', 'Algebra', 'Geometry', 'Probability', 'Logic', 'Math History', 'Quick Calculations'],
  'Food & Drink': ['Fast Food', 'Cooking', 'World Food', 'Mexican Food', 'Snacks', 'Coffee', 'Restaurant Trivia'],
  'Pop Culture': ['Celebrities', 'Internet Culture', 'Memes', 'YouTube', 'TikTok', 'Famous Scandals', 'Fashion', 'Brands'],
};
