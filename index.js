#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { access, constants } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPT_PATH = join(__dirname, 'ipregion.sh');

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    verbose: false,
    group: null,
    timeout: null,
    ipv4: false,
    ipv6: false,
    proxy: null,
    interface: null,
    json: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json' || arg === '-j') {
      options.json = true;
    } else if (arg === '--ipv4' || arg === '-4') {
      options.ipv4 = true;
    } else if (arg === '--ipv6' || arg === '-6') {
      options.ipv6 = true;
    } else if (arg === '--group' || arg === '-g') {
      if (i + 1 < args.length) {
        options.group = args[++i];
      }
    } else if (arg === '--timeout' || arg === '-t') {
      if (i + 1 < args.length) {
        options.timeout = parseInt(args[++i]);
      }
    } else if (arg === '--proxy' || arg === '-p') {
      if (i + 1 < args.length) {
        options.proxy = args[++i];
      }
    } else if (arg === '--interface' || arg === '-i') {
      if (i + 1 < args.length) {
        options.interface = args[++i];
      }
    }
  }

  return options;
}

/**
 * Execute ipregion.sh script with given options
 */
async function executeScript(options = {}) {
  // Check if script exists
  try {
    await access(SCRIPT_PATH, constants.R_OK | constants.X_OK);
  } catch (error) {
    throw new Error(`ipregion.sh not found or not executable at ${SCRIPT_PATH}`);
  }

  const args = [];
  
  // Always use JSON output when called as a module
  const isModule = !options.cliMode;
  if (isModule || options.json) {
    args.push('--json');
  }
  
  if (options.verbose) args.push('--verbose');
  if (options.ipv4) args.push('--ipv4');
  if (options.ipv6) args.push('--ipv6');
  if (options.help) args.push('--help');
  
  if (options.group) {
    args.push('--group', options.group);
  }
  
  if (options.timeout) {
    args.push('--timeout', options.timeout.toString());
  }
  
  if (options.proxy) {
    args.push('--proxy', options.proxy);
  }
  
  if (options.interface) {
    args.push('--interface', options.interface);
  }

  return new Promise((resolve, reject) => {
    const process = spawn(SCRIPT_PATH, args, {
      env: { ...process.env },
      shell: false
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('error', (error) => {
      reject(new Error(`Failed to execute ipregion.sh: ${error.message}`));
    });

    process.on('close', (code) => {
      if (code !== 0 && code !== null) {
        if (stderr) {
          reject(new Error(`ipregion.sh failed: ${stderr}`));
        } else {
          reject(new Error(`ipregion.sh exited with code ${code}`));
        }
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Parse JSON output from ipregion.sh
 */
function parseJsonOutput(output) {
  try {
    // Find JSON in output (might have other text before/after)
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`Failed to parse JSON output: ${error.message}`);
  }
}

/**
 * Calculate most likely country from all service results
 */
function calculateMostLikelyCountry(results) {
  const countryCounts = {};
  
  // Count occurrences from all service groups
  ['primary', 'custom', 'cdn'].forEach(group => {
    if (results[group] && Array.isArray(results[group])) {
      results[group].forEach(service => {
        // Get country code from IPv4 and IPv6 results
        ['ipv4', 'ipv6'].forEach(ipType => {
          if (service[ipType] && service[ipType] !== 'null' && service[ipType] !== null) {
            let country = service[ipType];
            
            // For CDN services, extract country code from format like "NL (AMS)"
            if (group === 'cdn') {
              // Extract the first 2 uppercase letters (country code)
              const match = country.match(/^([A-Z]{2})/);
              if (match) {
                country = match[1];
              } else {
                // Skip if we can't extract a valid country code
                return;
              }
            }
            
            // Only count valid 2-letter country codes
            if (/^[A-Z]{2}$/.test(country)) {
              countryCounts[country] = (countryCounts[country] || 0) + 1;
            }
          }
        });
      });
    }
  });
  
  // Find the most common country
  let mostLikely = null;
  let maxCount = 0;
  
  for (const [country, count] of Object.entries(countryCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostLikely = country;
    }
  }
  
  return mostLikely;
}

/**
 * Main ipregion function
 */
export async function ipregion(options = {}) {
  try {
    const output = await executeScript(options);
    const result = parseJsonOutput(output);
    
    // Add most likely country based on all results
    if (result.results) {
      result.mostLikelyCountry = calculateMostLikelyCountry(result.results);
    }
    
    return result;
  } catch (error) {
    throw error;
  }
}

// Export as default too
export default ipregion;

// CLI mode
const args = process.argv || [];
const isCliMode = args[1] === fileURLToPath(import.meta.url);

if (isCliMode) {
  const options = parseArgs(args.slice(2));
  
  if (options.help) {
    console.log(`
IPRegion.js - Node.js wrapper for ipregion.sh

Usage: ipregion [options]

Options:
  -h, --help              Show this help message
  -v, --verbose           Enable verbose output
  -j, --json             Output in JSON format
  -g, --group <group>    Service group (primary, custom, cdn, all)
  -t, --timeout <sec>    Request timeout in seconds
  -4, --ipv4             Test only IPv4
  -6, --ipv6             Test only IPv6
  -p, --proxy <host:port> Use SOCKS5 proxy
  -i, --interface <name>  Use specific network interface

Examples:
  ipregion                     # Check all services
  ipregion --group primary     # Check only GeoIP services
  ipregion --ipv4 --json      # Check IPv4 only, output as JSON
  ipregion --proxy 127.0.0.1:1080  # Use SOCKS5 proxy
`);
    process.exit(0);
  }
  
  // Mark as CLI mode to handle output differently
  options.cliMode = true;
  
  // Execute script directly for CLI mode
  executeScript(options)
    .then(output => {
      // For CLI mode, if not JSON, output as-is
      if (!options.json) {
        console.log(output);
      } else {
        // If JSON mode, add mostLikelyCountry
        try {
          const result = parseJsonOutput(output);
          if (result.results) {
            result.mostLikelyCountry = calculateMostLikelyCountry(result.results);
          }
          console.log(JSON.stringify(result, null, 2));
        } catch (error) {
          // If can't parse, output as-is
          console.log(output);
        }
      }
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}