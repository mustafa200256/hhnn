// تحميل ملف .env بدون أي مكتبة خارجية.
// القيم الموجودة مسبقاً في بيئة النظام تتفوق على قيم الملف.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(file = path.join(root, '.env')) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return false; // لا يوجد .env — لا بأس، قد تأتي القيم من النظام
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  return true;
}

export const projectRoot = root;
