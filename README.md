# ipregion-js

Node.js ESM wrapper for [ipregion](https://github.com/vernette/ipregion) bash script - determines your IP geolocation using various GeoIP services and popular websites.

## Features

- 🌍 Checks IP geolocation using multiple public GeoIP APIs
- 📺 Results from popular web services (YouTube, Netflix, Twitch, etc.)
- 🔄 Supports both IPv4 and IPv6
- 🔒 SOCKS5 proxy and custom network interface support
- 📊 JSON output with most likely country detection
- 🎨 Color-coded CLI output (when used as command-line tool)
- 📦 ESM module with TypeScript-friendly JSDoc types

## Requirements

- Node.js >= 16.0.0
- Unix-like OS (Linux, macOS, BSD)
- Bash
- Dependencies for ipregion.sh:
  - curl
  - jq
  - util-linux or bsdmainutils (for `column`)

## Installation

### As a global CLI tool

```bash
npm install -g ipregion-js
```

### As a module in your project

```bash
npm install ipregion-js
```

## Usage

### Command Line Interface

After global installation, you can use `ipregion` command directly:

```bash
# Show help message
ipregion --help

# Check all services with default settings
ipregion

# Check only GeoIP services
ipregion --group primary

# Check only popular web services
ipregion --group custom

# Test only IPv4
ipregion --ipv4

# Use SOCKS5 proxy
ipregion --proxy 127.0.0.1:1080

# Output as JSON
ipregion --json
```

### As ESM Module

```javascript
import ipregion from 'ipregion-js';
// or
import { ipregion } from 'ipregion-js';

// Basic usage
const result = await ipregion();
console.log('Your IP:', result.ipv4);
console.log('Most likely country:', result.mostLikelyCountry);

// With options
const result = await ipregion({
  group: 'primary',    // 'primary', 'custom', 'cdn', or 'all'
  ipv4: true,          // Test only IPv4
  timeout: 20,         // Timeout in seconds
  proxy: '127.0.0.1:1080', // SOCKS5 proxy
  verbose: false       // Verbose logging
});

// Process results
result.results.primary.forEach(service => {
  console.log(`${service.service}: ${service.ipv4}`);
});
```

### Example Response

```javascript
{
  "version": 1,
  "ipv4": "181.158.133.39",
  "ipv6": null,
  "mostLikelyCountry": "NL",  // Added by ipregion-js
  "results": {
    "primary": [
      {
        "service": "maxmind.com",
        "ipv4": "EE",
        "ipv6": null
      },
      {
        "service": "ipinfo.io",
        "ipv4": "NL",
        "ipv6": null
      }
      // ... more services
    ],
    "custom": [
      {
        "service": "Google",
        "ipv4": "RU",
        "ipv6": null
      },
      {
        "service": "Netflix",
        "ipv4": "NL",
        "ipv6": null
      }
      // ... more services
    ],
    "cdn": [
      {
        "service": "Cloudflare CDN",
        "ipv4": "NL (AMS)",
        "ipv6": null
      }
      // ... more services
    ]
  }
}
```

## API

### `ipregion(options?: IPRegionOptions): Promise<IPRegionResult>`

Main function to check IP geolocation.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verbose` | boolean | false | Enable verbose logging |
| `group` | string | 'all' | Service group: 'primary', 'custom', 'cdn', or 'all' |
| `timeout` | number | 10 | Curl request timeout in seconds |
| `ipv4` | boolean | false | Test only IPv4 |
| `ipv6` | boolean | false | Test only IPv6 |
| `proxy` | string | - | SOCKS5 proxy (format: host:port) |
| `interface` | string | - | Network interface to use |

#### Returns

Promise that resolves to an object with:
- `version`: API version
- `ipv4`: Your IPv4 address or null
- `ipv6`: Your IPv6 address or null
- `mostLikelyCountry`: Most frequently detected country code
- `results`: Object with service groups ('primary', 'custom', 'cdn')

## Country Codes

The script outputs country codes in ISO 3166-1 alpha-2 format (e.g., RU, US, DE). You can look up the meaning of any country code at: https://www.iso.org/obp/ui/#search/code/

## Service Groups

- **primary**: GeoIP services (MaxMind, IPInfo, Cloudflare, etc.)
- **custom**: Popular websites (Google, Netflix, Twitch, etc.)
- **cdn**: CDN services (Cloudflare CDN, YouTube CDN, Netflix CDN)

## Notes

- The `ipregion.sh` script must be present in the package root
- This package works only on Unix-like systems (Linux, macOS, BSD)
- Windows is not supported due to bash dependency
- The `mostLikelyCountry` field is calculated based on the most frequently appearing country code across all services

## Credits

This is a Node.js wrapper for the original [ipregion](https://github.com/vernette/ipregion) bash script by [@vernette](https://github.com/vernette).

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/opexdevelop/ipregion-js)
- [npm Package](https://www.npmjs.com/package/ipregion-js)
- [Original ipregion Script](https://github.com/vernette/ipregion)