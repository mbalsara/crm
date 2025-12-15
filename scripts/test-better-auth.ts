#!/usr/bin/env tsx
/**
 * Test Better-Auth Implementation
 * 
 * Run with: tsx scripts/test-better-auth.ts
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

const API_URL = process.env.SERVICE_API_URL || 'http://localhost:4001';

async function testBetterAuth() {
  console.log('🧪 Testing Better-Auth Implementation\n');
  console.log('=====================================\n');

  // Test 1: Health check
  console.log('1. Testing health endpoint...');
  try {
    const healthRes = await fetch(`${API_URL}/health`);
    const healthData = await healthRes.json();
    console.log('✅ Health check:', healthData);
  } catch (error: any) {
    console.log('❌ Health check failed:', error.message);
  }

  // Test 2: Session endpoint (no session)
  console.log('\n2. Testing session endpoint (no session)...');
  try {
    const sessionRes = await fetch(`${API_URL}/api/auth/session`);
    const sessionData = await sessionRes.json();
    console.log('✅ Session endpoint:', sessionData);
  } catch (error: any) {
    console.log('❌ Session endpoint failed:', error.message);
  }

  // Test 3: Google SSO initiation
  console.log('\n3. Testing Google SSO initiation...');
  try {
    const ssoRes = await fetch(`${API_URL}/api/auth/sign-in/google`, {
      redirect: 'manual', // Don't follow redirects
    });
    
    if (ssoRes.status === 302 || ssoRes.status === 307) {
      const location = ssoRes.headers.get('location');
      if (location?.includes('accounts.google.com')) {
        console.log('✅ Google SSO redirects correctly');
        console.log('   Redirect URL:', location);
      } else {
        console.log('⚠️  Redirect found but not to Google:', location);
      }
    } else {
      console.log('⚠️  Unexpected status:', ssoRes.status);
    }
  } catch (error: any) {
    console.log('❌ Google SSO failed:', error.message);
  }

  // Test 4: Legacy routes
  console.log('\n4. Testing legacy routes...');
  try {
    const legacyRes = await fetch(`${API_URL}/api/auth/legacy/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        tenantId: '00000000-0000-0000-0000-000000000000',
      }),
    });
    
    if (legacyRes.status === 200 || legacyRes.status === 401) {
      const legacyData = await legacyRes.json();
      console.log('✅ Legacy login endpoint accessible:', legacyRes.status);
      console.log('   Response:', legacyData);
    } else {
      console.log('⚠️  Unexpected status:', legacyRes.status);
    }
  } catch (error: any) {
    console.log('❌ Legacy routes failed:', error.message);
  }

  // Test 5: Protected endpoint (should fail without auth)
  console.log('\n5. Testing protected endpoint (no auth)...');
  try {
    const protectedRes = await fetch(`${API_URL}/api/users/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: [], limit: 10, offset: 0 }),
    });
    
    if (protectedRes.status === 401) {
      console.log('✅ Protected endpoint correctly requires auth (401)');
    } else {
      console.log('⚠️  Unexpected status:', protectedRes.status);
      const data = await protectedRes.json();
      console.log('   Response:', data);
    }
  } catch (error: any) {
    console.log('❌ Protected endpoint test failed:', error.message);
  }

  console.log('\n=====================================');
  console.log('✅ Basic tests complete!\n');
  console.log('Next steps:');
  console.log(`1. Open browser: ${API_URL}/api/auth/sign-in/google`);
  console.log('2. Sign in with Google (use email matching company domain)');
  console.log('3. Check database for created users:');
  console.log('   SELECT * FROM better_auth_user;');
  console.log('   SELECT * FROM users;');
  console.log('4. Test protected endpoints with session cookie');
  console.log('\n📖 See docs/BETTER_AUTH_TESTING_GUIDE.md for detailed testing');
}

testBetterAuth().catch(console.error);
