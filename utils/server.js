// server.js
import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Serve static minimalist frontend
app.use(express.static(path.join(__dirname, '../public')));

// Parse JSON bodies
app.use(express.json());


// Dynamic audit endpoint
function logWithTime(...args) {
  const now = new Date().toISOString();
  console.log(`[${now}]`, ...args);
}

app.post('/run-inspector', (req, res) => {
  const url = req.body.url;
  logWithTime('Received audit request for:', url);
  if (!url || typeof url !== 'string') {
    logWithTime('Invalid or missing URL in request:', req.body);
    return res.status(400).json({ error: 'Missing or invalid URL.' });
  }
  exec(`node utils/audit.js "${url}"`, (err, stdout, stderr) => {
    if (err) {
      logWithTime('Audit error for', url, ':', stderr);
      return res.status(500).json({ error: stderr });
    }
    // Remove ANSI color codes for clean browser output
    const clean = stdout.replace(/\u001b\[[0-9;]*m/g, '');
    let result = clean;
    let json = null;
    try {
      json = JSON.parse(clean);
    } catch (e) {}
    if (json && typeof json === 'object') {
      logWithTime('Audit result (JSON) for', url, ':', JSON.stringify(json));
      res.json({ result: json });
    } else {
      logWithTime('Audit result (text) for', url, ':\n' + clean);
      res.json({ result: clean });
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Site running at http://localhost:${PORT}`);
  console.log(`🔍 Run audit at: http://localhost:${PORT}/run-inspector`);
});
