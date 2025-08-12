#!/usr/bin/env node

import axios from 'axios';
import chalk from 'chalk';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import ora from 'ora';
import { SocksProxyAgent } from 'socks-proxy-agent';
import http from 'http';
import https from 'https';
import Table from 'cli-table3';

// --- Configuration ---
// This section replicates the service definitions from the original script.
const CONFIG = {
    USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    IDENTITY_SERVICES: ["ident.me", "ifconfig.me", "api64.ipify.org", "ifconfig.co"],
    SERVICES: {
        primary: {
            MAXMIND: { url: "https://geoip.maxmind.com/geoip/v2.1/city/me", path: "country.iso_code", headers: { "Referer": "https://www.maxmind.com" } },
            RIPE: { url: "https://rdap.db.ripe.net/ip/{ip}", path: "country" },
            IPINFO_IO: { url: "https://ipinfo.io/widget/demo/{ip}", path: "data.country" },
            IPREGISTRY: { url: "https://api.ipregistry.co/{ip}?hostname=true&key=sb69ksjcajfs4c", path: "location.country.code", headers: { "Origin": "https://ipregistry.co" } },
            IPAPI_CO: { url: "https://ipapi.co/{ip}/json", path: "country" },
            CLOUDFLARE: { handler: 'lookupCloudflare' },
            IFCONFIG_CO: { url: "https://ifconfig.co/country-iso?ip={ip}", format: 'plain' },
            IPLOCATION_COM: { handler: 'lookupIplocationCom' },
            COUNTRY_IS: { url: "https://api.country.is/{ip}", path: "country" },
            GEOAPIFY_COM: { url: "https://api.geoapify.com/v1/ipinfo?&ip={ip}&apiKey=b8568cb9afc64fad861a69edbddb2658", path: "country.iso_code" },
            GEOJS_IO: { url: "https://get.geojs.io/v1/ip/country.json?ip={ip}", path: "country" },
            IPAPI_IS: { url: "https://api.ipapi.is/?q={ip}", path: "location.country_code" },
            IPBASE_COM: { url: "https://api.ipbase.com/v2/info?ip={ip}", path: "data.location.country.alpha2" },
            IPQUERY_IO: { url: "https://api.ipquery.io/{ip}", path: "location.country_code" },
            IP_SB: { url: "https://api.ip.sb/geoip/{ip}", path: "country_code", headers: { "User-Agent": "Mozilla/5.0" } },
        },
        custom: {
            GOOGLE: { handler: 'lookupGoogle' },
            TWITCH: { handler: 'lookupTwitch' },
            CHATGPT: { handler: 'lookupChatgpt' },
            NETFLIX: { handler: 'lookupNetflix' },
            SPOTIFY: { handler: 'lookupSpotify' },
            REDDIT: { handler: 'lookupReddit' },
            YOUTUBE_PREMIUM: { handler: 'lookupYoutubePremium' },
            GOOGLE_SEARCH_CAPTCHA: { handler: 'lookupGoogleSearchCaptcha' },
            APPLE: { handler: 'lookupApple' },
            STEAM: { handler: 'lookupSteam' },
            TIKTOK: { handler: 'lookupTiktok' },
            OOKLA_SPEEDTEST: { handler: 'lookupOoklaSpeedtest' },
            JETBRAINS: { handler: 'lookupJetbrains' },
        },
        cdn: {
            CLOUDFLARE_CDN: { handler: 'lookupCloudflareCdn' },
            YOUTUBE_CDN: { handler: 'lookupYoutubeCdn' },
            NETFLIX_CDN: { handler: 'lookupNetflixCdn' },
        }
    }
};

// --- Service Handlers ---
// These functions contain the custom logic for specific services.

const serviceHandlers = {
    lookupCloudflare: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://www.cloudflare.com/cdn-cgi/trace", ipVersion, format: 'text' });
        if (!response) return null;
        const match = response.match(/^loc=(.+)$/m);
        return match ? match[1] : null;
    },
    lookupIplocationCom: async (axiosInstance, ipVersion, ip) => {
        const response = await makeRequest(axiosInstance, {
            method: 'POST',
            url: "https://iplocation.com",
            ipVersion,
            data: new URLSearchParams({ ip }).toString(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response?.country_code || null;
    },
    lookupGoogle: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://www.google.com", ipVersion, format: 'text' });
        if (!response) return null;
        const match = response.match(/"[a-z]{2,3}[_-]([A-Z]{2})"/);
        return match ? match[1] : null;
    },
    lookupTwitch: async (axiosInstance, ipVersion) => {
        const payload = [{ "operationName": "VerifyEmail_CurrentUser", "variables": {}, "extensions": { "persistedQuery": { "version": 1, "sha256Hash": "f9e7dcdf7e99c314c82d8f7f725fab5f99d1df3d7359b53c9ae122deec590198" } } }];
        const response = await makeRequest(axiosInstance, {
            method: 'POST',
            url: "https://gql.twitch.tv/gql",
            ipVersion,
            data: payload,
            headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko' }
        });
        return response?.[0]?.data?.requestInfo?.countryCode || null;
    },
    lookupChatgpt: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, {
            method: 'POST',
            url: "https://ab.chatgpt.com/v1/initialize",
            ipVersion,
            headers: { "Statsig-Api-Key": "client-zUdXdSTygXJdzoE0sWTkP8GKTVsUMF2IRM7ShVO2JAG" }
        });
        return response?.derived_fields?.country || null;
    },
    lookupNetflix: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://api.fast.com/netflix/speedtest/v2?https=true&token=YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm&urlCount=1", ipVersion });
        return response?.client?.location?.country || null;
    },
    lookupSpotify: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://accounts.spotify.com/en/login", ipVersion, format: 'text' });
        if (!response) return null;
        const match = response.match(/"geoLocationCountryCode":"([^"]*)"/);
        return match ? match[1] : null;
    },
    lookupReddit: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://www.reddit.com/r/all.json", ipVersion });
        return response?.data?.geo_country_code || null;
    },
    lookupYoutubePremium: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, {
            url: "https://www.youtube.com/premium",
            ipVersion,
            format: 'text',
            headers: { "Accept-Language": "en-US,en;q=0.9" }
        });
        if (!response) return null;
        return response.includes("Premium is not available in your country") ? "No" : "Yes";
    },
    lookupGoogleSearchCaptcha: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://www.google.com/search?q=cats", ipVersion, format: 'text' });
        if (!response) return null;
        return /unusual traffic from|is blocked|unaddressed abuse/i.test(response) ? "Yes" : "No";
    },
    lookupApple: async (axiosInstance, ipVersion) => {
        return await makeRequest(axiosInstance, { url: "https://gspe1-ssl.ls.apple.com/pep/gcc", ipVersion, format: 'text' });
    },
    lookupSteam: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://store.steampowered.com", ipVersion, format: 'text' });
        if (!response) return null;
        const match = response.match(/"countrycode":"([^"]*)"/);
        return match ? match[1] : null;
    },
    lookupTiktok: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://www.tiktok.com/api/v1/web-cookie-privacy/config?appId=1988", ipVersion });
        return response?.body?.appProps?.region || null;
    },
    lookupOoklaSpeedtest: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://www.speedtest.net/api/js/config-sdk", ipVersion });
        return response?.location?.countryCode || null;
    },
    lookupJetbrains: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://data.services.jetbrains.com/geo", ipVersion });
        return response?.code || null;
    },
    getIataLocation: async (axiosInstance, iataCode) => {
        if (!iataCode) return null;
        const response = await makeRequest(axiosInstance, {
            method: 'POST',
            url: "https://www.air-port-codes.com/api/v1/single",
            ipVersion: 4, // This API might be IPv4 only
            data: new URLSearchParams({ iata: iataCode }).toString(),
            headers: {
                "APC-Auth": "96dc04b3fb",
                "Referer": "https://www.air-port-codes.com/",
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });
        return response?.airport?.country?.iso || null;
    },
    lookupCloudflareCdn: async (axiosInstance, ipVersion) => {
        const trace = await makeRequest(axiosInstance, { url: "https://www.cloudflare.com/cdn-cgi/trace", ipVersion, format: 'text' });
        if (!trace) return null;
        const iata = trace.match(/^colo=(.+)$/m)?.[1];
        if (!iata) return null;
        const country = await serviceHandlers.getIataLocation(axiosInstance, iata);
        return country ? `${country} (${iata})` : iata;
    },
    lookupYoutubeCdn: async (axiosInstance, ipVersion) => {
        const report = await makeRequest(axiosInstance, { url: "https://redirector.googlevideo.com/report_mapping?di=no", ipVersion, format: 'text' });
        if (!report) return null;
        const iata = report.split(' ')[2]?.split('-')[1]?.substring(0, 3).toUpperCase();
        if (!iata) return null;
        const country = await serviceHandlers.getIataLocation(axiosInstance, iata);
        return country ? `${country} (${iata})` : iata;
    },
    lookupNetflixCdn: async (axiosInstance, ipVersion) => {
        const response = await makeRequest(axiosInstance, { url: "https://api.fast.com/netflix/speedtest/v2?https=true&token=YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm&urlCount=1", ipVersion });
        return response?.targets?.[0]?.location?.country || null;
    }
};


// --- Core Functions ---

/**
 * A robust wrapper for making HTTP requests with axios.
 * Handles proxies, interface binding, timeouts, and errors.
 */
async function makeRequest(axiosInstance, { method = 'GET', url, ipVersion, data = null, headers = {}, format = 'json' }) {
    const family = ipVersion === 6 ? 6 : 4;
    try {
        const response = await axiosInstance({
            method,
            url,
            data,
            headers: { 'User-Agent': CONFIG.USER_AGENT, ...headers },
            responseType: format === 'json' ? 'json' : 'text',
            family, // Let axios handle IPv4/IPv6 resolution
        });
        return response.data;
    } catch (error) {
        // Suppress errors for cleaner output, as some services will fail.
        return null;
    }
}

/**
 * Retrieves the external IP address.
 */
async function getExternalIP(axiosInstance, ipVersion) {
    const identityService = CONFIG.IDENTITY_SERVICES[Math.floor(Math.random() * CONFIG.IDENTITY_SERVICES.length)];
    return makeRequest(axiosInstance, { url: `https://${identityService}`, ipVersion, format: 'text' });
}

/**
 * Retrieves ASN information.
 */
async function getASN(axiosInstance, ip, ipVersion) {
    const response = await makeRequest(axiosInstance, { url: `https://geoip.oxl.app/api/ip/${ip}`, ipVersion });
    if (!response) return { asn: 'N/A', name: 'N/A' };
    return {
        asn: response.asn || 'N/A',
        name: response.organization?.name || 'N/A'
    };
}

/**
 * Gets a nested property from an object using a string path.
 */
function getPropertyByPath(obj, path) {
    return path.split('.').reduce((o, p) => (o && o[p] != null) ? o[p] : null, obj);
}

/**
 * Calculates the most frequently occurring country code from the results.
 */
function calculateMostProbable(results) {
    const counts = {};
    const allResults = [...results.primary, ...results.custom, ...results.cdn];

    for (const result of allResults) {
        for (const val of [result.ipv4, result.ipv6]) {
            // Only count valid 2-letter country codes
            if (typeof val === 'string' && /^[A-Z]{2}$/.test(val)) {
                counts[val] = (counts[val] || 0) + 1;
            }
        }
    }

    if (Object.keys(counts).length === 0) {
        return { country: 'N/A', count: 0 };
    }

    const mostProbableCountry = Object.entries(counts).reduce((a, b) => b[1] > a[1] ? b : a);

    return {
        country: mostProbableCountry[0],
        count: mostProbableCountry[1]
    };
}

/**
 * Prints the final results to the console in a formatted table.
 */
function printCliOutput(data) {
    const { ipv4, ipv6, asn, results, mostProbable } = data;

    console.log(chalk.gray(`Made with ${chalk.red('<3')} by opexdevelop`));
    console.log(chalk.gray('https://github.com/opexdevelop/ipregion-js\n'));

    if (ipv4) console.log(`${chalk.cyan.bold('IPv4:')} ${chalk.bold(ipv4)}`);
    if (ipv6) console.log(`${chalk.cyan.bold('IPv6:')} ${chalk.bold(ipv6)}`);
    if (asn) console.log(`${chalk.cyan.bold('ASN:')}  ${chalk.bold(`AS${asn.asn} ${asn.name}`)}`);
    if (mostProbable.country !== 'N/A') {
        console.log(`${chalk.cyan.bold('Most Probable Country:')} ${chalk.bold.green(mostProbable.country)} ${chalk.gray(`(found ${mostProbable.count} times)`)}`);
    }
    console.log('');

    const createTable = (title, groupData) => {
        if (!groupData || groupData.length === 0) return;

        const table = new Table({
            head: [chalk.white.bold(title), chalk.white.bold('IPv4'), chalk.white.bold('IPv6')],
            colWidths: [25, 15, 35],
            style: { head: [], border: [] }
        });

        for (const item of groupData) {
            const v4 = item.ipv4 || chalk.gray('N/A');
            const v6 = item.ipv6 || chalk.gray('N/A');
            const coloredV4 = (v4 === 'Yes' || v4 === 'No') ? (v4 === 'Yes' ? chalk.green(v4) : chalk.red(v4)) : v4;
            const coloredV6 = (v6 === 'Yes' || v6 === 'No') ? (v6 === 'Yes' ? chalk.green(v6) : chalk.red(v6)) : v6;
            table.push([chalk.green(item.service), coloredV4, coloredV6]);
        }
        console.log(table.toString());
        console.log('');
    };

    createTable('Popular Services', results.custom);
    createTable('CDN Services', results.cdn);
    createTable('GeoIP Services', results.primary);
}


// --- Main Execution ---

/**
 * The main function that can be called from CLI or as a module.
 */
export async function getIpRegion(options) {
    const spinner = ora({ text: 'Initializing...', color: 'cyan' });
    if (!options.json) {
        spinner.start();
    }

    // Setup network agents for proxy and interface binding
    const agentOptions = {};
    if (options.proxy) {
        agentOptions.agent = new SocksProxyAgent(`socks5://${options.proxy}`);
    } else if (options.interface) {
        agentOptions.httpAgent = new http.Agent({ localAddress: options.interface });
        agentOptions.httpsAgent = new https.Agent({ localAddress: options.interface });
    }

    const axiosInstance = axios.create({
        timeout: options.timeout * 1000,
        ...agentOptions
    });

    // 1. Get External IPs
    spinner.text = 'Detecting external IP addresses...';
    let externalIpv4 = null;
    if (!options.ipv6) {
        externalIpv4 = await getExternalIP(axiosInstance, 4);
    }
    let externalIpv6 = null;
    if (!options.ipv4) {
        // A simple check if IPv6 is likely available
        try {
            await getExternalIP(axiosInstance, 6);
            externalIpv6 = await getExternalIP(axiosInstance, 6);
        } catch (e) {
            externalIpv6 = null;
        }
    }

    // 2. Get ASN Info
    spinner.text = 'Fetching ASN information...';
    const primaryIp = externalIpv4 || externalIpv6;
    const primaryIpVersion = externalIpv4 ? 4 : 6;
    const asnInfo = primaryIp ? await getASN(axiosInstance, primaryIp, primaryIpVersion) : null;

    const results = { primary: [], custom: [], cdn: [] };
    const groupsToRun = options.group === 'all' ? ['primary', 'custom', 'cdn'] : [options.group];

    // 3. Process all services
    for (const group of groupsToRun) {
        for (const [serviceName, serviceConfig] of Object.entries(CONFIG.SERVICES[group])) {
            spinner.text = `Checking: ${serviceName}`;

            let ipv4Result = null;
            if (externalIpv4) {
                if (serviceConfig.handler) {
                    ipv4Result = await serviceHandlers[serviceConfig.handler](axiosInstance, 4, externalIpv4);
                } else {
                    const response = await makeRequest(axiosInstance, { url: serviceConfig.url.replace('{ip}', externalIpv4), ipVersion: 4, headers: serviceConfig.headers, format: serviceConfig.format });
                    ipv4Result = serviceConfig.path ? getPropertyByPath(response, serviceConfig.path) : response;
                }
            }

            let ipv6Result = null;
            if (externalIpv6) {
                if (serviceConfig.handler) {
                    ipv6Result = await serviceHandlers[serviceConfig.handler](axiosInstance, 6, externalIpv6);
                } else {
                    const response = await makeRequest(axiosInstance, { url: serviceConfig.url.replace('{ip}', externalIpv6), ipVersion: 6, headers: serviceConfig.headers, format: serviceConfig.format });
                    ipv6Result = serviceConfig.path ? getPropertyByPath(response, serviceConfig.path) : response;
                }
            }

            results[group].push({
                service: serviceName,
                ipv4: ipv4Result || null,
                ipv6: ipv6Result || null,
            });
        }
    }

    spinner.stop();

    // 4. Finalize and return
    const finalData = {
        ipv4: externalIpv4,
        ipv6: externalIpv6,
        asn: asnInfo,
        mostProbable: calculateMostProbable(results),
        results
    };

    return finalData;
}

// This block runs the script if it's executed directly from the command line.
// It uses yargs to parse arguments.
if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
    const argv = yargs(hideBin(process.argv))
        .usage('Usage: $0 [options]')
        .option('h', { alias: 'help', describe: 'Show this help message' })
        .option('v', { alias: 'verbose', type: 'boolean', describe: 'Enable verbose logging (Not implemented yet)' })
        .option('j', { alias: 'json', type: 'boolean', describe: 'Output results in JSON format' })
        .option('g', { alias: 'group', choices: ['primary', 'custom', 'cdn', 'all'], default: 'all', describe: 'Run only one group of services' })
        .option('t', { alias: 'timeout', type: 'number', default: 10, describe: 'Set curl request timeout in seconds' })
        .option('4', { alias: 'ipv4', type: 'boolean', describe: 'Test only IPv4' })
        .option('6', { alias: 'ipv6', type: 'boolean', describe: 'Test only IPv6' })
        .option('p', { alias: 'proxy', type: 'string', describe: 'Use SOCKS5 proxy (format: host:port)' })
        .option('i', { alias: 'interface', type: 'string', describe: 'Use specified network interface (e.g. eth1)' })
        .epilog('For more information, visit https://github.com/opexdevelop/ipregion-js')
        .help()
        .argv;

    (async () => {
        try {
            const results = await getIpRegion(argv);
            if (argv.json) {
                console.log(JSON.stringify(results, null, 2));
            } else {
                printCliOutput(results);
            }
        } catch (error) {
            console.error(chalk.red.bold('An unexpected error occurred:'), error);
            process.exit(1);
        }
    })();
}

