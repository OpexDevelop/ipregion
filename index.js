#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default export function for module usage
export default async function ipregion(options = {}) {
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

// Named export for convenience
export { ipregion };

// Run the bash script
async function runScript(args = []) {
  const scriptPath = join(__dirname, 'ipregion.sh');
  
  // Check if script exists
  try {
    await fs.access(scriptPath);
  } catch (error) {
    throw new Error(`ipregion.sh not found in ${__dirname}. Please ensure the script is present.`);
  }
  
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', [scriptPath, ...args], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Script exited with code ${code}: ${stderr}`));
        return;
      }
      
      // Try to parse JSON output
      if (args.includes('--json')) {
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            resolve(parsed);
          } else {
            reject(new Error('No JSON output found'));
          }
        } catch (error) {
          reject(new Error(`Failed to parse JSON output: ${error.message}`));
        }
      } else {
        // Return raw output for CLI mode
        resolve(stdout);
      }
    });
    
    proc.on('error', (error) => {
      reject(error);
    });
  });
}

// CLI handler
async function cli() {
  try {
    const args = process.argv.slice(2);
    
    // If no args or help requested, pass through to the script
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
      const result = await runScript(args);
      if (typeof result === 'string') {
        process.stdout.write(result);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
      process.exit(0);
    }
    
    // Check if JSON output is requested for CLI
    const isJson = args.includes('--json');
    
    // Run the script with provided arguments
    const result = await runScript(args);
    
    if (typeof result === 'string') {
      process.stdout.write(result);
    } else {
      // If JSON was requested and we have an object, add mostLikelyCountry
      if (isJson && result.results) {
        const countries = [];
        for (const group of Object.values(result.results)) {
          for (const service of group) {
            if (service.ipv4 && service.ipv4.length === 2) {
              countries.push(service.ipv4);
            }
            if (service.ipv6 && service.ipv6.length === 2) {
              countries.push(service.ipv6);
            }
          }
        }
        
        if (countries.length > 0) {
          const countMap = {};
          for (const country of countries) {
            countMap[country] = (countMap[country] || 0) + 1;
          }
          
          let maxCount = 0;
          let mostLikely = null;
          for (const [country, count] of Object.entries(countMap)) {
            if (count > maxCount) {
              maxCount = count;
              mostLikely = country;
            }
          }
          
          result.mostLikelyCountry = mostLikely;
        } else {
          result.mostLikelyCountry = null;
        }
      }
      
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Check if running as CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  cli();
}