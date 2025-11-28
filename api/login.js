import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    // Load users from public/users.json
    // Try multiple paths for Vercel compatibility
    const possiblePaths = [
      path.join(__dirname, '../public/users.json'), // Standard path
      path.join(__dirname, '../../public/users.json'), // Alternative path
      path.join(process.cwd(), 'public/users.json'), // Vercel path
      path.join(process.cwd(), 'dist/public/users.json'), // Build path
    ];

    let users = [];
    let usersPath = null;
    
    // Try each path until we find the file
    for (const tryPath of possiblePaths) {
      if (fs.existsSync(tryPath)) {
        usersPath = tryPath;
        try {
          const usersData = fs.readFileSync(tryPath, 'utf8');
          const parsed = JSON.parse(usersData);
          users = parsed.users || [];
          console.log(`✅ Loaded users from: ${tryPath} (${users.length} users)`);
          break;
        } catch (parseError) {
          console.error(`Failed to parse users.json from ${tryPath}:`, parseError);
        }
      }
    }

    // If still no users, use hardcoded fallback (for emergency access)
    if (users.length === 0) {
      console.warn('⚠️ users.json not found, using fallback users');
      users = [
        { username: 'MATRIX1', password: 'APCCTV' },
        { username: 'MATRIX2', password: 'APCCTV' },
        { username: 'MATRIX3', password: 'APCCTV' },
        { username: 'VIDEO1', password: 'APCCTV' },
        { username: 'VIDEO2', password: 'APCCTV' },
        { username: 'VIDEO3', password: 'APCCTV' },
      ];
    }

    // Check credentials
    const user = users.find(
      u => u.username.toUpperCase() === username.toUpperCase() && u.password === password
    );

    if (user) {
      res.json({ success: true, username: user.username });
    } else {
      res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    console.error('Error stack:', error.stack);
    console.error('Current directory:', process.cwd());
    console.error('__dirname:', __dirname);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

