/**
 * Basic tests for CloudAHK Node.js client
 * Run with: node test/test.js
 *
 * Note: Requires CloudAHK server to be running
 */

import { CloudAHKClient } from '../src/client.js';

const client = new CloudAHKClient();

async function runTests() {
  console.log('CloudAHK Node.js Client Tests\n');
  console.log('='.repeat(50));

  // Check server availability
  console.log('\n1. Checking server availability...');
  const available = await client.isAvailable();
  if (!available) {
    console.error('   FAIL: CloudAHK server is not running at', client.baseUrl);
    console.error('   Start it with: docker-compose up -d');
    process.exit(1);
  }
  console.log('   PASS: Server is running');

  // Test basic execution
  console.log('\n2. Testing basic AHK execution...');
  const basicResult = await client.run('Print("Hello World")');
  if (basicResult.success && basicResult.output.includes('Hello World')) {
    console.log('   PASS: Basic execution works');
  } else {
    console.error('   FAIL:', basicResult);
  }

  // Test arithmetic
  console.log('\n3. Testing arithmetic...');
  const mathResult = await client.run(`
    x := 10
    y := 20
    Print(x + y)
  `);
  if (mathResult.success && mathResult.output.trim() === '30') {
    console.log('   PASS: Arithmetic works');
  } else {
    console.error('   FAIL:', mathResult);
  }

  // Test error detection
  console.log('\n4. Testing error detection...');
  const errorResult = await client.run('Call_Undefined_Function()');
  if (!errorResult.success && errorResult.hasErrors) {
    console.log('   PASS: Error detected correctly');
    console.log('   Error type:', errorResult.errors[0]?.type);
  } else {
    console.error('   FAIL: Error not detected');
  }

  // Test validation
  console.log('\n5. Testing validation...');
  const validCode = await client.validate('Print("test")');
  const invalidCode = await client.validate('Invalid Syntax Here!!!');
  if (validCode.valid && !invalidCode.valid) {
    console.log('   PASS: Validation works');
  } else {
    console.error('   FAIL: Validation issues');
  }

  // Test AHK v2
  console.log('\n6. Testing AHK v2...');
  const v2Result = await client.run(`
    x := 10
    Print(x * 2)
  `, { language: 'ahk2' });
  if (v2Result.success && v2Result.output.trim() === '20') {
    console.log('   PASS: AHK v2 works');
  } else {
    console.error('   FAIL:', v2Result);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Tests completed!\n');
}

runTests().catch(console.error);
