import { initSchema } from '../lib/db.js';

console.log('Initializing database schema...');
await initSchema();
console.log('✅ Schema ready');
