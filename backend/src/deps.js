import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

// config
export const API_PORT = 8080;
export const ALLOW_ORIGIN = '*';

export const DB = {
  host: '127.0.0.1',
  port: 3306,
  user: 'minidrive_user',
  password: 'tilen4321',
  database: 'minidrive_db'
};

export const ADMIN_REG_SECRET = 'hp';
export const JWT_SECRET = 'very-simple-secret';
export const STORAGE_ROOT = '/etc/minidrive/storage';


// Make sure base storage dir exists at boot
try {
  if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
} catch (e) {
  console.error('Failed to ensure STORAGE_ROOT:', e);
}

export const pool = mysql.createPool({ ...DB, connectionLimit: 10, charset: 'utf8mb4' });

// auth helpers
export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

export function authRequired(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Manjka žeton.' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    req.user = { id: p.sub, username: p.username };
    return next();
  } catch {
    return res.status(401).json({ error: 'Neveljaven žeton.' });
  }
}

// helpers for sharing / tokens
export function makeToken(n = 22) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Re-export low-level utilities that routes need
export { bcrypt, jwt, multer, fs, path };
