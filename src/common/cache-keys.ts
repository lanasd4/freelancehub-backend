/** All cache keys in one place, so writers and readers never disagree. */
export const CacheKeys = {
  categories: 'categories:all',
  skills: 'skills:all',
  profile: (userId: number) => `profile:${userId}`,
  projectsList: (query: string) => `projects:list:${query}`,
  dashboard: 'admin:dashboard',
};
