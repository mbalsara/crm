#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_1gHnfsaiR8Fz@ep-odd-thunder-a88b2g71-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';

async function main() {
  console.log('🔨 Creating database schema...\n');

  const sql = postgres(DATABASE_URL, {
    ssl: 'require',
  });

  try {
    // Read SQL file
    const schemaSQL = readFileSync('schema.sql', 'utf-8');

    // Split by semicolons and execute each statement
    const statements = schemaSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let count = 0;
    for (const statement of statements) {
      if (statement.includes('DROP') || statement.includes('CREATE')) {
        try {
          // Log what we're about to execute
          const preview = statement.substring(0, 60).replace(/\n/g, ' ');
          console.log(`⚙️  Executing: ${preview}...`);

          await sql.unsafe(statement);
          count++;

          if (statement.includes('CREATE TABLE')) {
            const tableName = statement.match(/CREATE TABLE (\w+)/)?.[1];
            console.log(`✅ Created table: ${tableName}`);
          } else if (statement.includes('CREATE TYPE')) {
            const typeName = statement.match(/CREATE TYPE (\w+)/)?.[1];
            console.log(`✅ Created enum: ${typeName}`);
          } else if (statement.includes('CREATE INDEX')) {
            const indexName = statement.match(/CREATE INDEX (\w+)/)?.[1];
            console.log(`✅ Created index: ${indexName}`);
          } else if (statement.includes('DROP TABLE')) {
            const tableName = statement.match(/DROP TABLE IF EXISTS (\w+)/)?.[1];
            console.log(`🗑️  Dropped table: ${tableName}`);
          } else if (statement.includes('DROP TYPE')) {
            const typeName = statement.match(/DROP TYPE IF EXISTS (\w+)/)?.[1];
            console.log(`🗑️  Dropped enum: ${typeName}`);
          }
        } catch (err: any) {
          // Ignore errors for DROP statements that don't exist
          if (statement.includes('DROP')) {
            // Silent ignore for DROP IF EXISTS
            continue;
          }

          // Ignore "already exists" errors for CREATE statements
          if (err.message?.includes('already exists')) {
            if (statement.includes('CREATE TYPE')) {
              const typeName = statement.match(/CREATE TYPE (\w+)/)?.[1];
              console.log(`ℹ️  Type already exists: ${typeName}`);
            } else if (statement.includes('CREATE TABLE')) {
              const tableName = statement.match(/CREATE TABLE (\w+)/)?.[1];
              console.log(`ℹ️  Table already exists: ${tableName}`);
            } else if (statement.includes('CREATE INDEX')) {
              const indexName = statement.match(/CREATE INDEX (\w+)/)?.[1];
              console.log(`ℹ️  Index already exists: ${indexName}`);
            }
            continue;
          }

          // Throw all other errors
          throw err;
        }
      }
    }

    console.log(`\n✅ Schema created successfully! (${count} statements executed)\n`);

    // Verify
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    console.log('📋 Tables in database:');
    tables.forEach((t: any) => console.log(`   - ${t.table_name}`));

    await sql.end();

  } catch (error: any) {
    console.error('❌ Error creating schema:', error.message);
    await sql.end();
    process.exit(1);
  }
}

main();
