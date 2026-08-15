// Vercel serverless entry point. Vercel bundles this file into a function and
// routes every request to it (see vercel.json). Express apps are valid request
// handlers, so we export the app factory result directly — no extra adapter.
//
// Deployment notes:
//   - Background jobs (notification worker) are intentionally not started here;
//     serverless functions must be stateless and short-lived.
//   - The app connects to MongoDB lazily per request via Mongoose's connection
//     pool, so warm functions reuse the same connection.
import { createApp } from '../src/core/app.js';

export default createApp();
