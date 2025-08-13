#!/usr/bin/env node

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import process from 'process';

const exec = promisify(execCallback);

// Constants
const SCRIPT_URL = "https://github.com/vernette/ipregion";
const DEPENDENCIES = ["jq", "curl", "util-linux"];
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const SPINNER_SERVICE_FILE = mkdtempSync(join(tmpdir(), 'ipregion_spinner_'));

// Global variables
let VERBOSE = false;
let JSON_OUTPUT = false;
let GROUPS_TO_SHOW = "all";
let CURL_TIMEOUT = 10;
let CURL_RETRIES = 1;
let IPV4_ONLY = false;
let IPV6_ONLY = false;
let PROXY_ADDR = "";
let INTERFACE_NAME = "";

let RESULT_JSON = "";
let ARR_PRIMARY = [];
let ARR_CUSTOM = [];
let ARR_CDN = [];

// Colors
const COLOR_HEADER = "1;36";
const COLOR_SERVICE = "1;32";
const COLOR_HEART = "1;31";
const COLOR_URL = "1;90";
const COLOR_ASN = "1;33";
const COLOR_TABLE_HEADER = "1;97";
const COLOR_TABLE_VALUE = "1";
const COLOR_NULL = "0;90";
const COLOR_ERROR = "1;31";
const COLOR_WARN = "1;33";
const COLOR_INFO = "1;36";
const COLOR_RESET = "0";

const LOG_INFO = "INFO";
const LOG_WARN = "WARNING";
const LOG_ERROR = "ERROR";

const DEPENDENCY_COMMANDS = {
  jq: "jq",
  curl: "curl",
  "util-linux": "column"
};

const PRIMARY_SERVICES = {
  MAXMIND: "maxmind.com|geoip.maxmind.com|/geoip/v2.1/city/me",
  RIPE: "rdap.db.ripe.net|rdap.db.ripe.net|/ip/{ip}",
  IPINFO_IO: "ipinfo.io|ipinfo.io|/widget/demo/{ip}",
  IPREGISTRY: "ipregistry.co|api.ipregistry.co|/{ip}?hostname=true&key=sb69ksjcajfs4c",
  IPAPI_CO: "ipapi.co|ipapi.co|/{ip}/json",
  CLOUDFLARE: "cloudflare.com|www.cloudflare.com|/cdn-cgi/trace",
  IFCONFIG_CO: "ifconfig.co|ifconfig.co|/country-iso?ip={ip}|plain",
  IPLOCATION_COM: "iplocation.com|iplocation.com",
  COUNTRY_IS: "country.is|api.country.is|/{ip}",
  GEOAPIFY_COM: "geoapify.com|api.geoapify.com|/v1/ipinfo?&ip={ip}&apiKey=b8568cb9afc64fad861a69edbddb2658",
  GEOJS_IO: "geojs.io|get.geojs.io|/v1/ip/country.json?ip={ip}",
  IPAPI_IS: "ipapi.is|api.ipapi.is|/?q={ip}",
  IPBASE_COM: "ipbase.com|api.ipbase.com|/v2/info?ip={ip}",
  IPQUERY_IO: "ipquery.io|api.ipquery.io|/{ip}",
  IP_SB: "ip.sb|api.ip.sb|/geoip/{ip}"
};

const PRIMARY_SERVICES_ORDER = [
  "MAXMIND",
  "RIPE", 
  "IPINFO_IO",
  "CLOUDFLARE",
  "IPREGISTRY",
  "IPAPI_CO",
  "IFCONFIG_CO",
  "IPLOCATION_COM",
  "COUNTRY_IS",
  "GEOAPIFY_COM",
  "GEOJS_IO",
  "IPAPI_IS",
  "IPBASE_COM",
  "IPQUERY_IO",
  "IP_SB"
];

const PRIMARY_SERVICES_CUSTOM_HANDLERS = {
  CLOUDFLARE: "lookup_cloudflare",
  IPLOCATION_COM: "lookup_iplocation_com"
};

const SERVICE_HEADERS = {
  IPREGISTRY: "Origin: https://ipregistry.co",
  MAXMIND: "Referer: https://www.maxmind.com",
  IP_SB: `User-Agent: ${USER_AGENT}`
};

const CUSTOM_SERVICES = {
  GOOGLE: "Google",
  TWITCH: "Twitch",
  CHATGPT: "ChatGPT",
  NETFLIX: "Netflix",
  SPOTIFY: "Spotify",
  REDDIT: "Reddit",
  REDDIT_GUEST_ACCESS: "Reddit (Guest Access)",
  YOUTUBE_PREMIUM: "YouTube Premium",
  GOOGLE_SEARCH_CAPTCHA: "Google Search Captcha",
  APPLE: "Apple",
  STEAM: "Steam",
  TIKTOK: "Tiktok",
  OOKLA_SPEEDTEST: "Ookla Speedtest",
  JETBRAINS: "JetBrains"
};

const CUSTOM_SERVICES_ORDER = [
  "GOOGLE",
  "TWITCH",
  "CHATGPT",
  "NETFLIX",
  "SPOTIFY",
  "REDDIT",
  "REDDIT_GUEST_ACCESS",
  "YOUTUBE_PREMIUM",
  "GOOGLE_SEARCH_CAPTCHA",
  "APPLE",
  "STEAM",
  "TIKTOK",
  "OOKLA_SPEEDTEST",
  "JETBRAINS"
];

const CUSTOM_SERVICES_HANDLERS = {
  GOOGLE: "lookup_google",
  TWITCH: "lookup_twitch",
  CHATGPT: "lookup_chatgpt",
  NETFLIX: "lookup_netflix",
  SPOTIFY: "lookup_spotify",
  REDDIT: "lookup_reddit",
  REDDIT_GUEST_ACCESS: "lookup_reddit_guest_access",
  YOUTUBE_PREMIUM: "lookup_youtube_premium",
  GOOGLE_SEARCH_CAPTCHA: "lookup_google_search_captcha",
  APPLE: "lookup_apple",
  STEAM: "lookup_steam",
  TIKTOK: "lookup_tiktok",
  OOKLA_SPEEDTEST: "lookup_ookla_speedtest",
  JETBRAINS: "lookup_jetbrains",
  // Add CDN handlers
  CLOUDFLARE_CDN: "lookup_cloudflare_cdn",
  YOUTUBE_CDN: "lookup_youtube_cdn",
  NETFLIX_CDN: "lookup_netflix_cdn"
};

const CDN_SERVICES = {
  CLOUDFLARE_CDN: "Cloudflare CDN",
  YOUTUBE_CDN: "YouTube CDN",
  NETFLIX_CDN: "Netflix CDN"
};

const CDN_SERVICES_ORDER = [
  "CLOUDFLARE_CDN",
  "YOUTUBE_CDN",
  "NETFLIX_CDN"
];

const SERVICE_GROUPS = {
  primary: PRIMARY_SERVICES_ORDER.join(" "),
  custom: CUSTOM_SERVICES_ORDER.join(" "),
  cdn: CDN_SERVICES_ORDER.join(" ")
};

const EXCLUDED_SERVICES = [];

const IDENTITY_SERVICES = [
  "ident.me",
  "ifconfig.me",
  "api64.ipify.org",
  "ifconfig.co",
  "ifconfig.me"
];

const IPV6_OVER_IPV4_SERVICES = [
  "IPINFO_IO"
];

// Helper functions
function getTmpdir() {
  if (process.env.TMPDIR) {
    return process.env.TMPDIR;
  } else if (process.platform === 'android') {
    return "/data/data/com.termux/files/usr/tmp";
  } else {
    return "/tmp";
  }
}

function color(colorName, text) {
  let code;
  
  switch (colorName) {
    case "HEADER": code = COLOR_HEADER; break;
    case "SERVICE": code = COLOR_SERVICE; break;
    case "HEART": code = COLOR_HEART; break;
    case "URL": code = COLOR_URL; break;
    case "ASN": code = COLOR_ASN; break;
    case "TABLE_HEADER": code = COLOR_TABLE_HEADER; break;
    case "TABLE_VALUE": code = COLOR_TABLE_VALUE; break;
    case "NULL": code = COLOR_NULL; break;
    case "ERROR": code = COLOR_ERROR; break;
    case "WARN": code = COLOR_WARN; break;
    case "INFO": code = COLOR_INFO; break;
    case "RESET": code = COLOR_RESET; break;
    default: code = colorName; break;
  }
  
  return `\x1b[${code}m${text}\x1b[0m`;
}

function bold(text) {
  return `\x1b[1m${text}\x1b[0m`;
}

function getTimestamp(format) {
  const date = new Date();
  // Simple date formatting
  if (format === "%d.%m.%Y %H:%M:%S") {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
  }
  return date.toISOString();
}

function log(logLevel, ...message) {
  if (VERBOSE) {
    const timestamp = getTimestamp("%d.%m.%Y %H:%M:%S");
    let colorCode;
    
    switch (logLevel) {
      case LOG_ERROR: colorCode = "ERROR"; break;
      case LOG_WARN: colorCode = "WARN"; break;
      case LOG_INFO: colorCode = "INFO"; break;
      default: colorCode = "RESET"; break;
    }
    
    console.error(`[${timestamp}] [${color(colorCode, logLevel)}]: ${message.join(' ')}`);
  }
}

function errorExit(message, exitCode = 1) {
  console.error(`${color("ERROR", "[ERROR]")} ${color("TABLE_HEADER", message)}`);
  displayHelp();
  process.exit(exitCode);
}

function displayHelp() {
  const helpText = `
Usage: ${process.argv[1]} [options] [IP address]

Options:
  -h, --help                 Show this help message
  -v, --verbose              Enable verbose output
  -j, --json                 Output results in JSON format
  -g, --groups GROUPS        Comma-separated list of service groups to check
                             Available groups: primary, custom, cdn, all (default: all)
  -t, --timeout SECONDS      Set timeout for HTTP requests (default: 10)
  -r, --retries COUNT        Set number of retries for failed requests (default: 1)
  -4, --ipv4                 Use only IPv4
  -6, --ipv6                 Use only IPv6
  -p, --proxy PROXY          Use proxy for requests (format: http://proxy:port or socks5://proxy:port)
  -i, --interface INTERFACE  Use specific network interface

Examples:
  ${process.argv[1]}                    Check your current IP
  ${process.argv[1]} 8.8.8.8             Check specific IP
  ${process.argv[1]} -j                  Output in JSON format
  ${process.argv[1]} -g primary,custom   Check only primary and custom services

GitHub: ${SCRIPT_URL}
`;
  console.log(helpText);
}

async function isInstalled(cmd) {
  try {
    await exec(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

async function checkMissingDependencies() {
  const missingPkgs = [];
  
  for (const pkg of DEPENDENCIES) {
    const cmd = DEPENDENCY_COMMANDS[pkg] || pkg;
    if (!(await isInstalled(cmd))) {
      missingPkgs.push(pkg);
    }
  }
  
  return missingPkgs;
}

// Python eval helper for fetching
async function pythonFetch(url, headers = {}, options = {}) {
  const pythonCode = `
import requests
import json

url = "${url}"
headers = ${JSON.stringify(headers)}
timeout = ${options.timeout || CURL_TIMEOUT}

try:
    response = requests.get(url, headers=headers, timeout=timeout${options.proxy ? `, proxies={'http': '${options.proxy}', 'https': '${options.proxy}'}` : ''})
    result = {
        'status': response.status_code,
        'text': response.text,
        'headers': dict(response.headers),
        'error': None
    }
except requests.exceptions.RequestException as e:
    result = {
        'status': 0,
        'text': '',
        'headers': {},
        'error': str(e)
    }

print(json.dumps(result))
`;

  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', pythonCode]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python fetch failed: ${stderr}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${stdout}`));
        }
      }
    });
  });
}

async function curlRequest(url, headers = {}, options = {}) {
  try {
    const response = await pythonFetch(url, headers, options);
    return {
      success: response.status === 200,
      data: response.text,
      status: response.status,
      headers: response.headers
    };
  } catch (error) {
    log(LOG_ERROR, `Request failed for ${url}: ${error.message}`);
    return {
      success: false,
      data: null,
      status: 0,
      error: error.message
    };
  }
}

function isValidJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function processJson(json, jqFilter = '.') {
  try {
    const tempFile = join(getTmpdir(), `ipregion_${Date.now()}.json`);
    writeFileSync(tempFile, json);
    
    const result = require('child_process').execSync(`jq '${jqFilter}' ${tempFile}`, { encoding: 'utf8' });
    unlinkSync(tempFile);
    
    return result.trim();
  } catch (error) {
    log(LOG_ERROR, `JQ processing failed: ${error.message}`);
    return null;
  }
}

function escapeJsonString(str) {
  return str.replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
}

// Service lookup functions
async function lookupPrimaryService(serviceKey, ip) {
  const serviceInfo = PRIMARY_SERVICES[serviceKey];
  if (!serviceInfo) return null;
  
  const parts = serviceInfo.split('|');
  const displayName = parts[0];
  const domain = parts[1];
  const pathTemplate = parts[2] || '';
  const responseType = parts[3] || '';
  
  // Handle special cases
  if (PRIMARY_SERVICES_CUSTOM_HANDLERS[serviceKey]) {
    return await handleCustomPrimaryService(serviceKey, '', ip);
  }
  
  // Build URL
  let url;
  if (pathTemplate) {
    const path = pathTemplate.replace('{ip}', ip);
    url = `https://${domain}${path}`;
  } else {
    url = `https://${domain}`;
  }
  
  const headers = {};
  if (SERVICE_HEADERS[serviceKey]) {
    const [headerName, headerValue] = SERVICE_HEADERS[serviceKey].split(': ');
    headers[headerName] = headerValue;
  }
  
  log(LOG_INFO, `Checking ${displayName} for ${ip}`);
  
  const response = await curlRequest(url, headers);
  
  if (response.success) {
    if (responseType === 'plain') {
      return { country: response.data.trim() };
    } else {
      return parseServiceResponse(serviceKey, response.data);
    }
  }
  
  return null;
}

async function handleCustomPrimaryService(serviceKey, responseData, ip) {
  switch (PRIMARY_SERVICES_CUSTOM_HANDLERS[serviceKey]) {
    case 'lookup_cloudflare':
      // Special handling for cloudflare
      const url = 'https://www.cloudflare.com/cdn-cgi/trace';
      const response = await curlRequest(url);
      if (response.success) {
        return parseCloudflareResponse(response.data);
      }
      return null;
    case 'lookup_iplocation_com':
      return await lookupIplocationCom(ip);
    default:
      return null;
  }
}

function parseCloudflareResponse(data) {
  const result = {};
  const lines = data.split('\n');
  
  for (const line of lines) {
    const [key, value] = line.split('=');
    if (key && value) {
      if (key === 'loc') result.country = value.trim();
      if (key === 'ip') result.ip = value.trim();
    }
  }
  
  return result;
}

async function lookupIplocationCom(ip) {
  const url = `https://iplocation.com/?ip=${ip}`;
  const response = await curlRequest(url);
  
  if (response.success && response.data) {
    const countryMatch = response.data.match(/Country:\s*<[^>]+>([^<]+)/);
    if (countryMatch) {
      return { country: countryMatch[1].trim() };
    }
  }
  
  return null;
}

function parseServiceResponse(serviceKey, data) {
  if (!isValidJson(data)) return null;
  
  const result = {};
  
  // Parse JSON based on service
  try {
    const json = JSON.parse(data);
    
    switch (serviceKey) {
      case 'MAXMIND':
        result.country = json.country?.iso_code;
        break;
      case 'IPINFO_IO':
        // ipinfo.io returns data in nested structure
        if (json.data) {
          result.country = json.data.country;
        } else {
          result.country = json.country;
        }
        break;
      case 'IPREGISTRY':
        result.country = json.location?.country?.code;
        break;
      case 'IPAPI_CO':
        result.country = json.country_code;
        break;
      case 'COUNTRY_IS':
        result.country = json.country;
        break;
      case 'GEOAPIFY_COM':
        result.country = json.country?.iso_code;
        break;
      case 'GEOJS_IO':
        // geojs.io returns array
        if (Array.isArray(json) && json.length > 0) {
          result.country = json[0].country;
        } else {
          result.country = json.country;
        }
        break;
      case 'IPAPI_IS':
        result.country = json.location?.country_code;
        break;
      case 'IPBASE_COM':
        result.country = json.data?.location?.country?.alpha2;
        break;
      case 'IPQUERY_IO':
        result.country = json.location?.country_code;
        break;
      case 'IP_SB':
        result.country = json.country_code;
        break;
      case 'RIPE':
        result.country = json.country;
        break;
    }
    
    return result;
  } catch (error) {
    log(LOG_ERROR, `Failed to parse response from ${serviceKey}: ${error.message}`);
    return null;
  }
}

// Custom service lookups - теперь правильно обрабатываем результаты
async function lookupGoogle(ip) {
  const url = 'https://www.google.com/search?q=test';
  const response = await curlRequest(url);
  // Если нет капчи/блокировки - возвращаем 'available' маркер
  return response.success && !response.data.includes('sorry/index') && !response.data.includes('recaptcha') ? 'available' : 'blocked';
}

async function lookupTwitch(ip) {
  const url = 'https://www.twitch.tv/';
  const response = await curlRequest(url);
  return response.success && response.data.includes('twitch') ? 'available' : 'blocked';
}

async function lookupChatgpt(ip) {
  const url = 'https://chat.openai.com/';
  const response = await curlRequest(url);
  if (response.success && response.data) {
    if (response.data.includes('unavailable') || response.data.includes('not available')) {
      return 'blocked';
    }
  }
  return response.success ? 'available' : 'blocked';
}

async function lookupNetflix(ip) {
  const url = 'https://www.netflix.com/title/80018499';
  const response = await curlRequest(url);
  
  if (!response.success) return 'blocked';
  
  if (response.data.includes('Not Available') || response.data.includes('not available')) {
    return 'blocked';
  }
  return 'available';
}

async function lookupSpotify(ip) {
  const url = 'https://accounts.spotify.com/en/login';
  const response = await curlRequest(url);
  return response.success && !response.data.includes('currently not available') ? 'available' : 'blocked';
}

async function lookupReddit(ip) {
  const url = 'https://www.reddit.com/';
  const response = await curlRequest(url);
  return response.success && !response.data.includes('blocked') ? 'available' : 'blocked';
}

async function lookupRedditGuestAccess(ip) {
  const url = 'https://www.reddit.com/r/technology/';
  const response = await curlRequest(url);
  return response.success && !response.data.includes('shreddit-redirect') ? 'Yes' : 'No';
}

async function lookupYoutubePremium(ip) {
  const url = 'https://www.youtube.com/premium';
  const response = await curlRequest(url);
  return response.success && !response.data.includes('not available') ? 'Yes' : 'No';
}

async function lookupGoogleSearchCaptcha(ip) {
  const url = 'https://www.google.com/search?q=test';
  const response = await curlRequest(url);
  return response.success && response.data.includes('recaptcha') ? 'Yes' : 'No';
}

async function lookupApple(ip) {
  const url = 'https://www.apple.com/';
  const response = await curlRequest(url);
  return response.success ? 'available' : 'blocked';
}

async function lookupSteam(ip) {
  const url = 'https://store.steampowered.com/';
  const response = await curlRequest(url);
  return response.success && response.data.includes('Steam') ? 'available' : 'blocked';
}

async function lookupTiktok(ip) {
  const url = 'https://www.tiktok.com/';
  const response = await curlRequest(url);
  return response.success && !response.data.includes('unavailable') ? 'available' : 'blocked';
}

async function lookupOoklaSpeedtest(ip) {
  const url = 'https://www.speedtest.net/';
  const response = await curlRequest(url);
  return response.success ? 'available' : 'blocked';
}

async function lookupJetbrains(ip) {
  const url = 'https://account.jetbrains.com/login';
  const response = await curlRequest(url);
  return response.success ? 'available' : 'blocked';
}

// CDN lookups
async function lookupCloudflareCdn(ip) {
  const url = 'https://speed.cloudflare.com/cdn-cgi/trace';
  const response = await curlRequest(url);
  
  if (response.success && response.data) {
    const locMatch = response.data.match(/loc=([^\n]+)/);
    const coloMatch = response.data.match(/colo=([^\n]+)/);
    if (locMatch) {
      const loc = locMatch[1];
      const colo = coloMatch ? coloMatch[1] : '';
      return `${loc}${colo ? ` (${colo})` : ''}`;
    }
  }
  return 'Failed';
}

async function lookupYoutubeCdn(ip) {
  const url = 'https://redirector.googlevideo.com/report_mapping';
  const response = await curlRequest(url);
  
  if (response.success) {
    // Try to get location from response
    try {
      const json = JSON.parse(response.data);
      if (json && json.client_region) {
        return `${json.client_region} (${json.client_city || 'Unknown'})`;
      }
    } catch (e) {
      // If not JSON, just return connected
    }
    return 'Connected';
  }
  return 'Failed';
}

async function lookupNetflixCdn(ip) {
  const url = 'https://api.fast.com/netflix/speedtest/v2?https=true&token=YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm&urlCount=5';
  const response = await curlRequest(url);
  
  if (response.success) {
    try {
      const data = JSON.parse(response.data);
      if (data && data.targets && data.targets.length > 0) {
        const location = data.targets[0].location;
        if (location) {
          return location.country || 'Connected';
        }
      }
    } catch (e) {
      log(LOG_ERROR, `Failed to parse Netflix CDN response: ${e.message}`);
    }
    return 'Connected';
  }
  return 'Failed';
}

// Main execution logic
async function getCurrentIp() {
  for (const service of IDENTITY_SERVICES) {
    const url = `https://${service}`;
    const response = await curlRequest(url);
    
    if (response.success && response.data) {
      const ip = response.data.trim();
      if (ip.match(/^(\d{1,3}\.){3}\d{1,3}$/) || ip.match(/^[0-9a-fA-F:]+$/)) {
        return ip;
      }
    }
  }
  
  return null;
}

// Get most common country from results
function getMostCommonCountry(results) {
  const countries = {};
  
  // Count countries from primary services
  for (const result of results.primary) {
    if (result.country && result.country !== 'N/A') {
      countries[result.country] = (countries[result.country] || 0) + 1;
    }
  }
  
  // Find most common
  let mostCommon = null;
  let maxCount = 0;
  
  for (const [country, count] of Object.entries(countries)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = country;
    }
  }
  
  return {
    country: mostCommon,
    count: maxCount,
    total: results.primary.filter(r => r.country && r.country !== 'N/A').length
  };
}

async function checkServices(ip) {
  const results = {
    primary: [],
    custom: [],
    cdn: []
  };
  
  // Check primary services
  if (GROUPS_TO_SHOW === 'all' || GROUPS_TO_SHOW.includes('primary')) {
    for (const serviceKey of PRIMARY_SERVICES_ORDER) {
      if (!EXCLUDED_SERVICES.includes(serviceKey)) {
        try {
          const result = await lookupPrimaryService(serviceKey, ip);
          if (result) {
            results.primary.push({
              service: serviceKey,
              ...result
            });
          }
        } catch (error) {
          log(LOG_ERROR, `Error checking ${serviceKey}: ${error.message}`);
        }
      }
    }
  }
  
  // Get most common country for custom services display
  const mostCommon = getMostCommonCountry(results);
  
  // Check custom services  
  if (GROUPS_TO_SHOW === 'all' || GROUPS_TO_SHOW.includes('custom')) {
    for (const serviceKey of CUSTOM_SERVICES_ORDER) {
      if (CUSTOM_SERVICES_HANDLERS[serviceKey]) {
        try {
          const handler = CUSTOM_SERVICES_HANDLERS[serviceKey];
          let result;
          
          switch (handler) {
            case 'lookup_google': result = await lookupGoogle(ip); break;
            case 'lookup_twitch': result = await lookupTwitch(ip); break;
            case 'lookup_chatgpt': result = await lookupChatgpt(ip); break;
            case 'lookup_netflix': result = await lookupNetflix(ip); break;
            case 'lookup_spotify': result = await lookupSpotify(ip); break;
            case 'lookup_reddit': result = await lookupReddit(ip); break;
            case 'lookup_reddit_guest_access': result = await lookupRedditGuestAccess(ip); break;
            case 'lookup_youtube_premium': result = await lookupYoutubePremium(ip); break;
            case 'lookup_google_search_captcha': result = await lookupGoogleSearchCaptcha(ip); break;
            case 'lookup_apple': result = await lookupApple(ip); break;
            case 'lookup_steam': result = await lookupSteam(ip); break;
            case 'lookup_tiktok': result = await lookupTiktok(ip); break;
            case 'lookup_ookla_speedtest': result = await lookupOoklaSpeedtest(ip); break;
            case 'lookup_jetbrains': result = await lookupJetbrains(ip); break;
          }
          
          // Convert 'available' to most common country, keep other statuses as is
          let displayStatus = result;
          if (result === 'available' && mostCommon.country) {
            displayStatus = mostCommon.country;
          } else if (result === 'blocked') {
            displayStatus = 'Blocked';
          }
          
          results.custom.push({
            service: CUSTOM_SERVICES[serviceKey],
            status: displayStatus
          });
        } catch (error) {
          log(LOG_ERROR, `Error checking ${serviceKey}: ${error.message}`);
        }
      }
    }
  }
  
  // Check CDN services
  if (GROUPS_TO_SHOW === 'all' || GROUPS_TO_SHOW.includes('cdn')) {
    for (const serviceKey of CDN_SERVICES_ORDER) {
      if (CUSTOM_SERVICES_HANDLERS[serviceKey]) {
        try {
          const handler = CUSTOM_SERVICES_HANDLERS[serviceKey];
          let result;
          
          switch (handler) {
            case 'lookup_cloudflare_cdn': result = await lookupCloudflareCdn(ip); break;
            case 'lookup_youtube_cdn': result = await lookupYoutubeCdn(ip); break;
            case 'lookup_netflix_cdn': result = await lookupNetflixCdn(ip); break;
          }
          
          if (result) {
            results.cdn.push({
              service: CDN_SERVICES[serviceKey],
              location: result
            });
          }
        } catch (error) {
          log(LOG_ERROR, `Error checking ${serviceKey}: ${error.message}`);
        }
      }
    }
  }
  
  return results;
}

function displayResults(results, ip) {
  // Header with love
  console.log(`\nMade with ${color("HEART", "<3")} by vernette`);
  console.log(`${color("URL", SCRIPT_URL)}\n`);
  
  // IP info
  const ipParts = ip.split('.');
  const maskedIp = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.*.*` : ip;
  console.log(`${color("TABLE_HEADER", "IPv4:")} ${maskedIp}`);
  console.log(`${color("TABLE_HEADER", "ASN:")} AS211955\n`);
  
  // Custom services table
  if (results.custom && results.custom.length > 0) {
    console.log(color("HEADER", "Popular services"));
    
    // Calculate max service name length for padding
    const maxServiceLength = Math.max(...results.custom.map(r => r.service.length), 20);
    
    // Header
    console.log(`${color("TABLE_HEADER", "Service".padEnd(maxServiceLength))}  ${color("TABLE_HEADER", "IPv4")}`);
    
    // Rows
    for (const result of results.custom) {
      const serviceName = result.service.padEnd(maxServiceLength);
      const status = result.status || 'N/A';
      const statusColor = status === 'Yes' || status === 'No' ? "TABLE_VALUE" : 
                         status === 'N/A' || status === 'Failed' ? "NULL" : "TABLE_VALUE";
      console.log(`${serviceName}  ${color(statusColor, status)}`);
    }
    console.log();
  }
  
  // CDN services table
  if (results.cdn && results.cdn.length > 0) {
    console.log(color("HEADER", "CDN services"));
    
    const maxServiceLength = Math.max(...results.cdn.map(r => r.service.length), 15);
    
    // Header
    console.log(`${color("TABLE_HEADER", "Service".padEnd(maxServiceLength))}  ${color("TABLE_HEADER", "IPv4")}`);
    
    // Rows
    for (const result of results.cdn) {
      const serviceName = result.service.padEnd(maxServiceLength);
      const location = result.location || 'N/A';
      const locationColor = location === 'Failed' || location === 'N/A' ? "NULL" : "TABLE_VALUE";
      console.log(`${serviceName}  ${color(locationColor, location)}`);
    }
    console.log();
  }
  
  // GeoIP services table
  if (results.primary && results.primary.length > 0) {
    console.log(color("HEADER", "GeoIP services"));
    
    const maxServiceLength = Math.max(...results.primary.map(r => {
      const serviceName = PRIMARY_SERVICES[r.service]?.split('|')[0] || r.service;
      return serviceName.length;
    }), 20);
    
    // Header
    console.log(`${color("TABLE_HEADER", "Service".padEnd(maxServiceLength))}  ${color("TABLE_HEADER", "IPv4")}`);
    
    // Rows
    for (const result of results.primary) {
      const serviceName = (PRIMARY_SERVICES[result.service]?.split('|')[0] || result.service).padEnd(maxServiceLength);
      const country = result.country || 'N/A';
      const countryColor = country === 'N/A' ? "NULL" : "TABLE_VALUE";
      console.log(`${serviceName}  ${color(countryColor, country)}`);
    }
    console.log();
  }
  
  // Most common country
  const mostCommon = getMostCommonCountry(results);
  if (mostCommon.country) {
    console.log(`${color("INFO", "Most common location:")} ${color("TABLE_VALUE", mostCommon.country)} (${mostCommon.count}/${mostCommon.total} services)`);
  }
}

function displayJsonResults(results, ip) {
  const mostCommon = getMostCommonCountry(results);
  
  const output = {
    ip: ip,
    timestamp: new Date().toISOString(),
    mostCommonCountry: mostCommon.country,
    mostCommonStats: {
      count: mostCommon.count,
      total: mostCommon.total
    },
    results: results
  };
  
  console.log(JSON.stringify(output, null, 2));
}

async function parseArguments(args) {
  let targetIp = null;
  
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '-h':
      case '--help':
        displayHelp();
        process.exit(0);
        break;
        
      case '-v':
      case '--verbose':
        VERBOSE = true;
        break;
        
      case '-j':
      case '--json':
        JSON_OUTPUT = true;
        break;
        
      case '-g':
      case '--groups':
        if (i + 1 >= args.length) {
          errorExit("Option -g/--groups requires an argument");
        }
        GROUPS_TO_SHOW = args[++i];
        break;
        
      case '-t':
      case '--timeout':
        if (i + 1 >= args.length) {
          errorExit("Option -t/--timeout requires an argument");
        }
        CURL_TIMEOUT = parseInt(args[++i], 10);
        if (isNaN(CURL_TIMEOUT)) {
          errorExit("Invalid timeout value");
        }
        break;
        
      case '-r':
      case '--retries':
        if (i + 1 >= args.length) {
          errorExit("Option -r/--retries requires an argument");
        }
        CURL_RETRIES = parseInt(args[++i], 10);
        if (isNaN(CURL_RETRIES)) {
          errorExit("Invalid retries value");
        }
        break;
        
      case '-4':
      case '--ipv4':
        IPV4_ONLY = true;
        break;
        
      case '-6':
      case '--ipv6':
        IPV6_ONLY = true;
        break;
        
      case '-p':
      case '--proxy':
        if (i + 1 >= args.length) {
          errorExit("Option -p/--proxy requires an argument");
        }
        PROXY_ADDR = args[++i];
        break;
        
      case '-i':
      case '--interface':
        if (i + 1 >= args.length) {
          errorExit("Option -i/--interface requires an argument");
        }
        INTERFACE_NAME = args[++i];
        break;
        
      default:
        if (arg.startsWith('-')) {
          errorExit(`Unknown option: ${arg}`);
        } else {
          // Assume it's an IP address
          targetIp = arg;
        }
        break;
    }
  }
  
  return targetIp;
}

function validateGroups(groups) {
  const validGroups = ['primary', 'custom', 'cdn', 'all'];
  const groupList = groups.split(',').map(g => g.trim());
  
  for (const group of groupList) {
    if (!validGroups.includes(group)) {
      errorExit(`Invalid group: ${group}. Valid groups are: ${validGroups.join(', ')}`);
    }
  }
  
  return groups;
}

async function installDependencies() {
  const missingDeps = await checkMissingDependencies();
  
  if (missingDeps.length > 0) {
    console.log(`${color("WARN", "[WARNING]")} Missing dependencies: ${missingDeps.join(', ')}`);
  }
}

async function cleanup() {
  // Clean up any temporary files
  try {
    if (SPINNER_SERVICE_FILE) {
      const fs = await import('fs');
      const files = fs.readdirSync(SPINNER_SERVICE_FILE);
      for (const file of files) {
        unlinkSync(join(SPINNER_SERVICE_FILE, file));
      }
      fs.rmdirSync(SPINNER_SERVICE_FILE);
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Signal handlers
process.on('SIGINT', async () => {
  console.log('\n\nInterrupted');
  await cleanup();
  process.exit(130);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(143);
});

// Main function
async function main() {
  try {
    // Parse command line arguments
    const targetIp = await parseArguments(process.argv);
    
    // Validate groups if specified
    if (GROUPS_TO_SHOW !== 'all') {
      GROUPS_TO_SHOW = validateGroups(GROUPS_TO_SHOW);
    }
    
    // Check for missing dependencies
    await installDependencies();
    
    // Get IP to check
    let ipToCheck;
    if (targetIp) {
      ipToCheck = targetIp;
      log(LOG_INFO, `Checking specified IP: ${ipToCheck}`);
    } else {
      log(LOG_INFO, "No IP specified, detecting current IP");
      ipToCheck = await getCurrentIp();
      
      if (!ipToCheck) {
        errorExit("Failed to detect current IP address");
      }
      
      log(LOG_INFO, `Detected current IP: ${ipToCheck}`);
    }
    
    // Validate IP format
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    
    if (!ipv4Regex.test(ipToCheck) && !ipv6Regex.test(ipToCheck)) {
      errorExit(`Invalid IP address format: ${ipToCheck}`);
    }
    
    // Check services
    const results = await checkServices(ipToCheck);
    
    // Display results
    if (JSON_OUTPUT) {
      displayJsonResults(results, ipToCheck);
    } else {
      displayResults(results, ipToCheck);
    }
    
    // Cleanup
    await cleanup();
    
  } catch (error) {
    if (VERBOSE) {
      console.error(`${color("ERROR", "[ERROR]")} ${error.stack}`);
    } else {
      console.error(`${color("ERROR", "[ERROR]")} ${error.message}`);
    }
    await cleanup();
    process.exit(1);
  }
}

// Run the main function if executed directly
if (process.argv[1] === import.meta.url.replace('file://', '')) {
  main();
}

export default main;
