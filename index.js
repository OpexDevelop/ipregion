#!/usr/bin/env node

import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, realpathSync, writeFileSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import { homedir } from 'os';
import https from 'https';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache directory for downloaded script
const cacheDir = join(homedir(), '.cache', 'ipregion-js');
const cachedScriptPath = join(cacheDir, 'ipregion.sh');
const localScriptPath = join(__dirname, 'ipregion.sh');

// Download script from GitHub
async function downloadScript() {
  return new Promise((resolve, reject) => {
    const url = 'https://raw.githubusercontent.com/vernette/ipregion/refs/heads/master/ipregion.sh';
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          // Create cache directory if it doesn't exist
          mkdirSync(cacheDir, { recursive: true });
          
          // Save the script
          writeFileSync(cachedScriptPath, data, { mode: 0o755 });
          // console.error('✓ Downloaded latest ipregion.sh');
          resolve(cachedScriptPath);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

// Get script path based on context
async function getScriptPath(isCLI) {
  if (isCLI) {
    try {
      // Try to download latest version for CLI
      const downloadedPath = await downloadScript();
      return downloadedPath;
    } catch (error) {
      console.error('⚠ Failed to download latest version:', error.message);
      
      // Fall back to cached version if exists
      if (existsSync(cachedScriptPath)) {
        console.error('→ Using cached version');
        return cachedScriptPath;
      }
      
      // Fall back to local version
      if (existsSync(localScriptPath)) {
        console.error('→ Using bundled version');
        return localScriptPath;
      }
      
      throw new Error('No ipregion.sh found');
    }
  } else {
    // For module usage, always use local bundled version
    if (!existsSync(localScriptPath)) {
      throw new Error('ipregion.sh not found in package directory');
    }
    return localScriptPath;
  }
}

// Helper function to run the bash script
function runScript(scriptPath, args) {
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
  
  // Get script path (use local for module)
  const scriptPath = await getScriptPath(false);
  const result = await runScript(scriptPath, args);
  
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
    
    // Get script path (download latest for CLI)
    const scriptPath = await getScriptPath(true);
    
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
      
      const result = await runScript(scriptPath, args);
      
      // Calculate most likely country for CLI JSON output too
      const countryCounts = {};
      
      ['primary', 'custom', 'cdn'].forEach(group => {
        if (result.results && result.results[group]) {
          result.results[group].forEach(service => {
            if (service.ipv4) {
              const countryMatch = service.ipv4.match(/^([A-Z]{2})/);
              if (countryMatch) {
                const country = countryMatch[1];
                countryCounts[country] = (countryCounts[country] || 0) + 1;
              }
            }
            if (service.ipv6) {
              const countryMatch = service.ipv6.match(/^([A-Z]{2})/);
              if (countryMatch) {
                const country = countryMatch[1];
                countryCounts[country] = (countryCounts[country] || 0) + 1;
              }
            }
          });
        }
      });
      
      let mostLikelyCountry = null;
      let maxCount = 0;
      for (const [country, count] of Object.entries(countryCounts)) {
        if (count > maxCount) {
          maxCount = count;
          mostLikelyCountry = country;
        }
      }
      
      result.mostLikelyCountry = mostLikelyCountry;
      console.log(JSON.stringify(result, null, 2));
    } else {
      // For non-JSON output, pass directly to bash script
      const result = await runScript(scriptPath, args);
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
