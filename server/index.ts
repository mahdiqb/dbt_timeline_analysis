#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('Starting Python FastAPI backend...');
const backend = spawn('python', ['main.py'], {
  cwd: join(rootDir, 'backend'),
  stdio: ['pipe', 'pipe', 'pipe']
});

backend.stdout.on('data', (data) => {
  console.log('Backend:', data.toString().trim());
});

backend.stderr.on('data', (data) => {
  console.log('Backend Error:', data.toString().trim());
});

setTimeout(() => {
  console.log('Starting React frontend server...');
  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: join(rootDir, 'frontend'),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  frontend.stdout.on('data', (data) => {
    console.log('Frontend:', data.toString().trim());
  });

  frontend.stderr.on('data', (data) => {
    console.log('Frontend Error:', data.toString().trim());
  });

  frontend.on('close', (code) => {
    console.log(`Frontend process exited with code ${code}`);
    backend.kill();
    process.exit(code);
  });
}, 2000);

backend.on('close', (code) => {
  console.log(`Backend process exited with code ${code}`);
  process.exit(code);
});

console.log('Server running on http://0.0.0.0:3000');
console.log('Frontend: http://localhost:3000');
console.log('Backend API: http://localhost:5000');

// Keep the process alive
process.stdin.resume();