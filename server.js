import { app } from './src/app.js';
import { getDb } from './src/db.js';

const port = process.env.PORT || 3000;
await getDb(); // create tables + demo account on boot
app.listen(port, () => console.log(`Kwote running on http://localhost:${port}`));
