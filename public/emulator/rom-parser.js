/**
 * N64 ROM Header Parser
 * Parses the first 64 bytes of an N64 ROM to extract game metadata.
 * Handles all three byte orderings: .z64 (big-endian), .n64 (little-endian), .v64 (byte-swapped)
 */
class N64RomParser {

  /**
   * Parse ROM header from an ArrayBuffer (or first 64+ bytes of one)
   * @param {ArrayBuffer} buffer - ROM data (at least 64 bytes)
   * @returns {Object} Parsed header info
   */
  static parse(buffer) {
    const data = new Uint8Array(buffer.slice(0, 64));

    // Detect byte ordering from magic bytes
    const format = this.detectFormat(data);
    const normalized = this.normalize(data, format);
    const view = new DataView(normalized.buffer);

    const internalName = this.readString(normalized, 0x20, 20).trim();
    const gameCode = this.readString(normalized, 0x3B, 4);
    const countryCode = String.fromCharCode(normalized[0x3E]);
    const crc1 = view.getUint32(0x10).toString(16).toUpperCase().padStart(8, '0');
    const crc2 = view.getUint32(0x14).toString(16).toUpperCase().padStart(8, '0');
    const clockRate = view.getUint32(0x04);

    return {
      internalName,
      gameCode,
      countryCode,
      country: this.getCountryName(countryCode),
      crc1,
      crc2,
      crcKey: `${crc1}-${crc2}`,
      clockRate,
      format,
    };
  }

  /**
   * Detect ROM format from first 4 bytes
   */
  static detectFormat(data) {
    const magic = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
    if (magic === 0x80371240) return 'z64'; // Big-endian (native)
    if (magic === 0x40123780) return 'n64'; // Little-endian
    if (magic === 0x37804012) return 'v64'; // Byte-swapped
    return 'unknown';
  }

  /**
   * Normalize ROM header to big-endian (z64 format)
   */
  static normalize(data, format) {
    if (format === 'z64') return new Uint8Array(data);

    const out = new Uint8Array(data.length);
    if (format === 'n64') {
      // Little-endian: reverse each 4-byte word
      for (let i = 0; i < data.length; i += 4) {
        out[i] = data[i + 3];
        out[i + 1] = data[i + 2];
        out[i + 2] = data[i + 1];
        out[i + 3] = data[i];
      }
    } else if (format === 'v64') {
      // Byte-swapped: swap each pair
      for (let i = 0; i < data.length; i += 2) {
        out[i] = data[i + 1];
        out[i + 1] = data[i];
      }
    } else {
      return new Uint8Array(data); // Unknown, return as-is
    }
    return out;
  }

  static readString(data, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
      const c = data[offset + i];
      if (c === 0) break;
      str += String.fromCharCode(c);
    }
    return str;
  }

  static getCountryName(code) {
    const countries = {
      'A': 'Asia', 'B': 'Brazil', 'C': 'China', 'D': 'Germany',
      'E': 'North America', 'F': 'France', 'G': 'Gateway 64 (NTSC)',
      'H': 'Netherlands', 'I': 'Italy', 'J': 'Japan', 'K': 'Korea',
      'L': 'Gateway 64 (PAL)', 'N': 'Canada', 'P': 'Europe (Basic)',
      'S': 'Spain', 'U': 'Australia', 'W': 'Scandinavia', 'X': 'Europe',
      'Y': 'Europe', 'Z': 'Europe',
    };
    return countries[code] || 'Unknown';
  }
}

/**
 * N64 Game Database
 * Maps CRC pairs and internal names to game metadata.
 * This is a curated subset of popular N64 titles — expandable.
 */
class N64GameDB {
  constructor() {
    this.byCrc = {};
    this.byName = {};
    this.loaded = false;
  }

  /**
   * Initialize with the built-in game database
   */
  init() {
    if (this.loaded) return;
    this.loaded = true;

    // Popular N64 titles — CRC1-CRC2 from No-Intro verified dumps
    // Cover art from IGDB via Twitch CDN (images.igdb.com)
    const C = 'https://images.igdb.com/igdb/image/upload/t_cover_big/';
    const games = [
      { crc: 'D6FBA4A8-6D0D3837', name: "Tony Hawk's Pro Skater", year: 2000, genre: 'Sports', cover: C+'co1xhk.jpg' },
      { crc: 'C20A4F28-93E2DA86', name: "Tony Hawk's Pro Skater 2", year: 2001, genre: 'Sports', cover: C+'co1xhl.jpg' },
      { crc: '4EAA3D0E-74757C24', name: 'Super Mario 64', year: 1996, genre: 'Platformer', cover: C+'co2qp5.jpg' },
      { crc: 'EC7011B7-7616D72B', name: 'The Legend of Zelda: Ocarina of Time', year: 1998, genre: 'Action-Adventure', cover: C+'co3p2d.jpg' },
      { crc: 'D6133266-00000000', name: "The Legend of Zelda: Majora's Mask", year: 2000, genre: 'Action-Adventure', cover: C+'co3p2e.jpg' },
      { crc: 'B7F14D68-4B4B7682', name: 'Mario Kart 64', year: 1996, genre: 'Racing', cover: C+'co2pgg.jpg' },
      { crc: 'D62D54B7-EA2E3EEA', name: 'GoldenEye 007', year: 1997, genre: 'FPS', cover: C+'co1y8e.jpg' },
      { crc: 'B58B8CD0-FCEA3B04', name: 'Super Smash Bros.', year: 1999, genre: 'Fighting', cover: C+'co21yv.jpg' },
      { crc: 'A722F8A0-C9B35C7A', name: 'Star Fox 64', year: 1997, genre: 'Shooter', cover: C+'co22fp.jpg' },
      { crc: 'B4B46CA6-C3B325F1', name: 'Banjo-Kazooie', year: 1998, genre: 'Platformer', cover: C+'co1xbg.jpg' },
      { crc: 'CD1A2447-81ECCEC5', name: 'Banjo-Tooie', year: 2000, genre: 'Platformer', cover: C+'co1xbh.jpg' },
      { crc: '3A0DE1B3-7AB82889', name: 'Donkey Kong 64', year: 1999, genre: 'Platformer', cover: C+'co21y3.jpg' },
      { crc: '0DD4ABAB-B5A2A91E', name: 'Paper Mario', year: 2000, genre: 'RPG', cover: C+'co21z5.jpg' },
      { crc: '2B455501-9C0D5252', name: 'Diddy Kong Racing', year: 1997, genre: 'Racing', cover: C+'co21y2.jpg' },
      { crc: '305E199D-3FF97B6D', name: 'Perfect Dark', year: 2000, genre: 'FPS', cover: C+'co21yz.jpg' },
      { crc: 'FF2B5A63-0C3C88A4', name: 'F-Zero X', year: 1998, genre: 'Racing', cover: C+'co22b7.jpg' },
      { crc: 'D82BAD64-36D4A3DE', name: '1080 Snowboarding', year: 1998, genre: 'Sports', cover: C+'co4ght.jpg' },
      { crc: '9EA95858-AF72B618', name: 'Wave Race 64', year: 1996, genre: 'Racing', cover: C+'co22gm.jpg' },
      { crc: 'E4558F66-A3E7C1B7', name: 'Kirby 64: The Crystal Shards', year: 2000, genre: 'Platformer', cover: C+'co21yl.jpg' },
      { crc: '0A12A79F-000000FF', name: 'Conker\'s Bad Fur Day', year: 2001, genre: 'Platformer', cover: C+'co1y7v.jpg' },
      { crc: '492F4A6B-57B3FE29', name: 'Yoshi\'s Story', year: 1997, genre: 'Platformer', cover: C+'co22gq.jpg' },
      { crc: 'CFBB4E6A-7FBACA63', name: 'Excitebike 64', year: 2000, genre: 'Racing', cover: C+'co7chm.jpg' },
      { crc: 'CCC7FBAF-B12A6A64', name: 'Pokémon Snap', year: 1999, genre: 'Photography', cover: C+'co2pql.jpg' },
      { crc: 'CF132959-E25D2418', name: 'Pokémon Stadium', year: 1999, genre: 'Strategy', cover: C+'co21z6.jpg' },
      { crc: '66881024-FCB06E53', name: 'Pokémon Stadium 2', year: 2000, genre: 'Strategy', cover: C+'co21z7.jpg' },
      { crc: 'B6BC0D26-1F073C39', name: 'Turok: Dinosaur Hunter', year: 1997, genre: 'FPS', cover: C+'co2e2h.jpg' },
      { crc: 'B6D5B3A2-AEA15CF9', name: 'Turok 2: Seeds of Evil', year: 1998, genre: 'FPS', cover: C+'co2e2i.jpg' },
      { crc: '2337D219-6F8F69C6', name: 'Jet Force Gemini', year: 1999, genre: 'Shooter', cover: C+'co21yh.jpg' },
      { crc: 'F568D51E-C05E0660', name: 'Blast Corps', year: 1997, genre: 'Action', cover: C+'co6y6p.jpg' },
      { crc: 'C2E9AA9A-3CE7D308', name: 'Pilotwings 64', year: 1996, genre: 'Flight Sim', cover: C+'co22ea.jpg' },
      { crc: '6A471710-06F49BB9', name: 'Doom 64', year: 1997, genre: 'FPS', cover: C+'co5vtf.jpg' },
      { crc: '78A20148-F6E9F715', name: 'Quake 64', year: 1998, genre: 'FPS', cover: C+'co6gxo.jpg' },
      { crc: '9C2B0D31-0CE77AA5', name: 'Bomberman 64', year: 1997, genre: 'Action', cover: C+'co7b0t.jpg' },
    ];

    for (const g of games) {
      this.byCrc[g.crc] = g;

      // Also index by partial name for fuzzy matching
      const key = g.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      this.byName[key] = g;
    }
  }

  /**
   * Look up a game by parsed ROM header
   * @param {Object} header - Output of N64RomParser.parse()
   * @returns {Object|null} Game metadata or null
   */
  lookup(header) {
    this.init();

    // Try CRC match first (most accurate)
    if (this.byCrc[header.crcKey]) {
      return { ...this.byCrc[header.crcKey], matchType: 'crc' };
    }

    // Try internal name fuzzy match
    const nameKey = header.internalName.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, game] of Object.entries(this.byName)) {
      if (key.includes(nameKey) || nameKey.includes(key)) {
        return { ...game, matchType: 'name' };
      }
    }

    // No match — return what we know from the header
    return {
      name: header.internalName || 'Unknown Game',
      year: null,
      genre: null,
      cover: null,
      matchType: 'header',
    };
  }
}

// Export for use
window.N64RomParser = N64RomParser;
window.N64GameDB = N64GameDB;
window.n64GameDB = new N64GameDB();
