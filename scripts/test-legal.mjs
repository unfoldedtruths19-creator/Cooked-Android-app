import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

describe('COOKED Android Legal & Support Integration Tests', () => {
  const legalLib = fs.readFileSync(path.resolve('src/lib/legal.ts'), 'utf8');
  const profileCode = fs.readFileSync(path.resolve('src/screens/app/profile.tsx'), 'utf8');
  const authShellCode = fs.readFileSync(path.resolve('src/screens/auth/auth-shell.tsx'), 'utf8');
  const deleteMigration = fs.readFileSync(path.resolve('supabase/migrations/0002_delete_user_function.sql'), 'utf8');

  test('legal.ts exports all 4 canonical COOKED legal URLs', () => {
    assert.match(legalLib, /terms:\s*'https:\/\/cookedapp\.dpdns\.org\/terms'/);
    assert.match(legalLib, /privacy:\s*'https:\/\/cookedapp\.dpdns\.org\/privacy'/);
    assert.match(legalLib, /contact:\s*'https:\/\/cookedapp\.dpdns\.org\/contact'/);
    assert.match(legalLib, /deleteAccount:\s*'https:\/\/cookedapp\.dpdns\.org\/delete-account'/);
  });

  test('legal.ts provides openLegalUrl function with in-app browser & linking fallback', () => {
    assert.match(legalLib, /export async function openLegalUrl/);
    assert.match(legalLib, /openBrowserAsync/);
    assert.match(legalLib, /Linking\.openURL/);
  });

  test('ProfileScreen includes visible Legal & Support section', () => {
    assert.match(profileCode, /Legal & Support/);
    assert.match(profileCode, /Terms of Service/);
    assert.match(profileCode, /Privacy Policy/);
    assert.match(profileCode, /Contact Support/);
    assert.match(profileCode, /cookedappoffical@gmail\.com/);
    assert.match(profileCode, /Delete Account/);
  });

  test('ProfileScreen wires canonical URLs to legal links', () => {
    assert.match(profileCode, /openLegalUrl\(LEGAL_URLS\.terms\)/);
    assert.match(profileCode, /openLegalUrl\(LEGAL_URLS\.privacy\)/);
    assert.match(profileCode, /openLegalUrl\(LEGAL_URLS\.contact\)/);
  });

  test('ProfileScreen implements genuine backend account deletion workflow', () => {
    // Verifies confirmation dialog
    assert.match(profileCode, /handleDeleteAccountPrompt/);
    assert.match(profileCode, /Alert\.alert/);
    assert.match(profileCode, /Permanently delete your COOKED account/i);
    // Verifies actual RPC call
    assert.match(profileCode, /supabase\.rpc\('delete_user'\)/);
    // Verifies full client cleanup on success
    assert.match(profileCode, /AsyncStorage\.clear\(\)/);
    assert.match(profileCode, /supabase\.auth\.signOut\(\)/);
    assert.match(profileCode, /router\.replace\('\/'\)/);
  });

  test('AuthShell provides unauthenticated legal access before login', () => {
    assert.match(authShellCode, /openLegalUrl\(LEGAL_URLS\.terms\)/);
    assert.match(authShellCode, /openLegalUrl\(LEGAL_URLS\.privacy\)/);
    assert.match(authShellCode, /openLegalUrl\(LEGAL_URLS\.contact\)/);
  });

  test('Supabase schema includes security definer delete_user RPC', () => {
    assert.match(deleteMigration, /create or replace function public\.delete_user\(\)/);
    assert.match(deleteMigration, /security definer/);
    assert.match(deleteMigration, /delete from auth\.users where id = auth\.uid\(\);/);
    assert.match(deleteMigration, /grant execute on function public\.delete_user\(\) to authenticated;/);
  });
});
