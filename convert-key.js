// This script converts a PKCS#1 private key to PKCS#8 format
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Please paste your GitHub App private key (PKCS#1 format) below.');
console.log('Press Ctrl+D (or Ctrl+Z on Windows) when done:\n');

let privateKey = '';

rl.on('line', (line) => {
  privateKey += line + '\n';
});

rl.on('close', () => {
  // Check if it's already PKCS#8
  if (privateKey.includes('BEGIN PRIVATE KEY')) {
    console.log('\nThis key is already in PKCS#8 format\!');
    console.log(privateKey);
    return;
  }

  // Check if it's PKCS#1
  if (\!privateKey.includes('BEGIN RSA PRIVATE KEY')) {
    console.log('\nError: This doesn\'t look like a valid PKCS#1 private key.');
    return;
  }

  console.log('\nTo convert your private key to PKCS#8 format, run this command:');
  console.log('\necho "YOUR_PRIVATE_KEY" | openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt');
  console.log('\nOr save your key to a file and run:');
  console.log('openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in private-key.pem -out private-key-pkcs8.pem');
});
