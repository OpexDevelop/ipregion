
#!/usr/bin/env node

import { Command } from 'commander';
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { networkInterfaces } from 'os';
import { execSync } from 'child_process';

const SCRIPT_URL = 'https://github.com/opexdevelop/ipregion-js';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

// Service configurations
const PRIMARY_SERVICES = {
  MAXMIND: ['maxmind.com', 'geoip.maxmind.com', '/geoip/v2.1/city/me', 'json'],
  RIPE: ['rdap.db.ripe.net', 'rdap.db.ripe.net', '/ip/{ip}', 'json'],
  IPINFO_IO: ['ipinfo.io', 'ipinfo.io', '/widget/demo/{ip}', 'json'],
  IPREGISTRY: ['ipregistry.co', 'api.ipregistry.co', '/{ip}?hostname=true&key=sb69ksjcajfs4c', 'json'],
  IPAPI_CO: ['ipapi.co', 'ipapi.co', '/{ip}/json', 'json'],
  CLOUDFLARE: ['cloudflare.com', 'www.cloudflare.com', '/cdn-cgi/trace', 'plain'],
  IFCONFIG_CO: ['ifconfig.co', 'ifconfig.co', '/country-iso?ip={ip}', 'plain'],
  IPLOCATION_COM: ['iplocation.com', 'iplocation.com', '', 'custom'],
  COUNTRY_IS: ['country.is', 'api.country.is', '/{ip}', 'json'],
  GEOAPIFY_COM: ['geoapify.com', 'api.geoapify.com', '/v1/ipinfo?&ip={ip}&apiKey=b8568cb9afc64fad861a69edbddb2658', 'json'],
  GEOJS_IO: ['geojs.io', 'get.geojs.io', '/v1/ip/country.json?ip={ip}', 'json'],
  IPAPI_IS: ['ipapi.is', 'api.ipapi.is', '/?q={ip}', 'json'],
  IPBASE_COM: ['ipbase.com', 'api.ipbase.com', '/v2/info?ip={ip}', 'json'],
  IPQUERY_IO: ['ipquery.io', 'api.ipquery.io', '/{ip}', 'json'],
  IP_SB: ['ip.sb', 'api.ip.sb', '/geoip/{ip}', 'json']
};

const PRIMARY_SERVICES_ORDER = [
  'MAXMIND', 'RIPE', 'IPINFO_IO', 'CLOUDFLARE', 'IPREGISTRY',
  'IPAPI_CO', 'IFCONFIG_CO', 'IPLOCATION_COM', 'COUNTRY_IS',
  'GEOAPIFY_COM', 'GEOJS_IO', 'IPAPI_IS', 'IPBASE_COM', 'IPQUERY_IO', 'IP_SB'
];

const CUSTOM_SERVICES = {
  GOOGLE: 'Google',
  TWITCH: 'Twitch',
  CHATGPT: 'ChatGPT',
  NETFLIX: 'Netflix',
  SPOTIFY: 'Spotify',
  REDDIT: 'Reddit',
  REDDIT_GUEST_ACCESS: 'Reddit (Guest Access)',
  YOUTUBE_PREMIUM: 'YouTube Premium',
  GOOGLE_SEARCH_CAPTCHA: 'Google Search Captcha',
  APPLE: 'Apple',
  STEAM: 'Steam',
  TIKTOK: 'Tiktok',
  JETBRAINS: 'JetBrains',
  OOKLA_SPEEDTEST: 'Ookla Speedtest'
};

const CUSTOM_SERVICES_ORDER = [
  'GOOGLE', 'TWITCH', 'CHATGPT', 'NETFLIX', 'SPOTIFY',
  'REDDIT', 'REDDIT_GUEST_ACCESS', 'YOUTUBE_PREMIUM',
  'GOOGLE_SEARCH_CAPTCHA', 'APPLE', 'STEAM', 'TIKTOK',
  'OOKLA_SPEEDTEST', 'JETBRAINS'
];

const CDN_SERVICES = {
  CLOUDFLARE_CDN: 'Cloudflare CDN',
  YOUTUBE_CDN: 'YouTube CDN',
  NETFLIX_CDN: 'Netflix CDN'
};

const CDN_SERVICES_ORDER = ['CLOUDFLARE_CDN', 'YOUTUBE_CDN', 'NETFLIX_CDN'];

const SERVICE_HEADERS = {
  IPREGISTRY: { 'Origin': 'https://ipregistry.co' },
  MAXMIND: { 'Referer': 'https://www.maxmind.com' },
  IP_SB: { 'User-Agent': USER_AGENT }
};

const IDENTITY_SERVICES = [
  'ident.me',
  'ifconfig.me',
  'api64.ipify.org',
  'ifconfig.co'
];

const IPV6_OVER_IPV4_SERVICES = ['IPINFO_IO'];

class IPRegion {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      jsonOutput: options.jsonOutput || false,
      groupsToShow: options.groupsToShow || 'all',
      timeout: options.timeout || 10,
      retries: options.retries || 1,
      ipv4Only: options.ipv4Only || false,
      ipv6Only: options.ipv6Only || false,
      proxyAddr: options.proxyAddr || null,
      interfaceName: options.interfaceName || null
    };

    this.results = {
      primary: [],
      custom: [],
      cdn: []
    };

    this.externalIPv4 = null;
    this.externalIPv6 = null;
    this.asn = null;
    this.asnName = null;
    this.spinner = null;
  }

  log(level, ...args) {
    if (this.options.verbose) {
      const timestamp = new Date().toLocaleString();
      const color = level === 'ERROR' ? chalk.red : level === 'WARN' ? chalk.yellow : chalk.cyan;
      console.error(`[${timestamp}] [${color(level)}]:`, ...args);
    }
  }

  maskIPv4(ip) {
    if (!ip) return '';
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.*.*`;
  }

  maskIPv6(ip) {
    if (!ip) return '';
    const parts = ip.split(':');
    return `${parts[0]}:${parts[1]}:${parts[2]}::`;
  }

  async makeRequest(url, options = {}) {
    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': USER_AGENT,
        ...options.headers
      },
      timeout: this.options.timeout * 1000
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    if (this.options.proxyAddr) {
      fetchOptions.agent = new SocksProxyAgent(`socks5://${this.options.proxyAddr}`);
    }

    try {
      const response = await fetch(url, fetchOptions);
      
      if (response.status === 403 || response.status === 429) {
        return '';
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    } catch (error) {
      this.log('ERROR', `Request failed for ${url}:`, error.message);
      return '';
    }
  }

  async getExternalIP() {
    const service = IDENTITY_SERVICES[Math.floor(Math.random() * IDENTITY_SERVICES.length)];
    
    if (!this.options.ipv6Only) {
      this.log('INFO', 'Getting external IPv4 address');
      this.externalIPv4 = await this.makeRequest(`https://api.ipify.org?format=text`);
      this.log('INFO', 'External IPv4:', this.externalIPv4);
    }

    if (!this.options.ipv4Only && this.checkIPv6Support()) {
      this.log('INFO', 'Getting external IPv6 address');
      this.externalIPv6 = await this.makeRequest(`https://api64.ipify.org?format=text`);
      this.log('INFO', 'External IPv6:', this.externalIPv6);
    }
  }

  checkIPv6Support() {
    const interfaces = networkInterfaces();
    for (const iface of Object.values(interfaces)) {
      for (const addr of iface) {
        if (addr.family === 'IPv6' && !addr.internal) {
          return true;
        }
      }
    }
    return false;
  }

  async getASN() {
    const ip = this.externalIPv4 || this.externalIPv6;
    if (!ip) return;

    this.log('INFO', 'Getting ASN info for IP', ip);
    const response = await this.makeRequest(`https://geoip.oxl.app/api/ip/${ip}`);
    
    if (response && typeof response === 'object') {
      this.asn = response.asn;
      this.asnName = response.organization?.name || '';
      this.log('INFO', 'ASN info:', `AS${this.asn}`, this.asnName);
    }
  }

  async getIATALocation(iataCode) {
    const response = await this.makeRequest('https://www.air-port-codes.com/api/v1/single', {
      method: 'POST',
      headers: {
        'APC-Auth': '96dc04b3fb',
        'Referer': 'https://www.air-port-codes.com/',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `iata=${iataCode}`
    });

    if (response && response.airport) {
      return response.airport.country.iso;
    }
    return '';
  }

  processResponse(service, response) {
    if (!response) return 'N/A';

    const processors = {
      MAXMIND: r => r.country?.iso_code,
      RIPE: r => r.country,
      IPINFO_IO: r => r.data?.country,
      IPREGISTRY: r => r.location?.country?.code,
      IPAPI_CO: r => r.country,
      COUNTRY_IS: r => r.country,
      GEOAPIFY_COM: r => r.country?.iso_code,
      GEOJS_IO: r => r[0]?.country,
      IPAPI_IS: r => r.location?.country_code,
      IPBASE_COM: r => r.data?.location?.country?.alpha2,
      IPQUERY_IO: r => r.location?.country_code,
      IP_SB: r => r.country_code
    };

    const processor = processors[service];
    if (processor && typeof response === 'object') {
      return processor(response) || 'N/A';
    }

    return response || 'N/A';
  }

  async probeService(service, ipVersion, ip) {
    const config = PRIMARY_SERVICES[service];
    if (!config) return 'N/A';

    const [displayName, domain, urlTemplate, responseFormat] = config;
    const url = `https://${domain}${urlTemplate.replace('{ip}', ip)}`;

    if (ipVersion === '6' && IPV6_OVER_IPV4_SERVICES.includes(service)) {
      ipVersion = '4';
    }

    const headers = SERVICE_HEADERS[service] || {};
    const response = await this.makeRequest(url, { headers });

    if (responseFormat === 'plain') {
      return (response || '').trim() || 'N/A';
    }

    return this.processResponse(service, response);
  }

  async lookupCloudflare(ipVersion) {
    const response = await this.makeRequest('https://www.cloudflare.com/cdn-cgi/trace');
    const match = response.match(/loc=([A-Z]{2})/);
    return match ? match[1] : 'N/A';
  }

  async lookupIPLocationCom(ipVersion) {
    const ip = this.externalIPv4 || this.externalIPv6;
    const response = await this.makeRequest('https://iplocation.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `ip=${ip}`
    });
    return response?.country_code || 'N/A';
  }

  async lookupGoogle(ipVersion) {
    const response = await this.makeRequest('https://www.google.com');
    const match = response.match(/"[a-z]{2}_([A-Z]{2})"|"[a-z]{2}-([A-Z]{2})"/);
    return match ? (match[1] || match[2]) : 'N/A';
  }

  async lookupTwitch(ipVersion) {
    const response = await this.makeRequest('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        operationName: "VerifyEmail_CurrentUser",
        variables: {},
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "f9e7dcdf7e99c314c82d8f7f725fab5f99d1df3d7359b53c9ae122deec590198"
          }
        }
      }])
    });
    return response?.[0]?.data?.requestInfo?.countryCode || 'N/A';
  }

  async lookupChatGPT(ipVersion) {
    const response = await this.makeRequest('https://ab.chatgpt.com/v1/initialize', {
      method: 'POST',
      headers: {
        'Statsig-Api-Key': 'client-zUdXdSTygXJdzoE0sWTkP8GKTVsUMF2IRM7ShVO2JAG'
      }
    });
    return response?.derived_fields?.country || 'N/A';
  }

  async lookupNetflix(ipVersion) {
    const response = await this.makeRequest(
      'https://api.fast.com/netflix/speedtest/v2?https=true&token=YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm&urlCount=1'
    );
    return response?.client?.location?.country || 'N/A';
  }

  async lookupSpotify(ipVersion) {
    const response = await this.makeRequest('https://accounts.spotify.com/en/login');
    const match = response.match(/"geoLocationCountryCode":"([^"]+)"/);
    return match ? match[1] : 'N/A';
  }

  async lookupReddit(ipVersion) {
    const basicAuth = 'Basic b2hYcG9xclpZdWIxa2c6';
    const userAgent = 'Reddit/Version 2025.29.0/Build 2529021/Android 13';
    
    const tokenResponse = await this.makeRequest('https://www.reddit.com/auth/v2/oauth/access-token/loid', {
      method: 'POST',
      headers: {
        'Authorization': basicAuth,
        'User-Agent': userAgent,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ scopes: ['email'] })
    });

    if (!tokenResponse?.access_token) return 'N/A';

    const response = await this.makeRequest('https://gql-fed.reddit.com', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenResponse.access_token}`,
        'User-Agent': userAgent,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        operationName: "UserLocation",
        variables: {},
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "f07de258c54537e24d7856080f662c1b1268210251e5789c8c08f20d76cc8ab2"
          }
        }
      })
    });

    return response?.data?.userLocation?.countryCode || 'N/A';
  }

  async lookupRedditGuestAccess(ipVersion) {
    const response = await this.makeRequest('https://www.reddit.com');
    return response ? 'Yes' : 'No';
  }

  async lookupYouTubePremium(ipVersion) {
    const response = await this.makeRequest('https://www.youtube.com/premium', {
      headers: {
        'Cookie': 'SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjUwNzMwLjA1X3AwGgJlbiACGgYIgPC_xAY',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!response) return 'N/A';
    
    const unavailable = response.toLowerCase().includes('youtube premium is not available in your country');
    return unavailable ? 'No' : 'Yes';
  }

  async lookupGoogleSearchCaptcha(ipVersion) {
    const response = await this.makeRequest('https://www.google.com/search?q=cats', {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' }
    });
    
    if (!response) return 'N/A';
    
    const hasCaptcha = /unusual traffic from|is blocked|unaddressed abuse/i.test(response);
    return hasCaptcha ? 'Yes' : 'No';
  }

  async lookupApple(ipVersion) {
    const response = await this.makeRequest('https://gspe1-ssl.ls.apple.com/pep/gcc');
    return response || 'N/A';
  }

  async lookupSteam(ipVersion) {
    const response = await this.makeRequest('https://store.steampowered.com');
    const match = response.match(/"countrycode":"([^"]+)"/);
    return match ? match[1] : 'N/A';
  }

  async lookupTiktok(ipVersion) {
    const response = await this.makeRequest('https://www.tiktok.com/api/v1/web-cookie-privacy/config?appId=1988');
    return response?.body?.appProps?.region || 'N/A';
  }

  async lookupOoklaSpeedtest(ipVersion) {
    const response = await this.makeRequest('https://www.speedtest.net/api/js/config-sdk');
    return response?.location?.countryCode || 'N/A';
  }

  async lookupJetBrains(ipVersion) {
    const response = await this.makeRequest('https://data.services.jetbrains.com/geo');
    return response?.code || 'N/A';
  }

  async lookupCloudflareCDN(ipVersion) {
    const response = await this.makeRequest('https://www.cloudflare.com/cdn-cgi/trace');
    const match = response.match(/colo=([A-Z]{3})/);
    if (!match) return 'N/A';
    
    const iata = match[1];
    const location = await this.getIATALocation(iata);
    return location ? `${location} (${iata})` : iata;
  }

  async lookupYouTubeCDN(ipVersion) {
    const response = await this.makeRequest('https://redirector.googlevideo.com/report_mapping?di=no');
    const match = response.match(/[a-z]{3}\d+-[a-z]{3}/);
    if (!match) return 'N/A';
    
    const iata = match[0].split('-')[1].toUpperCase();
    const location = await this.getIATALocation(iata);
    return location ? `${location} (${iata})` : iata;
  }

  async lookupNetflixCDN(ipVersion) {
    const response = await this.makeRequest(
      'https://api.fast.com/netflix/speedtest/v2?https=true&token=YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm&urlCount=1'
    );
    return response?.targets?.[0]?.location?.country || 'N/A';
  }

  async processService(service, serviceType = 'primary') {
    const displayName = PRIMARY_SERVICES[service]?.[0] || service;
    
    if (this.spinner) {
      this.spinner.text = `Checking: ${displayName}`;
    }

    let ipv4Result = '';
    let ipv6Result = '';

    const customHandlers = {
      CLOUDFLARE: () => this.lookupCloudflare(),
      IPLOCATION_COM: () => this.lookupIPLocationCom()
    };

    if (customHandlers[service]) {
      if (!this.options.ipv6Only && this.externalIPv4) {
        ipv4Result = await customHandlers[service](4);
      }
      if (!this.options.ipv4Only && this.externalIPv6) {
        ipv6Result = await customHandlers[service](6);
      }
    } else {
      if (!this.options.ipv6Only && this.externalIPv4) {
        ipv4Result = await this.probeService(service, 4, this.externalIPv4);
      }
      if (!this.options.ipv4Only && this.externalIPv6) {
        ipv6Result = await this.probeService(service, 6, this.externalIPv6);
      }
    }

    this.results[serviceType].push({
      service: displayName,
      ipv4: ipv4Result || null,
      ipv6: ipv6Result || null
    });
  }

  async processCustomService(service) {
    const displayName = CUSTOM_SERVICES[service] || service;
    
    if (this.spinner) {
      this.spinner.text = `Checking: ${displayName}`;
    }

    const handlers = {
      GOOGLE: () => this.lookupGoogle(),
      TWITCH: () => this.lookupTwitch(),
      CHATGPT: () => this.lookupChatGPT(),
      NETFLIX: () => this.lookupNetflix(),
      SPOTIFY: () => this.lookupSpotify(),
      REDDIT: () => this.lookupReddit(),
      REDDIT_GUEST_ACCESS: () => this.lookupRedditGuestAccess(),
      YOUTUBE_PREMIUM: () => this.lookupYouTubePremium(),
      GOOGLE_SEARCH_CAPTCHA: () => this.lookupGoogleSearchCaptcha(),
      APPLE: () => this.lookupApple(),
      STEAM: () => this.lookupSteam(),
      TIKTOK: () => this.lookupTiktok(),
      OOKLA_SPEEDTEST: () => this.lookupOoklaSpeedtest(),
      JETBRAINS: () => this.lookupJetBrains()
    };

    const handler = handlers[service];
    if (!handler) return;

    let ipv4Result = '';
    let ipv6Result = '';

    if (!this.options.ipv6Only && this.externalIPv4) {
      ipv4Result = await handler(4);
    }
    if (!this.options.ipv4Only && this.externalIPv6) {
      ipv6Result = await handler(6);
    }

    this.results.custom.push({
      service: displayName,
      ipv4: ipv4Result || null,
      ipv6: ipv6Result || null
    });
  }

  async processCDNService(service) {
    const displayName = CDN_SERVICES[service] || service;
    
    if (this.spinner) {
      this.spinner.text = `Checking: ${displayName}`;
    }

    const handlers = {
      CLOUDFLARE_CDN: () => this.lookupCloudflareCDN(),
      YOUTUBE_CDN: () => this.lookupYouTubeCDN(),
      NETFLIX_CDN: () => this.lookupNetflixCDN()
    };

    const handler = handlers[service];
    if (!handler) return;

    const result = await handler(4);
    
    this.results.cdn.push({
      service: displayName,
      ipv4: result || null,
      ipv6: null
    });
  }

  getMostLikelyCountry() {
    const countryCount = {};
    
    // Count countries from all results
    ['primary', 'custom'].forEach(group => {
      this.results[group].forEach(result => {
        ['ipv4', 'ipv6'].forEach(ipType => {
          const country = result[ipType];
          if (country && country !== 'N/A' && country.length === 2) {
            countryCount[country] = (countryCount[country] || 0) + 1;
          }
        });
      });
    });

    // Find most common country
    let mostLikely = null;
    let maxCount = 0;
    
    for (const [country, count] of Object.entries(countryCount)) {
      if (count > maxCount) {
        maxCount = count;
        mostLikely = country;
      }
    }

    return { country: mostLikely, confidence: maxCount };
  }

  async run() {
    if (!this.options.jsonOutput && !this.options.verbose) {
      this.spinner = ora('Initializing...').start();
    }

    try {
      // Get external IPs
      await this.getExternalIP();
      
      // Get ASN info
      await this.getASN();

      // Run services based on group selection
      if (this.options.groupsToShow === 'primary' || this.options.groupsToShow === 'all') {
        for (const service of PRIMARY_SERVICES_ORDER) {
          await this.processService(service, 'primary');
        }
      }

      if (this.options.groupsToShow === 'custom' || this.options.groupsToShow === 'all') {
        for (const service of CUSTOM_SERVICES_ORDER) {
          await this.processCustomService(service);
        }
      }

      if (this.options.groupsToShow === 'cdn' || this.options.groupsToShow === 'all') {
        for (const service of CDN_SERVICES_ORDER) {
          await this.processCDNService(service);
        }
      }

      if (this.spinner) {
        this.spinner.succeed('Complete!');
      }

      return this.getResults();
    } catch (error) {
      if (this.spinner) {
        this.spinner.fail('Error occurred');
      }
      throw error;
    }
  }

  getResults() {
    const mostLikely = this.getMostLikelyCountry();
    
    return {
      version: 1,
      ipv4: this.externalIPv4 || null,
      ipv6: this.externalIPv6 || null,
      asn: this.asn ? `AS${this.asn}` : null,
      asnName: this.asnName || null,
      mostLikelyCountry: mostLikely.country,
      confidence: mostLikely.confidence,
      results: this.results
    };
  }

  printResults(results) {
    if (this.options.jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    // Header
    console.log(chalk.cyan('Made with ') + chalk.red('<3') + chalk.cyan(' by opexdevelop'));
    console.log(chalk.gray(SCRIPT_URL));
    console.log();

    // IP and ASN info
    if (results.ipv4) {
      console.log(chalk.cyan('IPv4:'), chalk.bold(this.maskIPv4(results.ipv4)));
    }
    if (results.ipv6) {
      console.log(chalk.cyan('IPv6:'), chalk.bold(this.maskIPv6(results.ipv6)));
    }
    if (results.asn) {
      console.log(chalk.cyan('ASN:'), chalk.bold(`${results.asn} ${results.asnName || ''}`));
    }
    if (results.mostLikelyCountry) {
      console.log(chalk.cyan('Most Likely Country:'), chalk.bold(`${results.mostLikelyCountry} (confidence: ${results.confidence})`));
    }
    console.log();

    // Tables for each group
    const showIPv4 = !this.options.ipv6Only && results.ipv4;
    const showIPv6 = !this.options.ipv4Only && results.ipv6;

    const printTable = (title, data) => {
      if (!data || data.length === 0) return;

      console.log(chalk.cyan.bold(title));
      console.log();

      const table = new Table({
        head: [
          chalk.white.bold('Service'),
          ...(showIPv4 ? [chalk.white.bold('IPv4')] : []),
          ...(showIPv6 ? [chalk.white.bold('IPv6')] : [])
        ],
        style: {
          head: [],
          border: []
        }
      });

      data.forEach(row => {
        const tableRow = [chalk.green(row.service)];
        
        if (showIPv4) {
          const value = row.ipv4 || 'N/A';
          if (value === 'N/A') {
            tableRow.push(chalk.gray(value));
          } else if (value === 'Yes') {
            tableRow.push(chalk.green.bold(value));
          } else if (value === 'No') {
            tableRow.push(chalk.red.bold(value));
          } else {
            tableRow.push(chalk.bold(value));
          }
        }
        
        if (showIPv6) {
          const value = row.ipv6 || 'N/A';
          if (value === 'N/A') {
            tableRow.push(chalk.gray(value));
          } else if (value === 'Yes') {
            tableRow.push(chalk.green.bold(value));
          } else if (value === 'No') {
            tableRow.push(chalk.red.bold(value));
          } else {
            tableRow.push(chalk.bold(value));
          }
        }
        
        table.push(tableRow);
      });

      console.log(table.toString());
      console.log();
    };

    // Print tables based on group selection
    if (this.options.groupsToShow === 'primary') {
      printTable('GeoIP services', results.results.primary);
    } else if (this.options.groupsToShow === 'custom') {
      printTable('Popular services', results.results.custom);
    } else if (this.options.groupsToShow === 'cdn') {
      printTable('CDN services', results.results.cdn);
    } else {
      printTable('Popular services', results.results.custom);
      printTable('CDN services', results.results.cdn);
      printTable('GeoIP services', results.results.primary);
    }
  }
}

// CLI functionality
async function runCLI() {
  const program = new Command();

  program
    .name('ipregion')
    .description('Determines your IP geolocation using various GeoIP services and popular websites')
    .version('1.0.0')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('-j, --json', 'Output results in JSON format')
    .option('-g, --group <group>', "Run only one group: 'primary', 'custom', 'cdn', or 'all'", 'all')
    .option('-t, --timeout <seconds>', 'Set request timeout in seconds', parseInt, 10)
    .option('-4, --ipv4', 'Test only IPv4')
    .option('-6, --ipv6', 'Test only IPv6')
    .option('-p, --proxy <address>', 'Use SOCKS5 proxy (format: host:port)')
    .option('-i, --interface <name>', 'Use specified network interface')
    .parse(process.argv);

  const options = program.opts();

  // Validate options
  if (options.ipv4 && options.ipv6) {
    console.error(chalk.red('[ERROR]'), 'Cannot use both --ipv4 and --ipv6 options');
    process.exit(1);
  }

  if (options.group && !['primary', 'custom', 'cdn', 'all'].includes(options.group)) {
    console.error(chalk.red('[ERROR]'), `Invalid group: ${options.group}`);
    console.error('Valid groups are: primary, custom, cdn, all');
    process.exit(1);
  }

  if (options.timeout && (isNaN(options.timeout) || options.timeout <= 0)) {
    console.error(chalk.red('[ERROR]'), 'Timeout must be a positive integer');
    process.exit(1);
  }

  const ipregion = new IPRegion({
    verbose: options.verbose,
    jsonOutput: options.json,
    groupsToShow: options.group,
    timeout: options.timeout,
    ipv4Only: options.ipv4,
    ipv6Only: options.ipv6,
    proxyAddr: options.proxy,
    interfaceName: options.interface
  });

  try {
    const results = await ipregion.run();
    ipregion.printResults(results);
  } catch (error) {
    console.error(chalk.red('[ERROR]'), error.message);
    process.exit(1);
  }
}

// Module exports
export default IPRegion;
export { IPRegion };

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI();
}
