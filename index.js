#!/usr/bin/env node

import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, realpathSync } from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const scriptPath = join(__dirname, 'ipregion.sh');

// Check if ipregion.sh exists
if (!existsSync(scriptPath)) {
  console.error('Error: ipregion.sh not found in package directory');
  console.error('Please ensure ipregion.sh is present in:', __dirname);
  process.exit(1);
}

// Helper function to run the bash script
function runScript(args) {
  return new Promise((resolve, reject) => {
    execFile('bash', [scriptPath, ...args], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        // Replace script path with 'ipregion' command in help output
        if (args.includes('--help') || args.includes('-h')) {
          const cleanOutput = stdout.replace(new RegExp(scriptPath, 'g'), 'ipregion');
          console.log(cleanOutput);
          process.exit(0);
        }
        reject(new Error(`ipregion.sh error: ${error.message}`));
        return;
      }
      
      // Replace script path with 'ipregion' in help output
      if (args.includes('--help') || args.includes('-h')) {
        const cleanOutput = stdout.replace(new RegExp(scriptPath, 'g'), 'ipregion');
        console.log(cleanOutput);
        process.exit(0);
      }
      
      // For JSON output, parse and return
      if (args.includes('--json') || args.includes('-j')) {
        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(new Error(`Failed to parse JSON output: ${parseError.message}`));
        }
      } else {
        // For regular output, just print it
        console.log(stdout);
        process.exit(0);
      }
    });
  });
}

// Main function for programmatic usage
async function ipregion(options = {}) {
  const args = [];
  
  // Always use JSON output for programmatic usage
  args.push('--json');
  
  // Add options as command line arguments
  if (options.verbose) args.push('--verbose');
  if (options.group) args.push('--group', options.group);
  if (options.timeout) args.push('--timeout', options.timeout.toString());
  if (options.ipv4) args.push('--ipv4');
  if (options.ipv6) args.push('--ipv6');
  if (options.proxy) args.push('--proxy', options.proxy);
  if (options.interface) args.push('--interface', options.interface);
  
  const result = await runScript(args);
  
  // Calculate most likely country
  const countryCounts = {};
  
  // Count countries from all service groups
  ['primary', 'custom', 'cdn'].forEach(group => {
    if (result.results && result.results[group]) {
      result.results[group].forEach(service => {
        if (service.ipv4) {
          // Extract country code (first 2 letters) from strings like "NL (AMS)" or just "NL"
          const countryMatch = service.ipv4.match(/^([A-Z]{2})/);
          if (countryMatch) {
            const country = countryMatch[1];
            countryCounts[country] = (countryCounts[country] || 0) + 1;
          }
        }
        if (service.ipv6) {
          // Extract country code (first 2 letters) from strings like "NL (AMS)" or just "NL"
          const countryMatch = service.ipv6.match(/^([A-Z]{2})/);
          if (countryMatch) {
            const country = countryMatch[1];
            countryCounts[country] = (countryCounts[country] || 0) + 1;
          }
        }
      });
    }
  });
  
  // Find most frequent country
  let mostLikelyCountry = null;
  let maxCount = 0;
  for (const [country, count] of Object.entries(countryCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostLikelyCountry = country;
    }
  }
  
  result.mostLikelyCountry = mostLikelyCountry;
  
  return result;
}

// CLI functionality
async function cli() {
  try {
    // Pass all arguments except node and script path
    const args = process.argv.slice(2);
    
    // Check if JSON output is requested
    const jsonOutput = args.includes('--json');
    
    if (jsonOutput) {
      // For JSON output, use the ipregion function to add mostLikelyCountry
      const options = {};
      
      // Parse CLI arguments to options
      for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
          case '--verbose':
            options.verbose = true;
            break;
          case '--group':
            options.group = args[++i];
            break;
          case '--timeout':
            options.timeout = parseInt(args[++i]);
            break;
          case '--ipv4':
            options.ipv4 = true;
            break;
          case '--ipv6':
            options.ipv6 = true;
            break;
          case '--proxy':
            options.proxy = args[++i];
            break;
          case '--interface':
            options.interface = args[++i];
            break;
        }
      }
      
      const result = await ipregion(options);
      console.log(JSON.stringify(result, null, 2));
    } else {
      // For non-JSON output, pass directly to bash script
      const result = await runScript(args);
      if (typeof result === 'string') {
        console.log(result);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Check if running as CLI (works with global install and direct execution)
const isRunningAsCLI = (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file://${realpathSync(process.argv[1])}` ||
  process.argv[1].endsWith('/ipregion') ||
  process.argv[1].endsWith('\\ipregion') ||
  process.argv[1].endsWith('/index.js') ||
  process.argv[1].endsWith('\\index.js')
);

if (isRunningAsCLI) {
  cli();
}

// Export for module usage
export default ipregion;
export { ipregion };
